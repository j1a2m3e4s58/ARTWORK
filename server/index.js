import 'dotenv/config';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { fileTypeFromBuffer } from 'file-type';
import { db, save, newId, now, backupDatabase, databaseKind, closeDatabase } from './db.js';
import { sendEmail } from './email.js';
import { validateEntity } from './validation.js';
import { storageProvider, storeFile } from './storage.js';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

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
app.set('trust proxy', 1);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  strictTransportSecurity: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      mediaSrc: ["'self'", 'https:'],
      frameSrc: ["'self'", 'https://www.youtube.com', 'https://player.vimeo.com'],
      connectSrc: ["'self'", 'https://api.cloudinary.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:'],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
}));
const allowedOrigins = (process.env.APP_ORIGIN || 'http://127.0.0.1:43127').split(',').map(origin => origin.trim());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(uploadDir));
app.use((req, res, next) => {
  req.requestId = req.get('x-request-id') || newId();
  res.setHeader('x-request-id', req.requestId);
  const startedAt = Date.now();
  res.on('finish', () => {
    if (process.env.LOG_REQUESTS === 'true' || res.statusCode >= 400) {
      console.log(JSON.stringify({
        level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        event: 'http_request', requestId: req.requestId, method: req.method,
        path: req.path, status: res.statusCode, durationMs: Date.now() - startedAt,
      }));
    }
  });
  next();
});

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true });
const mutationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: true });
const publicFormLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true });
const limitPublicForms = (req, res, next) => (
  ['Message', 'CommissionRequest', 'NewsletterSubscriber', 'Order'].includes(req.params.name)
    ? publicFormLimiter(req, res, next)
    : next()
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const publicRead = new Set(['Artwork', 'BlogPost', 'Quote', 'ShopProduct', 'SiteContent', 'Testimonial', 'Video']);
const authenticatedCreate = new Set(['CommissionRequest', 'Message', 'Order']);
const staffRoles = new Set(['admin', 'editor', 'support']);
const contentEntities = new Set(['Artwork', 'BlogPost', 'Quote', 'ShopProduct', 'SiteContent', 'Testimonial', 'Video']);
const supportEntities = new Set(['CommissionRequest', 'Message', 'Order']);
const hiddenUserFields = ({ passwordHash, mfaSecret, pendingMfaSecret, ...user }) => user;
const hashToken = token => createHash('sha256').update(token).digest('hex');
const token = () => randomBytes(32).toString('hex');
const secureCookie = process.env.NODE_ENV === 'production';
const encryptionKey = createHash('sha256').update(jwtSecret).digest();

function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${encrypted.toString('hex')}`;
}

function decrypt(value) {
  const [iv, tag, encrypted] = String(value).split('.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'hex')), decipher.final()]).toString('utf8');
}

function safeEqual(a, b) {
  const first = Buffer.from(String(a || ''));
  const second = Buffer.from(String(b || ''));
  return first.length === second.length && timingSafeEqual(first, second);
}

function canManage(user, entity) {
  if (user?.role === 'admin') return true;
  if (user?.role === 'editor') return contentEntities.has(entity);
  if (user?.role === 'support') return supportEntities.has(entity);
  return false;
}

async function audit(user, action, entity, entityId, details = {}) {
  db.data.AuditLog.push({
    id: newId(), actorId: user?.id || null, actorEmail: user?.email || 'system',
    action, entity, entityId, details, created_date: now(),
  });
}

function sign(user) {
  return jwt.sign({ id: user.id, version: user.sessionVersion || 0 }, jwtSecret, { expiresIn: '7d' });
}

function setSession(res, user) {
  res.cookie('atelier_session', sign(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookie,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.cookie('atelier_csrf', token(), {
    httpOnly: false, sameSite: 'lax', secure: secureCookie,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function readUser(req) {
  try {
    const token = req.cookies.atelier_session;
    if (!token) return null;
    const payload = jwt.verify(token, jwtSecret);
    const user = db.data.User.find(item => item.id === payload.id) || null;
    if (!user || user.status === 'suspended' || (user.sessionVersion || 0) !== (payload.version || 0)) return null;
    return user;
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

function requireStaff(req, res, next) {
  req.user = readUser(req);
  if (!req.user || !staffRoles.has(req.user.role)) return res.status(403).json({ error: 'Staff access required.' });
  next();
}

app.use((req, res, next) => {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) || !req.cookies.atelier_session) return next();
  const exempt = ['/api/auth/login', '/api/auth/mfa/verify-login', '/api/auth/register', '/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/accept-invite', '/api/auth/verify-email'];
  if (exempt.includes(req.path)) return next();
  if (!safeEqual(req.cookies.atelier_csrf, req.get('x-csrf-token'))) {
    return res.status(403).json({ error: 'Security token expired. Refresh the page and try again.' });
  }
  next();
});

async function ensureSeeds() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword && !db.data.User.some(user => user.email === adminEmail)) {
    db.data.User.push({
      id: newId(), email: adminEmail, full_name: 'Studio Administrator',
      passwordHash: await bcrypt.hash(adminPassword, 12), role: 'admin',
      status: 'active', emailVerified: true, sessionVersion: 0, created_date: now(),
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

app.get('/api/health', (_req, res) => res.json({ ok: true, database: databaseKind, email: Boolean(process.env.SMTP_HOST) }));
app.get('/api/ready', (_req, res) => res.json({
  ok: true,
  database: databaseKind,
  email: Boolean(process.env.SMTP_HOST),
  storage: storageProvider,
  environment: process.env.NODE_ENV || 'development',
}));

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
    status: 'active', emailVerified: false, sessionVersion: 0, created_date: now(),
  };
  db.data.User.push(user);
  const verificationToken = token();
  db.data.emailVerificationTokens.push({
    id: newId(), userId: user.id, tokenHash: hashToken(verificationToken),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), created_date: now(),
  });
  await audit(user, 'account.registered', 'User', user.id);
  await save();
  const verificationUrl = `${process.env.APP_ORIGIN || 'http://127.0.0.1:43127'}/verify-email?token=${encodeURIComponent(verificationToken)}`;
  await sendEmail({ to: user.email, subject: 'Verify your Reigns Atelier email', text: `Verify your email address: ${verificationUrl}` });
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
  if (user.mfaEnabled && user.mfaSecret) {
    const challenge = jwt.sign({ id: user.id, purpose: 'mfa' }, jwtSecret, { expiresIn: '5m' });
    return res.json({ mfaRequired: true, challenge });
  }
  setSession(res, user);
  res.json(hiddenUserFields(user));
});

app.post('/api/auth/mfa/verify-login', authLimiter, async (req, res) => {
  try {
    const payload = jwt.verify(String(req.body.challenge || ''), jwtSecret);
    if (payload.purpose !== 'mfa') throw new Error();
    const user = db.data.User.find(item => item.id === payload.id && item.status === 'active');
    if (!user?.mfaSecret || !authenticator.check(String(req.body.code || ''), decrypt(user.mfaSecret))) {
      return res.status(401).json({ error: 'Invalid authentication code.' });
    }
    setSession(res, user);
    res.json(hiddenUserFields(user));
  } catch {
    res.status(401).json({ error: 'The authentication challenge expired. Sign in again.' });
  }
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('atelier_session');
  res.clearCookie('atelier_csrf');
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = readUser(req);
  if (user && !req.cookies.atelier_csrf) {
    res.cookie('atelier_csrf', token(), {
      httpOnly: false, sameSite: 'lax', secure: secureCookie,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
  res.json(user ? hiddenUserFields(user) : null);
});

app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = db.data.User.find(item => item.email === email);
  if (user) {
    const rawToken = token();
    db.data.passwordResetTokens = db.data.passwordResetTokens.filter(item => item.userId !== user.id);
    db.data.passwordResetTokens.push({
      id: newId(), userId: user.id, tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), created_date: now(),
    });
    await save();
    const url = `${process.env.APP_ORIGIN || 'http://127.0.0.1:43127'}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await sendEmail({ to: user.email, subject: 'Reset your Reigns Atelier password', text: `Reset your password: ${url}` });
  }
  res.json({ success: true });
});

