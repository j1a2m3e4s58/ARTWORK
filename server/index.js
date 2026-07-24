import 'dotenv/config';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, save, newId, now } from './db.js';
import { sendEmail } from './email.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const uploadDir = path.join(here, 'uploads');
mkdirSync(uploadDir, { recursive: true });
const port = Number(process.env.API_PORT || 43130);
const host = process.env.API_HOST || '127.0.0.1';
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set in .env and contain at least 32 characters.');
}

const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.APP_ORIGIN || 'http://127.0.0.1:43127', credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(uploadDir));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, `${newId()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/|^video\//.test(file.mimetype)),
});

const publicRead = new Set(['Artwork', 'BlogPost', 'Quote', 'ShopProduct', 'SiteContent', 'Testimonial', 'Video']);
const authenticatedCreate = new Set(['CommissionRequest', 'Message', 'NewsletterSubscriber']);
const hiddenUserFields = ({ passwordHash, ...user }) => user;

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role }, jwtSecret, { expiresIn: '7d' });
}

function setSession(res, user) {
  res.cookie('atelier_session', sign(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function readUser(req) {
  try {
    const token = req.cookies.atelier_session;
    if (!token) return null;
    const payload = jwt.verify(token, jwtSecret);
    return db.data.User.find(user => user.id === payload.id) || null;
  } catch {
    return null;
  }
}

function requireUser(req, res, next) {
  req.user = readUser(req);
  if (!req.user) return res.status(401).json({ error: 'Please log in to continue.' });
  next();
}

function requireAdmin(req, res, next) {
  req.user = readUser(req);
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Administrator access required.' });
  next();
}

async function ensureSeeds() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword && !db.data.User.some(user => user.email === adminEmail)) {
    db.data.User.push({
      id: newId(), email: adminEmail, full_name: 'Studio Administrator',
      passwordHash: await bcrypt.hash(adminPassword, 12), role: 'admin',
      status: 'active', created_date: now(),
    });
  }
  if (!db.data.Quote.length) {
    const quotes = [
      ['Art enables us to find ourselves and lose ourselves at the same time.', 'Thomas Merton'],
      ['Creativity takes courage.', 'Henri Matisse'],
      ['Every artist was first an amateur.', 'Ralph Waldo Emerson'],
      ['A picture is a poem without words.', 'Horace'],
      ['Art washes away from the soul the dust of everyday life.', 'Pablo Picasso'],
      ['The aim of art is to represent not the outward appearance, but inward significance.', 'Aristotle'],
      ['Where words end, art begins.', 'Anonymous'],
      ['An empty canvas is an invitation to become fearless.', 'Anonymous'],
      ['Great art awakens something within us.', 'Anonymous'],
      ['The artist sees possibility where others see only space.', 'Anonymous'],
    ];
    db.data.Quote = quotes.map(([text, author]) => ({ id: newId(), text, author, active: true, created_date: now() }));
  }
  await save();
}
await ensureSeeds();

app.get('/api/health', (_req, res) => res.json({ ok: true, database: 'ready', email: Boolean(process.env.SMTP_HOST) }));

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const fullName = String(req.body.full_name || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 10) return res.status(400).json({ error: 'Password must contain at least 10 characters.' });
  if (db.data.User.some(user => user.email === email)) return res.status(409).json({ error: 'An account with this email already exists.' });
  const user = {
    id: newId(), email, full_name: fullName || email.split('@')[0],
    passwordHash: await bcrypt.hash(password, 12), role: 'customer',
    status: 'active', created_date: now(),
  };
  db.data.User.push(user);
  await save();
  setSession(res, user);
  res.status(201).json(hiddenUserFields(user));
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = db.data.User.find(item => item.email === email);
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  if (user.status === 'suspended') return res.status(403).json({ error: 'This account is suspended.' });
  setSession(res, user);
  res.json(hiddenUserFields(user));
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('atelier_session');
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = readUser(req);
  res.json(user ? hiddenUserFields(user) : null);
});

app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = db.data.User.find(item => item.email === email);
  if (user) {
    const token = jwt.sign({ id: user.id, purpose: 'reset' }, jwtSecret, { expiresIn: '30m' });
    db.data.passwordResetTokens.push({ id: newId(), userId: user.id, token, created_date: now() });
    await save();
    const url = `${process.env.APP_ORIGIN || 'http://127.0.0.1:43127'}/reset-password?token=${encodeURIComponent(token)}`;
    await sendEmail({ to: user.email, subject: 'Reset your Reigns Atelier password', text: `Reset your password: ${url}` });
  }
  res.json({ success: true });
});

app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  try {
    const payload = jwt.verify(String(req.body.token || ''), jwtSecret);
    if (payload.purpose !== 'reset') throw new Error();
    const user = db.data.User.find(item => item.id === payload.id);
    if (!user) throw new Error();
    user.passwordHash = await bcrypt.hash(String(req.body.password || ''), 12);
    db.data.passwordResetTokens = db.data.passwordResetTokens.filter(item => item.userId !== user.id);
    await save();
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: 'This reset link is invalid or expired.' });
  }
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 10) return res.status(400).json({ error: 'Temporary password must contain at least 10 characters.' });
  if (db.data.User.some(user => user.email === email)) return res.status(409).json({ error: 'That user already exists.' });
  const user = {
    id: newId(), email, full_name: String(req.body.full_name || '').trim(),
    passwordHash: await bcrypt.hash(password, 12),
    role: ['customer', 'editor', 'support', 'admin'].includes(req.body.role) ? req.body.role : 'customer',
    status: 'active', created_date: now(), invitedBy: req.user.id,
  };
  db.data.User.push(user);
  await save();
  const delivery = await sendEmail({
    to: email,
    subject: 'Your Reigns Atelier account',
    text: `An account was created for you. Sign in at ${process.env.APP_ORIGIN}/login with your email and temporary password: ${password}`,
  });
  res.status(201).json({ ...hiddenUserFields(user), delivery });
});

app.get('/api/entities/:name', (req, res) => {
  const { name } = req.params;
  if (!Array.isArray(db.data[name])) return res.status(404).json({ error: 'Unknown entity.' });
  const user = readUser(req);
  if (!publicRead.has(name) && user?.role !== 'admin') return res.status(403).json({ error: 'Administrator access required.' });
  let records = [...db.data[name]];
  for (const [key, value] of Object.entries(req.query)) {
    if (key !== 'sort' && key !== 'limit') records = records.filter(record => String(record[key]) === String(value));
  }
  const sort = req.query.sort;
  if (sort) {
    const desc = sort.startsWith('-');
    const key = desc ? sort.slice(1) : sort;
    records.sort((a, b) => String(a[key] || '').localeCompare(String(b[key] || '')) * (desc ? -1 : 1));
  }
  if (req.query.limit) records = records.slice(0, Number(req.query.limit));
  if (name === 'User') records = records.map(hiddenUserFields);
  res.json(records);
});

app.post('/api/entities/:name', async (req, res) => {
  const { name } = req.params;
  if (!Array.isArray(db.data[name])) return res.status(404).json({ error: 'Unknown entity.' });
  const user = readUser(req);
  const admin = user?.role === 'admin';
  if (!admin && !authenticatedCreate.has(name)) return res.status(403).json({ error: 'Administrator access required.' });
  if (authenticatedCreate.has(name) && !user) return res.status(401).json({ error: 'Please log in to continue.' });
  const record = { ...req.body, id: newId(), created_date: now() };
  if (user) {
    record.userId ||= user.id;
    record.accountEmail ||= user.email;
    if (name === 'Message') record.email = user.email;
  }
  db.data[name].push(record);
  await save();
  res.status(201).json(record);
});

app.post('/api/email/send', requireUser, async (req, res) => {
  const subject = String(req.body.subject || 'Reigns Atelier').slice(0, 160);
  const text = String(req.body.text || req.body.body || '').slice(0, 10000);
  const delivery = await sendEmail({ to: req.user.email, subject, text });
  db.data.Outbox.push({ id: newId(), to: req.user.email, subject, text, delivery, created_date: now() });
  await save();
  res.json(delivery);
});

app.patch('/api/entities/:name/:id', requireAdmin, async (req, res) => {
  const records = db.data[req.params.name];
  const record = records?.find(item => item.id === req.params.id);
  if (!record) return res.status(404).json({ error: 'Record not found.' });
  Object.assign(record, req.body, { updated_date: now() });
  await save();
  res.json(req.params.name === 'User' ? hiddenUserFields(record) : record);
});

app.delete('/api/entities/:name/:id', requireAdmin, async (req, res) => {
  const records = db.data[req.params.name];
  if (!records) return res.status(404).json({ error: 'Unknown entity.' });
  db.data[req.params.name] = records.filter(item => item.id !== req.params.id);
  await save();
  res.json({ success: true });
});

app.post('/api/messages/:id/reply', requireAdmin, async (req, res) => {
  const message = db.data.Message.find(item => item.id === req.params.id);
  if (!message) return res.status(404).json({ error: 'Message not found.' });
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Reply cannot be empty.' });
  const delivery = await sendEmail({ to: message.email, subject: `Re: ${message.subject || 'Your message to Reigns Atelier'}`, text });
  message.reply = { text, sentAt: now(), delivery };
  message.status = 'replied';
  await save();
  res.json(message);
});

app.post('/api/upload', requireUser, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a supported image or video.' });
  res.status(201).json({ file_url: `/uploads/${req.file.filename}` });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(root, 'dist')));
  app.use((req, res, next) => {
    if (req.method === 'GET') return res.sendFile(path.join(root, 'dist', 'index.html'));
    next();
  });
}

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'The server could not complete this request.' });
});

app.listen(port, host, () => console.log(`Reigns Atelier API listening on http://${host}:${port}`));