app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  const rawToken = String(req.body.token || '');
  const password = String(req.body.password || '');
  if (password.length < 10) return res.status(400).json({ error: 'Password must contain at least 10 characters.' });
  const tokenRecord = db.data.passwordResetTokens.find(item =>
    safeEqual(item.tokenHash, hashToken(rawToken)) && new Date(item.expiresAt).getTime() > Date.now()
  );
  const user = tokenRecord && db.data.User.find(item => item.id === tokenRecord.userId);
  if (!user) return res.status(400).json({ error: 'This reset link is invalid or expired.' });
  user.passwordHash = await bcrypt.hash(password, 12);
  user.sessionVersion = (user.sessionVersion || 0) + 1;
  db.data.passwordResetTokens = db.data.passwordResetTokens.filter(item => item.id !== tokenRecord.id);
  await audit(user, 'account.password_reset', 'User', user.id);
  await save();
  res.json({ success: true });
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (db.data.User.some(user => user.email === email)) return res.status(409).json({ error: 'That user already exists.' });
  const rawToken = token();
  const user = {
    id: newId(), email, full_name: String(req.body.full_name || '').trim(),
    passwordHash: await bcrypt.hash(token(), 12),
    role: ['customer', 'editor', 'support', 'admin'].includes(req.body.role) ? req.body.role : 'customer',
    status: 'invited', emailVerified: false, sessionVersion: 0,
    created_date: now(), invitedBy: req.user.id,
  };
  db.data.User.push(user);
  db.data.inviteTokens.push({
    id: newId(), userId: user.id, tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(), created_date: now(),
  });
  await audit(req.user, 'user.invited', 'User', user.id, { email, role: user.role });
  await save();
  const invitationUrl = `${process.env.APP_ORIGIN || 'http://127.0.0.1:43127'}/accept-invite?token=${encodeURIComponent(rawToken)}`;
  const delivery = await sendEmail({
    to: email,
    subject: 'You are invited to Reigns Atelier',
    text: `Accept your invitation and create your password: ${invitationUrl}`,
  });
  res.status(201).json({ ...hiddenUserFields(user), delivery });
});

app.post('/api/admin/users/:id/resend-invite', requireAdmin, async (req, res) => {
  const user = db.data.User.find(item => item.id === req.params.id);
  if (!user || user.status !== 'invited') return res.status(404).json({ error: 'Pending invitation not found.' });
  const rawToken = token();
  db.data.inviteTokens = db.data.inviteTokens.filter(item => item.userId !== user.id);
  db.data.inviteTokens.push({
    id: newId(), userId: user.id, tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(), created_date: now(),
  });
  const invitationUrl = `${process.env.APP_ORIGIN || 'http://127.0.0.1:43127'}/accept-invite?token=${encodeURIComponent(rawToken)}`;
  const delivery = await sendEmail({ to: user.email, subject: 'Your Reigns Atelier invitation', text: `Accept your invitation: ${invitationUrl}` });
  await audit(req.user, 'user.invitation_resent', 'User', user.id);
  await save();
  res.json({ success: true, delivery });
});

app.post('/api/auth/accept-invite', authLimiter, async (req, res) => {
  const rawToken = String(req.body.token || '');
  const password = String(req.body.password || '');
  if (password.length < 10) return res.status(400).json({ error: 'Password must contain at least 10 characters.' });
  const invite = db.data.inviteTokens.find(item =>
    safeEqual(item.tokenHash, hashToken(rawToken)) && new Date(item.expiresAt).getTime() > Date.now()
  );
  const user = invite && db.data.User.find(item => item.id === invite.userId);
  if (!user) return res.status(400).json({ error: 'This invitation is invalid or expired.' });
  user.passwordHash = await bcrypt.hash(password, 12);
  user.status = 'active';
  user.emailVerified = true;
  user.sessionVersion = (user.sessionVersion || 0) + 1;
  db.data.inviteTokens = db.data.inviteTokens.filter(item => item.id !== invite.id);
  await audit(user, 'user.invitation_accepted', 'User', user.id);
  await save();
  setSession(res, user);
  res.json(hiddenUserFields(user));
});

app.post('/api/auth/verify-email', authLimiter, async (req, res) => {
  const rawToken = String(req.body.token || '');
  const verification = db.data.emailVerificationTokens.find(item =>
    safeEqual(item.tokenHash, hashToken(rawToken)) && new Date(item.expiresAt).getTime() > Date.now()
  );
  const user = verification && db.data.User.find(item => item.id === verification.userId);
  if (!user) return res.status(400).json({ error: 'This verification link is invalid or expired.' });
  user.emailVerified = true;
  db.data.emailVerificationTokens = db.data.emailVerificationTokens.filter(item => item.id !== verification.id);
  await audit(user, 'account.email_verified', 'User', user.id);
  await save();
  res.json({ success: true });
});

app.post('/api/auth/resend-verification', requireUser, authLimiter, async (req, res) => {
  if (req.user.emailVerified) return res.json({ success: true, alreadyVerified: true });
  const rawToken = token();
  db.data.emailVerificationTokens = db.data.emailVerificationTokens.filter(item => item.userId !== req.user.id);
  db.data.emailVerificationTokens.push({
    id: newId(), userId: req.user.id, tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), created_date: now(),
  });
  const verificationUrl = `${process.env.APP_ORIGIN || 'http://127.0.0.1:43127'}/verify-email?token=${encodeURIComponent(rawToken)}`;
  const delivery = await sendEmail({ to: req.user.email, subject: 'Verify your Reigns Atelier email', text: `Verify your email address: ${verificationUrl}` });
  await save();
  res.json({ success: true, delivery });
});

app.post('/api/admin/mfa/setup', requireAdmin, authLimiter, async (req, res) => {
  const secret = authenticator.generateSecret();
  req.user.pendingMfaSecret = encrypt(secret);
  await save();
  const label = encodeURIComponent(`Reigns Atelier:${req.user.email}`);
  const issuer = encodeURIComponent('Reigns Atelier');
  const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
  res.json({ qrDataUrl: await QRCode.toDataURL(otpauth), manualKey: secret });
});

app.post('/api/admin/mfa/enable', requireAdmin, authLimiter, async (req, res) => {
  if (!req.user.pendingMfaSecret) return res.status(400).json({ error: 'Start MFA setup first.' });
  const secret = decrypt(req.user.pendingMfaSecret);
  if (!authenticator.check(String(req.body.code || ''), secret)) return res.status(400).json({ error: 'Invalid authentication code.' });
  req.user.mfaSecret = req.user.pendingMfaSecret;
  delete req.user.pendingMfaSecret;
  req.user.mfaEnabled = true;
  await audit(req.user, 'account.mfa_enabled', 'User', req.user.id);
  await save();
  res.json({ success: true });
});

app.post('/api/admin/mfa/disable', requireAdmin, authLimiter, async (req, res) => {
  const passwordValid = await bcrypt.compare(String(req.body.password || ''), req.user.passwordHash);
  const codeValid = req.user.mfaSecret && authenticator.check(String(req.body.code || ''), decrypt(req.user.mfaSecret));
  if (!passwordValid || !codeValid) return res.status(400).json({ error: 'Password or authentication code is incorrect.' });
  delete req.user.mfaSecret;
  delete req.user.pendingMfaSecret;
  req.user.mfaEnabled = false;
  await audit(req.user, 'account.mfa_disabled', 'User', req.user.id);
  await save();
  res.json({ success: true });
});

app.get('/api/entities/:name', (req, res) => {
  const { name } = req.params;
  if (!Array.isArray(db.data[name])) return res.status(404).json({ error: 'Unknown entity.' });
  const user = readUser(req);
  const ownData = ['CommissionRequest', 'Message', 'Notification', 'Order'].includes(name);
  if (!publicRead.has(name) && !canManage(user, name) && !(user && ownData)) {
    return res.status(403).json({ error: 'You do not have access to these records.' });
  }
  let records = db.data[name].filter(record => !record.deleted_at);
  if (user && ownData && !canManage(user, name)) records = records.filter(record => record.userId === user.id);
  if (!staffRoles.has(user?.role)) {
    if (name === 'BlogPost') records = records.filter(record => record.status === 'published' || !record.status);
    if (name === 'Testimonial') records = records.filter(record => record.status === 'approved');
  }
  for (const [key, value] of Object.entries(req.query)) {
    if (!['sort', 'limit', 'includeDeleted'].includes(key)) records = records.filter(record => String(record[key]) === String(value));
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

app.post('/api/entities/:name', mutationLimiter, limitPublicForms, async (req, res) => {
  const { name } = req.params;
  if (!Array.isArray(db.data[name])) return res.status(404).json({ error: 'Unknown entity.' });
  const user = readUser(req);
  const publicCreate = name === 'NewsletterSubscriber';
  if (!canManage(user, name) && !authenticatedCreate.has(name) && !publicCreate) {
    return res.status(403).json({ error: 'You do not have permission to create this record.' });
  }
  if (authenticatedCreate.has(name) && !user) return res.status(401).json({ error: 'Please log in to continue.' });
  let clean;
  try {
    clean = validateEntity(name, req.body);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
  if (clean.website) return res.status(201).json({ success: true });
  delete clean.website;
  if (name === 'NewsletterSubscriber') {
    const existing = db.data.NewsletterSubscriber.find(item => item.email === clean.email && !item.deleted_at);
    if (existing) return res.status(200).json({ success: true, alreadySubscribed: true });
    clean.unsubscribeToken = token();
    clean.subscribedDate = now().slice(0, 10);
    clean.consentRecordedAt = now();
  }
  if (name === 'Order') {
    const unavailable = clean.items.find(item => !db.data.ShopProduct.some(candidate => candidate.id === item.productId && !candidate.deleted_at));
    if (unavailable) return res.status(400).json({ error: 'One of the selected products is no longer available.' });
    clean.items = clean.items.map(item => {
      const product = db.data.ShopProduct.find(candidate => candidate.id === item.productId && !candidate.deleted_at);
      return { productId: product.id, title: product.title, price: Number(product.price), qty: item.qty };
    });
    clean.total = clean.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  }
  const record = { ...clean, id: newId(), created_date: now() };
  if (user) {
    record.userId = user.id;
    record.accountEmail = user.email;
    if (name === 'Message') record.email = user.email;
  }
  if (name === 'Message') {
    record.status = 'unread';
    record.replies = [];
  }
  if (name === 'CommissionRequest') {
    record.status = 'pending';
    record.statusHistory = [{ status: 'pending', at: now(), actorId: user.id }];
  }
  if (name === 'Order') {
    record.status = 'pending';
    record.statusHistory = [{ status: 'pending', at: now(), actorId: user.id }];
  }
  db.data[name].push(record);
  if (name === 'CommissionRequest') {
    record.confirmationDelivery = await sendEmail({
      to: record.email,
      subject: 'Your commission request — Reigns Atelier',
      text: `Hi ${record.name},\n\nYour commission request has been received. The studio will review it and respond with next steps.\n\nArtwork type: ${record.artworkType}\nBudget: ${record.budget}\n\nReigns Atelier`,
    });
  }
  await audit(user, `${name.toLowerCase()}.created`, name, record.id);
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

app.patch('/api/entities/:name/:id', requireStaff, mutationLimiter, async (req, res) => {
  const records = db.data[req.params.name];
  const record = records?.find(item => item.id === req.params.id);
  if (!record) return res.status(404).json({ error: 'Record not found.' });
  if (!canManage(req.user, req.params.name)) return res.status(403).json({ error: 'You do not have permission to change this record.' });
  if (req.params.name === 'User' && record.id === req.user.id && (req.body.role || req.body.status === 'suspended')) {
    return res.status(400).json({ error: 'You cannot change your own role or suspend your own account.' });
  }
  const allowedUserFields = ['full_name', 'role', 'status'];
  if (req.params.name === 'User' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only an administrator can manage user accounts.' });
  }
  let changes = req.params.name === 'User'
    ? Object.fromEntries(Object.entries(req.body).filter(([key]) => allowedUserFields.includes(key)))
    : req.body;
  try {
    changes = validateEntity(req.params.name, changes, { partial: true });
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
  if (req.params.name === 'User' && changes.role && !['customer', 'editor', 'support', 'admin'].includes(changes.role)) {
    return res.status(400).json({ error: 'Invalid user role.' });
  }
  if (['CommissionRequest', 'Order'].includes(req.params.name) && changes.status && changes.status !== record.status) {
    record.statusHistory ||= [];
    record.statusHistory.push({ status: changes.status, at: now(), actorId: req.user.id });
    db.data.Notification.push({
      id: newId(), userId: record.userId, type: `${req.params.name}.status`,
      title: `${req.params.name === 'Order' ? 'Order' : 'Commission'} updated`,
      message: `Status changed to ${String(changes.status).replaceAll('_', ' ')}.`,
      read: false, created_date: now(),
    });
  }
  if (req.params.name === 'User' && ['suspended', 'active'].includes(changes.status)) {
    record.sessionVersion = (record.sessionVersion || 0) + 1;
  }
  Object.assign(record, changes, { updated_date: now() });
  await audit(req.user, `${req.params.name.toLowerCase()}.updated`, req.params.name, record.id, { fields: Object.keys(changes) });
  await save();
  res.json(req.params.name === 'User' ? hiddenUserFields(record) : record);
});

app.delete('/api/entities/:name/:id', requireStaff, mutationLimiter, async (req, res) => {
  const records = db.data[req.params.name];
  if (!records) return res.status(404).json({ error: 'Unknown entity.' });
  if (!canManage(req.user, req.params.name)) return res.status(403).json({ error: 'You do not have permission to delete this record.' });
  const record = records.find(item => item.id === req.params.id);
  if (!record) return res.status(404).json({ error: 'Record not found.' });
  if (req.params.name === 'User' && record.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
  record.deleted_at = now();
  record.deleted_by = req.user.id;
  await audit(req.user, `${req.params.name.toLowerCase()}.deleted`, req.params.name, record.id);
  await save();
  res.json({ success: true });
});

app.post('/api/messages/:id/reply', requireStaff, mutationLimiter, async (req, res) => {
  if (!canManage(req.user, 'Message')) return res.status(403).json({ error: 'You do not have permission to reply.' });
  const message = db.data.Message.find(item => item.id === req.params.id);
  if (!message) return res.status(404).json({ error: 'Message not found.' });
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Reply cannot be empty.' });
  const delivery = await sendEmail({ to: message.email, subject: `Re: ${message.subject || 'Your message to Reigns Atelier'}`, text });
  const reply = { id: newId(), text, sentAt: now(), delivery, actorId: req.user.id };
  message.replies ||= message.reply ? [{ id: newId(), ...message.reply }] : [];
  message.replies.push(reply);
  message.reply = reply;
  message.status = 'replied';
  db.data.Notification.push({
    id: newId(), userId: message.userId, type: 'Message.reply',
    title: 'New reply from Reigns Atelier', message: text.slice(0, 240),
    read: false, created_date: now(),
  });
  await audit(req.user, 'message.replied', 'Message', message.id, { delivered: delivery.delivered });
  await save();
  res.json(message);
});

app.get('/api/artworks/likes/me', requireUser, (req, res) => {
  res.json(db.data.ArtworkLike.filter(item => item.userId === req.user.id && !item.deleted_at).map(item => item.artworkId));
});

app.post('/api/artworks/:id/like', requireUser, mutationLimiter, async (req, res) => {
  const artwork = db.data.Artwork.find(item => item.id === req.params.id && !item.deleted_at);
  if (!artwork) return res.status(404).json({ error: 'Artwork not found.' });
  const existing = db.data.ArtworkLike.find(item => item.artworkId === artwork.id && item.userId === req.user.id && !item.deleted_at);
  if (existing) {
    existing.deleted_at = now();
    artwork.likes = Math.max(0, Number(artwork.likes || 0) - 1);
  } else {
    db.data.ArtworkLike.push({ id: newId(), artworkId: artwork.id, userId: req.user.id, created_date: now() });
    artwork.likes = Number(artwork.likes || 0) + 1;
  }
  await save();
  res.json({ liked: !existing, likes: artwork.likes });
});

app.post('/api/upload', requireUser, mutationLimiter, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a supported image or video.' });
  const detected = await fileTypeFromBuffer(req.file.buffer);
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm']);
  if (!detected || !allowed.has(detected.mime)) return res.status(400).json({ error: 'Only JPG, PNG, WebP, AVIF, MP4 and WebM files are accepted.' });
  const fileId = newId();
  const fileUrl = await storeFile({ buffer: req.file.buffer, mime: detected.mime, extension: detected.ext, uploadDir, id: fileId });
  await audit(req.user, 'file.uploaded', 'Upload', fileId, { mime: detected.mime, bytes: req.file.size, provider: storageProvider });
  await save();
  res.status(201).json({ file_url: fileUrl });
});

app.patch('/api/account/profile', requireUser, mutationLimiter, async (req, res) => {
  const fullName = String(req.body.full_name || '').trim().slice(0, 120);
  if (!fullName) return res.status(400).json({ error: 'Enter your full name.' });
  req.user.full_name = fullName;
  req.user.updated_date = now();
  await audit(req.user, 'account.profile_updated', 'User', req.user.id);
  await save();
  res.json(hiddenUserFields(req.user));
});

app.post('/api/account/change-password', requireUser, authLimiter, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  if (!(await bcrypt.compare(currentPassword, req.user.passwordHash))) return res.status(400).json({ error: 'Current password is incorrect.' });
  if (newPassword.length < 10) return res.status(400).json({ error: 'New password must contain at least 10 characters.' });
  req.user.passwordHash = await bcrypt.hash(newPassword, 12);
  req.user.sessionVersion = (req.user.sessionVersion || 0) + 1;
  await audit(req.user, 'account.password_changed', 'User', req.user.id);
  await save();
  setSession(res, req.user);
  res.json({ success: true });
});

app.delete('/api/account', requireUser, mutationLimiter, async (req, res) => {
  req.user.status = 'deleted';
  req.user.deleted_at = now();
  req.user.sessionVersion = (req.user.sessionVersion || 0) + 1;
  await audit(req.user, 'account.deleted', 'User', req.user.id);
  await save();
  res.clearCookie('atelier_session');
  res.clearCookie('atelier_csrf');
  res.json({ success: true });
});

app.get('/api/account/export', requireUser, (req, res) => {
  const owned = name => db.data[name].filter(item => item.userId === req.user.id && !item.deleted_at);
  res.json({
    exportedAt: now(), profile: hiddenUserFields(req.user),
    messages: owned('Message'), commissions: owned('CommissionRequest'),
    orders: owned('Order'), notifications: owned('Notification'),
  });
});

app.get('/api/newsletter/unsubscribe', async (req, res) => {
  const subscriber = db.data.NewsletterSubscriber.find(item => safeEqual(item.unsubscribeToken, req.query.token));
  if (subscriber) {
    subscriber.deleted_at = now();
    subscriber.unsubscribedAt = now();
    await save();
  }
  res.redirect(`${process.env.APP_ORIGIN || 'http://127.0.0.1:43127'}/?unsubscribed=1`);
});

app.post('/api/admin/backup', requireAdmin, async (req, res) => {
  const result = await backupDatabase({ force: true });
  await audit(req.user, 'system.backup_created', 'System', null);
  await save();
  res.json({ success: Boolean(result), createdAt: now() });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(root, 'dist')));
  app.use((req, res, next) => {
    if (req.method === 'GET') return res.sendFile(path.join(root, 'dist', 'index.html'));
    next();
  });
}

app.use((error, _req, res, _next) => {
  console.error(JSON.stringify({ level: 'error', event: 'unhandled_error', message: error.message, stack: error.stack }));
  res.status(error.status || 500).json({ error: error.status ? error.message : 'The server could not complete this request.' });
});

const server = app.listen(port, host, () => console.log(`Reigns Atelier API listening on http://${host}:${port}`));
const shutdown = signal => {
  console.log(JSON.stringify({ level: 'info', event: 'shutdown', signal }));
  server.close(async () => {
    await save();
    await closeDatabase();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
