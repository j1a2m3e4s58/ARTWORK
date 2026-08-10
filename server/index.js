import 'dotenv/config';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose';
import { fileTypeFromBuffer } from 'file-type';
import {
  db, save, newId, now, backupDatabase, databaseKind, closeDatabase, checkDatabase,
  queryCollection, claimOutboxBatch, completeOutboxRecord,
} from './db.js';
import { sendEmail, checkEmail, emailConfigured } from './email.js';
import { validateEntity } from './validation.js';
import { storageProvider, storeFile, deleteStoredFile, checkStorage } from './storage.js';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import webpush from 'web-push';
import { createClient } from 'redis';
import { initializePayment, paymentStatus, verifyPayment, verifyPaymentWebhook } from './payments.js';
import { blocksEntityReadForPendingMfa, canUseProtectedFeature, passwordProblem, requiresProductionMfa } from './security.js';
import { reportOperationalError } from './operations.js';
import { assertRuntimeConfiguration } from './runtime-config.js';
import { DEFAULT_COMMISSION_PRICES } from '../src/lib/commissionPricing.js';
import { closeJobQueue, enqueueJob, initializeJobQueue, jobQueueHealth } from './jobQueue.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const uploadDir = path.join(here, 'uploads');
mkdirSync(uploadDir, { recursive: true });
const port = Number(process.env.PORT || process.env.API_PORT || 43130);
const host = process.env.API_HOST || (process.env.RENDER === 'true' ? '0.0.0.0' : '127.0.0.1');
const jwtSecret = process.env.JWT_SECRET;

assertRuntimeConfiguration(process.env);
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set in .env and contain at least 32 characters.');
}

const app = express();
app.post('/api/payments/webhook', express.raw({ type: 'application/json', limit: '512kb' }), handlePaymentWebhook);
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  strictTransportSecurity: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Local object URLs power safe, pre-upload previews in chat and forms.
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      mediaSrc: ["'self'", 'blob:', 'https:'],
      frameSrc: ["'self'", 'blob:', 'https://www.youtube.com', 'https://player.vimeo.com', 'https://challenges.cloudflare.com'],
      connectSrc: ["'self'", 'https://api.cloudinary.com', 'https://challenges.cloudflare.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:'],
      scriptSrc: ["'self'", 'https://challenges.cloudflare.com'],
      childSrc: ["'self'", 'https://challenges.cloudflare.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      // Upgrading loopback HTTP assets breaks WebKit-based local and CI checks.
      // Render terminates TLS before this process, so enable the directive only
      // for the real HTTPS production environment.
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
}));
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  next();
});
const allowedOrigins = (process.env.APP_ORIGIN || 'http://127.0.0.1:43127').split(',').map(origin => origin.trim());
const publicOrigin = String(process.env.SITE_URL || allowedOrigins[0]).replace(/\/+$/, '');
const pushConfigured = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (pushConfigured) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || `mailto:${process.env.ADMIN_EMAIL || 'admin@reignsatelier.com'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
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

// The application keeps a synchronized in-memory view of the database so a
// mutation must own that view until its response has finished. Without this
// gate, frequent chat presence/typing requests can mutate the same User record
// while a message, attachment, edit, or delete is being committed. The second
// commit then sees the first request's stale snapshot and PostgreSQL correctly
// rejects it as a conflict. Serialize state-changing API requests at the HTTP
// boundary; read-only requests and long-lived chat event streams remain fully
// concurrent.
let mutationRequestTail = Promise.resolve();
app.use((req, res, next) => {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) || !req.path.startsWith('/api/')) {
    next();
    return;
  }

  const previous = mutationRequestTail.catch(() => {});
  let releaseMutation;
  mutationRequestTail = new Promise((resolve) => {
    releaseMutation = resolve;
  });

  previous.then(() => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      res.off('finish', release);
      res.off('close', release);
      releaseMutation();
    };
    res.once('finish', release);
    res.once('close', release);
    try {
      next();
    } catch (error) {
      release();
      next(error);
    }
  });
});

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true });
const mutationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: true });
const publicFormLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true });
const limitPublicForms = (req, res, next) => (
  ['Message', 'ArtRequest', 'FilmRequest', 'CommissionRequest', 'InternshipApplication', 'NewsletterSubscriber', 'Order'].includes(req.params.name)
    ? publicFormLimiter(req, res, next)
    : next()
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 75 * 1024 * 1024 },
});
const turnstileConfigured = Boolean(process.env.TURNSTILE_SECRET_KEY);
async function verifyHuman(req, res, next) {
  if (!turnstileConfigured) return next();
  if (req.params.name && req.params.name !== 'NewsletterSubscriber') return next();
  const responseToken = String(req.body.turnstileToken || '');
  if (!responseToken) return res.status(400).json({ error: 'Complete the human verification challenge.' });
  try {
    const body = new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY,
      response: responseToken,
      remoteip: req.ip,
    });
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(8000) });
    const result = await response.json();
    if (!result.success) return res.status(400).json({ error: 'Human verification failed. Please try again.' });
    next();
  } catch {
    res.status(503).json({ error: 'Human verification is temporarily unavailable.' });
  }
}

const publicRead = new Set(['Artwork', 'Award', 'BlogPost', 'HeroSlide', 'PriceGuide', 'Quote', 'ShopProduct', 'SiteContent', 'Testimonial', 'Video']);
const authenticatedCreate = new Set(['ArtRequest', 'CommissionRequest', 'FilmRequest', 'InternshipApplication', 'Message', 'Order', 'PartnerApplication']);
const staffRoles = new Set(['admin', 'editor', 'support']);
const contentEntities = new Set(['Artwork', 'Award', 'BlogPost', 'HeroSlide', 'Media', 'PriceGuide', 'Quote', 'ShopProduct', 'SiteContent', 'Testimonial', 'Video']);
const supportEntities = new Set(['ArtRequest', 'CommissionRequest', 'FilmRequest', 'InternshipApplication', 'Message', 'Order']);
const hiddenUserFields = ({
  passwordHash, mfaSecret, pendingMfaSecret, mfaRecoveryCodeHashes,
  managedPasswordFingerprint, ...user
}) => user;
const hashToken = token => createHash('sha256').update(token).digest('hex');
const token = () => randomBytes(32).toString('hex');
const normalizeRecoveryCode = value => String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
const createRecoveryCodes = () => Array.from({ length: 10 }, () => {
  const raw = randomBytes(6).toString('hex').toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
});
const setRecoveryCodes = user => {
  const codes = createRecoveryCodes();
  user.mfaRecoveryCodeHashes = codes.map(code => hashToken(normalizeRecoveryCode(code)));
  return codes;
};
const secureCookie = process.env.NODE_ENV === 'production';
const encryptionKey = createHash('sha256').update(jwtSecret).digest();
const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

function safeLocalPath(value, fallback = '/account?oauth=success') {
  const candidate = String(value || '');
  return candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : fallback;
}

function oauthCallbackUrl(provider) {
  return `${publicOrigin}/api/auth/oauth/${provider}/callback`;
}

function oauthConfigured(provider) {
  if (provider === 'google') return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  if (provider === 'apple') {
    return Boolean(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY);
  }
  return false;
}

function clearOAuthState(res) {
  res.clearCookie('atelier_oauth_state', {
    httpOnly: true,
    secure: secureCookie,
    sameSite: secureCookie ? 'none' : 'lax',
    path: '/api/auth/oauth',
  });
}

function beginOAuth(res, provider, returnTo) {
  const state = jwt.sign({ provider, purpose: 'oauth', returnTo: safeLocalPath(returnTo) }, jwtSecret, { expiresIn: '10m' });
  res.cookie('atelier_oauth_state', state, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: secureCookie ? 'none' : 'lax',
    path: '/api/auth/oauth',
    maxAge: 10 * 60 * 1000,
  });
  return state;
}

function validateOAuthState(req, res, provider) {
  const received = String(req.query?.state || req.body?.state || '');
  const expected = String(req.cookies.atelier_oauth_state || '');
  clearOAuthState(res);
  if (!safeEqual(received, expected)) throw new Error('OAuth state did not match this browser session.');
  const payload = jwt.verify(received, jwtSecret);
  if (payload.purpose !== 'oauth' || payload.provider !== provider) throw new Error('OAuth provider state is invalid.');
  return payload;
}

async function appleClientSecret() {
  const privateKey = String(process.env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const key = await importPKCS8(privateKey, 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: process.env.APPLE_KEY_ID })
    .setIssuer(process.env.APPLE_TEAM_ID)
    .setSubject(process.env.APPLE_CLIENT_ID)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt()
    .setExpirationTime('180d')
    .sign(key);
}

async function exchangeOAuthCode(provider, code) {
  const redirectUri = oauthCallbackUrl(provider);
  if (provider === 'google') {
    const body = new URLSearchParams({
      code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    });
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body, signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error('Google could not complete the sign-in request.');
    const tokens = await response.json();
    const { payload } = await jwtVerify(tokens.id_token, googleJwks, {
      audience: process.env.GOOGLE_CLIENT_ID,
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
    });
    return { sub: payload.sub, email: payload.email, emailVerified: payload.email_verified === true, name: payload.name || payload.given_name };
  }

  const body = new URLSearchParams({
    code, client_id: process.env.APPLE_CLIENT_ID, client_secret: await appleClientSecret(),
    redirect_uri: redirectUri, grant_type: 'authorization_code',
  });
  const response = await fetch('https://appleid.apple.com/auth/token', { method: 'POST', body, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error('Apple could not complete the sign-in request.');
  const tokens = await response.json();
  const { payload } = await jwtVerify(tokens.id_token, appleJwks, {
    audience: process.env.APPLE_CLIENT_ID,
    issuer: 'https://appleid.apple.com',
  });
  return { sub: payload.sub, email: payload.email, emailVerified: payload.email_verified === true };
}

async function finishOAuthSignIn(req, res, provider, profile, returnTo) {
  const email = String(profile.email || '').trim().toLowerCase();
  let user = db.data.User.find(item => item.oauth?.[provider]?.sub === profile.sub);
  if (!user && email) user = db.data.User.find(item => item.email === email);
  if (!user && !email) throw new Error('Apple did not return an email address. Please use the same Apple ID and try again.');
  if (!user) {
    user = {
      id: newId(), email, full_name: String(profile.name || email.split('@')[0]).trim(),
      passwordHash: await bcrypt.hash(token(), 12), role: 'customer', status: 'active',
      emailVerified: profile.emailVerified, sessionVersion: 0, created_date: now(), oauth: {},
    };
    db.data.User.push(user);
    await audit(user, 'account.oauth_registered', 'User', user.id, { provider });
  }
  if (user.status === 'suspended') throw new Error('This account is suspended.');
  user.oauth ||= {};
  user.oauth[provider] = { sub: profile.sub, linkedAt: now() };
  if (profile.emailVerified) user.emailVerified = true;
  await audit(user, 'account.oauth_signed_in', 'User', user.id, { provider });
  await save();
  setSession(res, user, req);
  res.redirect(safeLocalPath(returnTo));
}

function reserveOrderInventory(order) {
  const reservations = order.items.map((item) => {
    const product = db.data.ShopProduct.find(candidate => candidate.id === item.productId && !candidate.deleted_at);
    if (!product) throw Object.assign(new Error(`${item.title || 'A product'} is no longer available.`), { status: 409 });
    if (Number.isInteger(product.inventory)) {
      if (product.inventory < item.qty) throw Object.assign(new Error(`Only ${product.inventory} of “${product.title}” remain.`), { status: 409 });
    }
    return { product, qty: item.qty };
  });
  const reserved = [];
  reservations.forEach(({ product, qty }) => {
    if (!Number.isInteger(product.inventory)) return;
    product.inventory -= qty;
    reserved.push({ productId: product.id, qty });
  });
  order.inventoryReserved = reserved.length > 0;
  order.reservedItems = reserved;
  order.inventoryReservedAt = now();
}

function releaseOrderInventory(order) {
  if (!order.inventoryReserved || order.inventoryReleasedAt) return;
  for (const item of order.reservedItems || []) {
    const product = db.data.ShopProduct.find(candidate => candidate.id === item.productId);
    if (product && Number.isInteger(product.inventory)) product.inventory += item.qty;
  }
  order.inventoryReleasedAt = now();
  order.inventoryReserved = false;
}

const defaultCommerceSettings = {
  deliveryZones: [
    { id: 'accra', name: 'Accra', fee: 25, eta: '1–3 working days', active: true },
    { id: 'tema', name: 'Tema', fee: 30, eta: '1–3 working days', active: true },
    { id: 'kasoa', name: 'Kasoa', fee: 35, eta: '2–4 working days', active: true },
    { id: 'other-ghana', name: 'Other Ghana locations', fee: 50, eta: 'Arranged after confirmation', active: true },
  ],
  paymentMethods: { paystack: true, mobile_money: true, bank_transfer: true, pay_on_delivery: true },
  whatsapp: { number: '', orderMessage: '' },
  mobileMoney: { network: 'MTN MoMo', number: '', accountName: '', instructions: '' },
  bankTransfer: { bankName: '', accountName: '', accountNumber: '', branch: '', instructions: '' },
  payOnDeliveryNote: 'Pay on delivery is subject to confirmation for the selected location and order value.',
};

function commerceSettings() {
  const latest = db.data.SiteContent
    .filter(item => item.key === 'commerce_settings' && item.page === 'Commerce' && !item.deleted_at)
    .sort((a, b) => new Date(a.updated_date || a.created_date || 0) - new Date(b.updated_date || b.created_date || 0))
    .at(-1);
  try {
    const parsed = latest?.value ? JSON.parse(latest.value) : {};
    return {
      ...defaultCommerceSettings,
      ...parsed,
      paymentMethods: { ...defaultCommerceSettings.paymentMethods, ...(parsed.paymentMethods || {}) },
      whatsapp: { ...defaultCommerceSettings.whatsapp, ...(parsed.whatsapp || {}) },
      mobileMoney: { ...defaultCommerceSettings.mobileMoney, ...(parsed.mobileMoney || {}) },
      bankTransfer: { ...defaultCommerceSettings.bankTransfer, ...(parsed.bankTransfer || {}) },
      deliveryZones: Array.isArray(parsed.deliveryZones) ? parsed.deliveryZones : defaultCommerceSettings.deliveryZones,
    };
  } catch {
    return defaultCommerceSettings;
  }
}

function createOrderTrackingCode() {
  let code;
  do {
    code = `RA-${randomBytes(4).toString('hex').toUpperCase()}`;
  } while (db.data.Order.some(order => order.trackingCode === code));
  return code;
}

const safeOrderTrackingPayload = order => ({
  trackingCode: order.trackingCode,
  createdDate: order.created_date,
  status: order.status,
  paymentStatus: order.paymentStatus,
  paymentMethod: order.paymentMethod,
  deliveryZone: order.deliveryZone ? { name: order.deliveryZone.name, eta: order.deliveryZone.eta } : null,
  total: order.total,
  currency: order.currency || 'GHS',
  items: (order.items || []).map(item => ({ title: item.title, qty: item.qty })),
  statusHistory: (order.statusHistory || []).map(item => ({ status: item.status, at: item.at })),
});

async function confirmPaidOrder(order, payment, providerEventId) {
  if (order.paymentStatus === 'paid') return false;
  const expectedAmount = Math.round(Number(order.total) * 100);
  if (payment.status !== 'success' || Number(payment.amount) !== expectedAmount || payment.currency !== paymentStatus.currency) {
    order.paymentStatus = payment.status || 'failed';
    return false;
  }
  order.paymentStatus = 'paid';
  order.status = 'confirmed';
  order.paidAt = payment.paid_at || now();
  order.paymentTransactionId = String(payment.id || providerEventId || '');
  delete order.paymentAuthorizationUrl;
  order.statusHistory ||= [];
  order.statusHistory.push({ status: 'confirmed', at: now(), actorId: 'payment-provider' });
  assignPartnerSettlements(order);
  return true;
}

function assignPartnerSettlements(order) {
  if (order.partnerSettlements?.length) return order.partnerSettlements;
  const settlements = (order.items || []).map(item => {
    const product = db.data.ShopProduct.find(candidate => candidate.id === item.productId && !candidate.deleted_at);
    if (!product?.sellerId) return null;
    const partner = db.data.User.find(candidate => candidate.id === product.sellerId && !candidate.deleted_at);
    const application = db.data.PartnerApplication.find(candidate => candidate.userId === product.sellerId && candidate.status === 'approved' && !candidate.deleted_at);
    const commissionRate = Math.max(0, Math.min(100, Number(application?.commissionRate ?? partner?.partnerProfile?.commissionRate ?? 0)));
    const gross = Math.max(0, Number(item.price) || 0) * Math.max(1, Number(item.qty) || 1);
    const studioCommission = Math.round(gross * commissionRate * 100) / 100;
    return { productId: product.id, partnerId: product.sellerId, gross, commissionRate, studioCommission, partnerAmount: Math.round((gross - studioCommission) * 100) / 100 };
  }).filter(Boolean);
  order.partnerSettlements = settlements;
  return settlements;
}

async function handlePaymentWebhook(req, res) {
  if (!verifyPaymentWebhook(req.body, req.get('x-paystack-signature'))) return res.status(401).send('Invalid signature');
  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid payload');
  }
  const providerEventId = String(payload.data?.id || `${payload.event}:${payload.data?.reference || ''}`);
  if (db.data.PaymentEvent.some(event => event.providerEventId === providerEventId)) return res.status(200).send('Already processed');
  const eventRecord = {
    id: newId(), provider: 'paystack', providerEventId, type: payload.event,
    reference: payload.data?.reference || '', created_date: now(),
  };
  db.data.PaymentEvent.push(eventRecord);
  if (payload.event === 'charge.success') {
    const order = db.data.Order.find(item => item.paymentReference === payload.data?.reference);
    if (order) {
      const paid = await confirmPaidOrder(order, payload.data, providerEventId);
      eventRecord.orderId = order.id;
      eventRecord.result = paid ? 'confirmed' : 'ignored';
    } else {
      eventRecord.result = 'order_not_found';
    }
  }
  await save();
  res.status(200).send('Accepted');
}

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

function notifyStudioStaff({ title, message, section, entity, entityId, priority = 'normal' }) {
  const recipients = db.data.User.filter(user => staffRoles.has(user.role) && user.status === 'active' && !user.deleted_at);
  recipients.forEach(user => db.data.Notification.push({
    id: newId(), userId: user.id, type: 'studio.action', title: String(title).slice(0, 140),
    message: String(message).slice(0, 500), section, entity, entityId, priority,
    read: false, created_date: now(),
  }));
}

async function deliverEmail(message, { queueOnFailure = true } = {}) {
  const delivery = await sendEmail(message);
  if (!delivery.delivered && queueOnFailure) {
    db.data.Outbox.push({
      id: newId(),
      ...message,
      status: 'pending',
      attempts: 1,
      lastError: delivery.reason || delivery.error,
      nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      created_date: now(),
    });
    await save();
  }
  return delivery;
}

let outboxProcessing = false;
async function processEmailOutbox() {
  if (outboxProcessing || !emailConfigured) return;
  outboxProcessing = true;
  try {
    const due = await claimOutboxBatch(10);
    for (const item of due) {
      const delivery = await sendEmail({ to: item.to, subject: item.subject, text: item.text, html: item.html });
      const attempts = (item.attempts || 0) + 1;
      const changes = { attempts, lastAttemptAt: now() };
      if (delivery.delivered) {
        Object.assign(changes, { status: 'delivered', messageId: delivery.messageId });
      } else if (attempts >= 5) {
        Object.assign(changes, { status: 'failed', lastError: delivery.reason || delivery.error });
      } else {
        Object.assign(changes, {
          status: 'pending',
          lastError: delivery.reason || delivery.error,
          nextAttemptAt: new Date(Date.now() + Math.min(60, attempts * 10) * 60 * 1000).toISOString(),
        });
      }
      await completeOutboxRecord(item.id, item.leaseId, changes);
    }
  } finally {
    outboxProcessing = false;
  }
}

async function runMaintenance() {
  let changed = false;
  const currentTime = Date.now();
  for (const order of db.data.Order) {
    if (order.paymentStatus !== 'paid' && !['cancelled', 'expired'].includes(order.status) && new Date(order.expiresAt || 0).getTime() <= currentTime) {
      order.status = 'expired';
      order.expiredAt = now();
      releaseOrderInventory(order);
      changed = true;
    }
    if (isCustomerRemovableOrder(order)
      && !order.customerRemovedAt
      && Date.now() - new Date(order.created_date || 0).getTime() >= CUSTOMER_ORDER_RETENTION_MS) {
      changed ||= hideOrderFromCustomer(order, 'unfinished_checkout_expired', order.userId);
    }
  }
  for (const collection of ['passwordResetTokens', 'inviteTokens', 'emailVerificationTokens']) {
    const before = db.data[collection].length;
    db.data[collection] = db.data[collection].filter(item => new Date(item.expiresAt || 0).getTime() > currentTime);
    changed ||= before !== db.data[collection].length;
  }
  const outboxCutoff = currentTime - Number(process.env.EMAIL_LOG_RETENTION_DAYS || 90) * 86_400_000;
  const outboxBefore = db.data.Outbox.length;
  db.data.Outbox = db.data.Outbox.filter(item => item.status !== 'delivered' || new Date(item.created_date).getTime() > outboxCutoff);
  changed ||= outboxBefore !== db.data.Outbox.length;
  const notificationCutoff = currentTime - Number(process.env.NOTIFICATION_RETENTION_DAYS || 180) * 86_400_000;
  const notificationsBefore = db.data.Notification.length;
  db.data.Notification = db.data.Notification.filter(item => !item.read || new Date(item.created_date || 0).getTime() > notificationCutoff);
  changed ||= notificationsBefore !== db.data.Notification.length;
  const pushCutoff = currentTime - 120 * 86_400_000;
  const pushBefore = db.data.PushSubscription.length;
  db.data.PushSubscription = db.data.PushSubscription.filter(item => !item.deleted_at || new Date(item.deleted_at).getTime() > pushCutoff);
  changed ||= pushBefore !== db.data.PushSubscription.length;
  if (changed) await save();
}

const CUSTOMER_ORDER_RETENTION_MS = 24 * 60 * 60 * 1000;
const isCustomerRemovableOrder = order => (
  !order.deleted_at
  && !['paid', 'refunded', 'pay_on_delivery', 'quote_required'].includes(String(order.paymentStatus || ''))
  && !['confirmed', 'processing', 'fulfilled', 'shipped', 'delivered'].includes(String(order.status || ''))
);
const hideOrderFromCustomer = (order, reason, actorId) => {
  if (!isCustomerRemovableOrder(order)) return false;
  order.customerRemovedAt = now();
  order.customerRemovalReason = reason;
  order.updated_date = now();
  if (!['cancelled', 'expired'].includes(order.status)) {
    order.status = 'abandoned';
    order.abandonedAt = now();
    releaseOrderInventory(order);
    order.statusHistory ||= [];
    order.statusHistory.push({ status: 'abandoned', at: now(), actorId });
  }
  return true;
};

function sign(user, sessionId = '') {
  return jwt.sign({ id: user.id, version: user.sessionVersion || 0, sessionId }, jwtSecret, { expiresIn: '7d' });
}

function setSession(res, user, req = null) {
  const sessionId = newId();
  db.data.ChatDevice.push({
    id: sessionId, userId: user.id,
    label: String(req?.get?.('user-agent') || 'Browser session').slice(0, 240),
    ipHash: req?.ip ? createHash('sha256').update(`${req.ip}:${jwtSecret}`).digest('hex').slice(0, 24) : '',
    lastSeenAt: now(), created_date: now(),
  });
  res.clearCookie('atelier_admin_access');
  res.cookie('atelier_session', sign(user, sessionId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookie,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.cookie('atelier_csrf', token(), {
    httpOnly: false, sameSite: 'lax', secure: secureCookie,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  void save().catch(error => reportOperationalError('session_record_failed', error, { userId: user.id }));
}

function readUser(req) {
  try {
    const token = req.cookies.atelier_session;
    if (!token) return null;
    const payload = jwt.verify(token, jwtSecret);
    const user = db.data.User.find(item => item.id === payload.id) || null;
    if (!user || user.status === 'suspended' || (user.sessionVersion || 0) !== (payload.version || 0)) return null;
    if (payload.sessionId) {
      const device = db.data.ChatDevice.find(item => item.id === payload.sessionId && item.userId === user.id && !item.revokedAt && !item.deleted_at);
      if (!device) return null;
      Object.defineProperty(user, '_sessionId', { value: payload.sessionId, configurable: true, enumerable: false });
    }
    return user;
  } catch {
    return null;
  }
}

function hasAdminAccess(req, user) {
  try {
    const accessToken = req.cookies.atelier_admin_access;
    if (!accessToken || !user) return false;
    const payload = jwt.verify(accessToken, jwtSecret);
    return payload.purpose === 'admin_access'
      && payload.id === user.id
      && (payload.version || 0) === (user.sessionVersion || 0);
  } catch {
    return false;
  }
}

function requireStaffIdentity(req, res, next) {
  req.user = readUser(req);
  if (!req.user || !staffRoles.has(req.user.role)) return res.status(403).json({ error: 'Staff access required.' });
  next();
}

function requireAdminAccess(req, res, next) {
  if (!hasAdminAccess(req, req.user)) {
    return res.status(403).json({ error: 'Re-enter your password to unlock Studio Control.', code: 'admin_unlock_required' });
  }
  next();
}

function requireUser(req, res, next) {
  req.user = readUser(req);
  if (!req.user) return res.status(401).json({ error: 'Please log in to continue.' });
  next();
}

function requireVerifiedUser(req, res, next) {
  req.user = readUser(req);
  if (!req.user) return res.status(401).json({ error: 'Please log in to continue.' });
  if (!canUseProtectedFeature(req.user)) {
    return res.status(403).json({ error: 'Verify your email address before using this feature.', code: 'email_verification_required' });
  }
  next();
}

function requireAdmin(req, res, next) {
  req.user = readUser(req);
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Administrator access required.' });
  if (requiresProductionMfa(req.user)) {
    return res.status(403).json({ error: 'Multi-factor authentication is required for production administrators.', code: 'mfa_required' });
  }
  requireAdminAccess(req, res, next);
}

function requireAdminIdentity(req, res, next) {
  req.user = readUser(req);
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Administrator access required.' });
  next();
}

function requireStaff(req, res, next) {
  req.user = readUser(req);
  if (!req.user || !staffRoles.has(req.user.role)) return res.status(403).json({ error: 'Staff access required.' });
  if (requiresProductionMfa(req.user)) {
    return res.status(403).json({ error: 'Multi-factor authentication is required for production administrators.', code: 'mfa_required' });
  }
  requireAdminAccess(req, res, next);
}

app.use((req, res, next) => {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) || !req.cookies.atelier_session) return next();
  const exempt = ['/api/auth/login', '/api/auth/mfa/verify-login', '/api/auth/register', '/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/accept-invite', '/api/auth/verify-email', '/api/auth/oauth/apple/callback'];
  if (exempt.includes(req.path)) return next();
  if (!safeEqual(req.cookies.atelier_csrf, req.get('x-csrf-token'))) {
    return res.status(403).json({ error: 'Security token expired. Refresh the page and try again.' });
  }
  next();
});

async function ensureSeeds() {
  const production = process.env.NODE_ENV === 'production';
  const bootstrapProductionContent = production
    && process.env.BOOTSTRAP_PORTFOLIO_CONTENT !== 'false'
    && !db.data.SiteContent.some(item => item.key === 'initial_portfolio_content_seeded');
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const configuredAdmin = db.data.User.find(user => user.email === adminEmail);
    const managedPasswordFingerprint = createHmac('sha256', jwtSecret)
      .update(`reigns-atelier-managed-admin:${adminPassword}`)
      .digest('hex');
    if (!configuredAdmin) {
      db.data.User.push({
        id: newId(), email: adminEmail, full_name: 'Studio Administrator',
        passwordHash: await bcrypt.hash(adminPassword, 12), role: 'admin',
        status: 'active', emailVerified: true, sessionVersion: 0,
        managedPasswordFingerprint, created_date: now(),
      });
    } else if (configuredAdmin.managedPasswordFingerprint !== managedPasswordFingerprint) {
      // A changed ADMIN_PASSWORD is an explicit credential rotation. The
      // fingerprint prevents ordinary restarts from repeatedly replacing it.
      configuredAdmin.passwordHash = await bcrypt.hash(adminPassword, 12);
      configuredAdmin.managedPasswordFingerprint = managedPasswordFingerprint;
      configuredAdmin.role = 'admin';
      configuredAdmin.status = 'active';
      configuredAdmin.emailVerified = true;
      configuredAdmin.sessionVersion = (configuredAdmin.sessionVersion || 0) + 1;
    }
  }
  const operationalDefaults = [
    ['contact_phone', '+233 55 915 5792', 'Call / Phone Number'],
    ['show_blog', 'false', 'Show Blog Navigation'],
    ['show_testimonials', 'false', 'Enable Testimonials Page'],
    ['show_contact_map', 'false', 'Show Contact Map'],
    ['show_internships', 'true', 'Show Internships Navigation'],
  ];
  for (const [key, value, label] of operationalDefaults) {
    if (db.data.SiteContent.some(item => item.page === 'Settings' && item.key === key && !item.deleted_at)) continue;
    db.data.SiteContent.push({
      id: newId(), key, value, label, page: 'Settings',
      group: 'Navigation', created_date: now(),
    });
  }
  // Seed the supplied price guides once. The marker prevents a deleted guide
  // from reappearing after a deployment; all later changes happen in Admin.
  if (!db.data.SiteContent.some(item => item.page === 'Settings' && item.key === 'price_guides_seeded')) {
    db.data.PriceGuide.push(
      { id: newId(), title: 'Reigns Atelier Ultimate Price List', description: 'A complete studio guide to services, packages and prices.', fileUrl: '/price-guides/reigns-atelier-ultimate-price-list.pdf', status: 'published', sortOrder: 1, created_date: now() },
      { id: newId(), title: 'Pencil Portrait Price List', description: 'Portrait drawing sizes, options and current prices.', fileUrl: '/price-guides/reigns-atelier-pencil-portrait-price-list.pdf', status: 'published', sortOrder: 2, created_date: now() },
    );
    db.data.SiteContent.push({ id: newId(), key: 'price_guides_seeded', value: 'true', label: 'Price guides initialised', page: 'Settings', group: 'System', created_date: now() });
  }
  if (!db.data.SiteContent.some(item => item.page === 'Commission' && item.key === 'commission_price_options')) {
    db.data.SiteContent.push({
      id: newId(), key: 'commission_price_options', label: 'Commission size, finish and price options',
      page: 'Commission', group: 'Commission Pricing', value: JSON.stringify(DEFAULT_COMMISSION_PRICES), created_date: now(),
    });
  }
  const provenanceByHost = {
    'images.pexels.com': { name: 'Pexels', license: 'https://www.pexels.com/license/' },
    'videos.pexels.com': { name: 'Pexels', license: 'https://www.pexels.com/license/' },
    'cdn.pixabay.com': { name: 'Pixabay', license: 'https://pixabay.com/service/license-summary/' },
  };
  const mediaFields = {
    Artwork: ['imageUrl'],
    HeroSlide: ['imageUrl'],
    Video: ['videoUrl', 'thumbnailUrl'],
    ShopProduct: ['imageUrl'],
    BlogPost: ['coverImageUrl'],
  };
  for (const [collection, fields] of Object.entries(mediaFields)) {
    for (const record of db.data[collection]) {
      if (record.contentStatus === 'original' || record.sourceType === 'original') continue;
      const sources = fields
        .map(field => record[field])
        .filter(Boolean)
        .map(url => {
          try {
            return { url, ...provenanceByHost[new URL(url).hostname] };
          } catch {
            return null;
          }
        })
        .filter(source => source?.license);
      if (!sources.length) continue;
      record.sourceName ||= [...new Set(sources.map(source => source.name))].join(' / ');
      record.sourceUrl ||= sources[0].url;
      record.licenseUrls ||= [...new Set(sources.map(source => source.license))];
      record.licenseUrl ||= record.licenseUrls[0];
      record.licenseVerifiedAt ||= '2026-07-27T00:00:00.000Z';
      record.contentStatus ||= 'licensed-stock';
    }
  }
  if (production && process.env.SEED_DEMO_CONTENT !== 'true' && !bootstrapProductionContent) {
    await save();
    return;
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
  const pexelsImage = id => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1600`;
  if (!db.data.HeroSlide.length) {
    db.data.HeroSlide = [
      {
        title: 'Art Made', accentTitle: 'With Intention', eyebrow: 'Reigns Atelier',
        subtitle: 'Portraits, sketches and commissioned pieces shaped by patience, observation and a devotion to detail.',
        imageUrl: pexelsImage('6972775'), primaryLabel: 'Explore the Gallery', primaryLink: '/gallery',
        secondaryLabel: 'Request a Commission', secondaryLink: '/commission', sortOrder: 1, active: true,
      },
      {
        title: 'Every Line', accentTitle: 'Tells a Story', eyebrow: 'Inside the Sketchbook',
        subtitle: 'Discover graphite studies, portrait explorations and the quiet moments where an idea becomes visible.',
        imageUrl: pexelsImage('33679744'), primaryLabel: 'View Sketches', primaryLink: '/gallery',
        secondaryLabel: 'Watch the Process', secondaryLink: '/videos', sortOrder: 2, active: true,
      },
      {
        title: 'From Vision', accentTitle: 'To Masterpiece', eyebrow: 'Bespoke Fine Art',
        subtitle: 'Bring a meaningful person, memory or idea to life through a carefully crafted original artwork.',
        imageUrl: pexelsImage('20511250'), primaryLabel: 'Start Your Piece', primaryLink: '/commission',
        secondaryLabel: 'How It Works', secondaryLink: '/about', sortOrder: 3, active: true,
      },
      {
        title: 'See the Craft', accentTitle: 'In Motion', eyebrow: 'Studio Films',
        subtitle: 'Step behind the finished work and watch composition, shading and texture develop one mark at a time.',
        imageUrl: pexelsImage('35075085'), primaryLabel: 'Watch Studio Films', primaryLink: '/videos',
        secondaryLabel: 'Meet the Artist', secondaryLink: '/about', sortOrder: 4, active: true,
      },
    ].map(item => ({ id: newId(), ...item, sourceName: 'Pexels', created_date: now() }));
  }
  if (!db.data.Artwork.length) {
    const artworks = [
      ['Portrait in Progress', '6972775', 'Pencil Drawings', 'Graphite on paper'],
      ['Studies of Expression', '6972773', 'Portraits', 'Graphite study'],
      ['The First Gentle Lines', '10474349', 'Sketches', 'Pencil in sketchbook'],
      ['A Face Emerging', '6973173', 'Realism', 'Graphite portrait'],
      ['Collected Sketches', '33679744', 'Sketches', 'Mixed pencil studies'],
      ['Figure and Form', '33568893', 'Pencil Drawings', 'Pencil on paper'],
      ['Quiet Concentration', '35075085', 'Sketches', 'Graphite design study'],
      ['Atelier Study', '7147544', 'Digital Art', 'Creative process study'],
      ['The Working Studio', '20511250', 'Realism', 'Oil and canvas process'],
      ['Colour and Character', '36764902', 'Portraits', 'Paint on canvas'],
      ['The Artist’s Desk', '3778786', 'Sketches', 'Pencil and paper'],
    ];
    db.data.Artwork = artworks.map(([title, imageId, category, medium], index) => ({
      id: newId(), title, category, medium, imageUrl: pexelsImage(imageId),
      description: 'A curated studio-process image. Replace this starter piece with original Reigns Atelier work from the admin gallery.',
      isFeatured: index < 5, likes: 0, sourceName: 'Pexels', created_date: now(),
    }));
  }
  if (!db.data.Video.length) {
    db.data.Video = [
      {
        title: 'Portrait Sketch — From First Line to Form',
        videoUrl: 'https://videos.pexels.com/video-files/6970180/6970180-hd_1920_1080_30fps.mp4',
        thumbnailUrl: pexelsImage('6972775'), category: 'Process', duration: '0:15',
        description: 'A close-up study of the drawing process, from construction lines to delicate portrait details.',
        isFeatured: true, sourceName: 'Pexels',
      },
      {
        title: 'Inside a Working Sketchbook',
        videoUrl: 'https://videos.pexels.com/video-files/10475301/10475301-hd_1080_1920_30fps.mp4',
        thumbnailUrl: pexelsImage('10474349'), category: 'Behind the Scenes', duration: '0:12',
        description: 'A focused artist develops an idea in a sketchbook inside the studio.',
        isFeatured: false, sourceName: 'Pexels',
      },
      {
        title: 'Pencil Marks in Motion',
        videoUrl: 'https://cdn.pixabay.com/video/2017/07/23/10824-226624979_large.mp4',
        thumbnailUrl: pexelsImage('35075085'), category: 'Time-lapse', duration: '0:20',
        description: 'A short study of hand, pencil and paper working together.',
        isFeatured: false, sourceName: 'Pixabay',
      },
    ].map(item => ({ id: newId(), ...item, views: 0, created_date: now() }));
  }
  const colourArtworkPack = [
    {
      seedKey: 'colour-brushes-studio',
      title: 'Tools of Expression',
      imageId: '32556142',
      category: 'Realism',
      medium: 'Paintbrush and pigment study',
      description: 'A vibrant gathering of brushes, pigments and studio tools ready for the next work.',
    },
    {
      seedKey: 'colour-abstract-palette',
      title: 'Colour Finds Its Rhythm',
      imageId: '31280584',
      category: 'Digital Art',
      medium: 'Abstract colour study',
      description: 'An abstract canvas in progress where blue, yellow and green build an energetic visual rhythm.',
    },
    {
      seedKey: 'colour-mural-studio',
      title: 'The Painted Room',
      imageId: '34301752',
      category: 'Realism',
      medium: 'Mixed-media studio study',
      description: 'A creative room filled with paint, brushes and a blooming wall mural.',
    },
    {
      seedKey: 'colour-brush-collection',
      title: 'Brushes After Work',
      imageId: '28935838',
      category: 'Sketches',
      medium: 'Studio still life',
      description: 'A textured still life of well-used brushes carrying traces of many finished paintings.',
    },
    {
      seedKey: 'colour-bold-strokes',
      title: 'Chromatic Pulse',
      imageId: '7374952',
      category: 'Digital Art',
      medium: 'Abstract brushwork',
      description: 'Bold overlapping marks turn colour and motion into a vivid contemporary composition.',
    },
    {
      seedKey: 'colour-palette-closeup',
      title: 'The Working Palette',
      imageId: '3922244',
      category: 'Realism',
      medium: 'Acrylic palette study',
      description: 'Thick paint, mixed colour and working brushes reveal the material life behind a canvas.',
    },
    {
      seedKey: 'colour-pastel-abstraction',
      title: 'Soft Light, Bold Gesture',
      imageId: '9175760',
      category: 'Digital Art',
      medium: 'Contemporary abstract',
      description: 'Pastel colour fields and visible brush texture create a calm but expressive surface.',
    },
    {
      seedKey: 'colour-paint-splatter',
      title: 'Beautiful Disorder',
      imageId: '32556662',
      category: 'Digital Art',
      medium: 'Mixed-media abstraction',
      description: 'Paint splashes, cloth and layered colour celebrate the beautiful disorder of making art.',
    },
  ];
  for (const item of colourArtworkPack) {
    if (db.data.Artwork.some(artwork => artwork.seedKey === item.seedKey)) continue;
    const { imageId, ...artwork } = item;
    db.data.Artwork.push({
      id: newId(), ...artwork, imageUrl: pexelsImage(imageId),
      isFeatured: true, likes: 0, sourceName: 'Pexels', created_date: now(),
    });
  }
  const colourVideoPack = [
    {
      seedKey: 'colour-video-paint-jars',
      title: 'Painting with a Full Colour Palette',
      videoUrl: 'https://videos.pexels.com/video-files/6957472/6957472-uhd_4096_2160_25fps.mp4',
      thumbnailUrl: pexelsImage('32556142'),
      category: 'Process',
      duration: '0:18',
      description: 'Brush, paint jars and canvas come together in an intimate view of the painting process.',
    },
    {
      seedKey: 'colour-video-large-canvas',
      title: 'Bold Strokes on a Large Canvas',
      videoUrl: 'https://videos.pexels.com/video-files/7896667/7896667-uhd_4096_2160_25fps.mp4',
      thumbnailUrl: pexelsImage('31280584'),
      category: 'Behind the Scenes',
      duration: '0:14',
      description: 'A painter works at scale, building movement and energy with broad, confident brushwork.',
    },
    {
      seedKey: 'colour-video-palette-table',
      title: 'Pigment, Texture and Colour',
      videoUrl: 'https://videos.pexels.com/video-files/6214338/6214338-hd_1920_1080_25fps.mp4',
      thumbnailUrl: pexelsImage('3922244'),
      category: 'Time-lapse',
      duration: '0:16',
      description: 'A colourful studio table reveals the tactile materials behind expressive painting.',
    },
  ];
  for (const item of colourVideoPack) {
    if (db.data.Video.some(video => video.seedKey === item.seedKey)) continue;
    db.data.Video.push({
      id: newId(), ...item, isFeatured: true, views: 0,
      sourceName: 'Pexels', created_date: now(),
    });
  }
  const colourBannerPack = [
    {
      seedKey: 'colour-banner-expression',
      title: 'Colour Becomes',
      accentTitle: 'Emotion',
      eyebrow: 'Expressive Painting',
      subtitle: 'Enter a world of saturated pigment, layered texture and brushwork that turns feeling into form.',
      imageUrl: pexelsImage('31280584'),
      primaryLabel: 'Explore Colour Works',
      primaryLink: '/gallery',
      secondaryLabel: 'Watch the Process',
      secondaryLink: '/videos',
      sortOrder: 5,
      active: true,
    },
    {
      seedKey: 'colour-banner-brush',
      title: 'The Language',
      accentTitle: 'Of the Brush',
      eyebrow: 'Materials and Method',
      subtitle: 'Every brush carries a different gesture. Discover the tools, textures and marks behind the finished work.',
      imageUrl: pexelsImage('32556142'),
      primaryLabel: 'Enter the Gallery',
      primaryLink: '/gallery',
      secondaryLabel: 'Commission Artwork',
      secondaryLink: '/commission',
      sortOrder: 6,
      active: true,
    },
    {
      seedKey: 'painting-banner-chromatic-pulse',
      title: 'Where Colour',
      accentTitle: 'Moves Freely',
      eyebrow: 'Contemporary Painting',
      subtitle: 'Vivid brushstrokes overlap, collide and find their rhythm in expressive works made to energize a space.',
      imageUrl: pexelsImage('7374952'),
      primaryLabel: 'Discover Paintings',
      primaryLink: '/gallery',
      secondaryLabel: 'Create Your Own',
      secondaryLink: '/commission',
      sortOrder: 7,
      active: true,
    },
    {
      seedKey: 'painting-banner-mural-studio',
      title: 'A Studio Full',
      accentTitle: 'Of Possibility',
      eyebrow: 'Creative Spaces',
      subtitle: 'Step into a vibrant atelier where brushes, murals and collected materials turn every corner into inspiration.',
      imageUrl: pexelsImage('34301752'),
      primaryLabel: 'Enter the Gallery',
      primaryLink: '/gallery',
      secondaryLabel: 'Inside the Atelier',
      secondaryLink: '/about',
      sortOrder: 8,
      active: true,
    },
    {
      seedKey: 'painting-banner-soft-gesture',
      title: 'Soft Light',
      accentTitle: 'Bold Gesture',
      eyebrow: 'Abstract Collection',
      subtitle: 'Layered pastel tones and tactile marks create paintings that feel calm from afar and alive up close.',
      imageUrl: pexelsImage('9175760'),
      primaryLabel: 'View Abstract Works',
      primaryLink: '/gallery',
      secondaryLabel: 'Watch Studio Films',
      secondaryLink: '/videos',
      sortOrder: 9,
      active: true,
    },
    {
      seedKey: 'painting-banner-beautiful-disorder',
      title: 'Beauty Lives',
      accentTitle: 'In the Making',
      eyebrow: 'Mixed Media',
      subtitle: 'Splatters, texture and unexpected colour celebrate the instinctive energy behind every original artwork.',
      imageUrl: pexelsImage('32556662'),
      primaryLabel: 'Explore the Collection',
      primaryLink: '/gallery',
      secondaryLabel: 'Commission a Piece',
      secondaryLink: '/commission',
      sortOrder: 10,
      active: true,
    },
  ];
  for (const item of colourBannerPack) {
    if (db.data.HeroSlide.some(slide => slide.seedKey === item.seedKey)) continue;
    db.data.HeroSlide.push({
      id: newId(), ...item, sourceName: 'Pexels', created_date: now(),
    });
  }
  if (!db.data.SiteContent.some(item => item.key === 'show_videos')) {
    db.data.SiteContent.push({
      id: newId(), key: 'show_videos', value: 'true', page: 'Settings',
      group: 'Navigation', created_date: now(),
    });
  }
  if (bootstrapProductionContent) {
    db.data.SiteContent.push({
      id: newId(), key: 'initial_portfolio_content_seeded', value: 'true',
      page: 'System', group: 'Deployment', created_date: now(),
    });
  }
  await save();
}
await ensureSeeds();
const backgroundJobsEnabled = process.env.BACKGROUND_JOBS_ENABLED !== 'false';
const outboxTimer = backgroundJobsEnabled
  ? setInterval(() => processEmailOutbox().catch(error => {
    reportOperationalError('email_outbox_failed', error);
  }), 60_000)
  : null;
outboxTimer?.unref();
const maintenanceTimer = backgroundJobsEnabled
  ? setInterval(() => runMaintenance().catch(error => {
    reportOperationalError('maintenance_failed', error);
  }), 60 * 60 * 1000)
  : null;
maintenanceTimer?.unref();
await runMaintenance();
if (backgroundJobsEnabled) {
  processEmailOutbox().catch(error => reportOperationalError('email_outbox_startup_failed', error));
}

app.get('/api/health', (_req, res) => res.json({ ok: true, database: databaseKind }));
app.get('/api/ready', async (_req, res) => {
  const requireEmail = process.env.EMAIL_REQUIRED_FOR_READINESS === 'true';
  const [database, email] = await Promise.all([
    checkDatabase().catch(error => ({ ok: false, reason: error.message })),
    requireEmail
      ? checkEmail()
      : Promise.resolve({ ok: null, configured: emailConfigured, checked: false }),
  ]);
  const storage = checkStorage();
  const production = process.env.NODE_ENV === 'production';
  const monitoring = {
    ok: Boolean(process.env.ERROR_WEBHOOK_URL),
    metricsProtected: Boolean(process.env.METRICS_TOKEN),
  };
  const backup = {
    ok: Boolean(process.env.BACKUP_VERIFIED_AT),
    lastVerifiedAt: process.env.BACKUP_VERIFIED_AT || null,
  };
  const required = production
    ? [
        database.ok,
        storage.ok,
        Boolean(process.env.APP_ORIGIN),
        Boolean(process.env.SITE_URL),
        turnstileConfigured,
        requireEmail ? email.ok : true,
      ]
    : [database.ok];
  const payload = {
    ok: required.every(Boolean),
    degraded: [
      ...(requireEmail && !email.ok ? ['email'] : []),
      ...(!requireEmail && emailConfigured ? ['email_unchecked'] : []),
      ...(production && !monitoring.ok ? ['monitoring'] : []),
      ...(production && !backup.ok ? ['backup_unverified'] : []),
    ],
    services: {
      database, email, storage, monitoring, backup,
      humanVerification: { ok: turnstileConfigured },
    },
    payment: paymentStatus,
    environment: process.env.NODE_ENV || 'development',
  };
  res.status(payload.ok ? 200 : 503).json(payload);
});

app.get('/api/admin/system-status', requireAdmin, async (_req, res) => {
  const [database, email] = await Promise.all([
    checkDatabase().catch(error => ({ ok: false, reason: error.message })),
    checkEmail(),
  ]);
  const storage = checkStorage();
  const monitoring = {
    ok: Boolean(process.env.ERROR_WEBHOOK_URL),
    metricsProtected: Boolean(process.env.METRICS_TOKEN),
  };
  const backup = {
    ok: Boolean(process.env.BACKUP_VERIFIED_AT),
    lastVerifiedAt: process.env.BACKUP_VERIFIED_AT || null,
  };
  res.json({
    ok: database.ok && (process.env.NODE_ENV !== 'production' || (email.ok && storage.ok)),
    services: {
      database, email, storage, monitoring, backup, payment: paymentStatus,
      realtime: {
        ok: redisReady,
        provider: process.env.REDIS_URL ? 'redis' : 'single-server memory',
        configured: Boolean(process.env.REDIS_URL),
      },
    },
    counts: {
      pendingMessages: db.data.Message.filter(item => !['replied', 'archived', 'spam'].includes(item.status) && !item.deleted_at).length,
      pendingCommissions: db.data.CommissionRequest.filter(item => item.status === 'pending' && !item.deleted_at).length,
      pendingOrders: db.data.Order.filter(item => item.status === 'pending' && !item.deleted_at).length,
      failedEmails: db.data.Outbox.filter(item => item.status === 'failed').length,
      queuedEmails: db.data.Outbox.filter(item => item.status === 'pending').length,
      activeAdministrators: db.data.User.filter(item => item.role === 'admin' && item.status === 'active' && !item.deleted_at).length,
    },
    environment: process.env.NODE_ENV || 'development',
    checkedAt: now(),
  });
});

app.post('/api/admin/test-email', requireAdmin, authLimiter, async (req, res) => {
  const delivery = await sendEmail({
    to: req.user.email,
    subject: 'Reigns Atelier email service test',
    text: `Email delivery was tested successfully at ${now()}.`,
  });
  await audit(req.user, 'system.email_tested', 'System', null, { delivered: delivery.delivered });
  await save();
  res.status(delivery.delivered ? 200 : 502).json(delivery);
});

app.post('/api/admin/test-storage', requireAdmin, mutationLimiter, async (req, res) => {
  const id = `system-test-${newId()}`;
  const buffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  try {
    const stored = await storeFile({ buffer, mime: 'image/png', extension: 'png', uploadDir, id });
    await deleteStoredFile({ publicId: stored.publicId, resourceType: stored.resourceType, uploadDir });
    await audit(req.user, 'system.storage_tested', 'System', null, { provider: storageProvider });
    await save();
    res.json({ success: true, provider: storageProvider, uploadAndDelete: true });
  } catch (error) {
    await reportOperationalError('storage_rehearsal_failed', error, { actorId: req.user.id });
    res.status(502).json({ error: error.message });
  }
});

app.post('/api/admin/test-alert', requireAdmin, authLimiter, async (req, res) => {
  const result = await reportOperationalError(
    'administrator_alert_rehearsal',
    new Error('This is a controlled monitoring test from Studio Control.'),
    { actorId: req.user.id },
  );
  await audit(req.user, 'system.alert_tested', 'System', null, result);
  await save();
  res.status(result?.delivered ? 200 : 502).json(result);
});

app.post('/api/auth/register', authLimiter, verifyHuman, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const fullName = String(req.body.full_name || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const passwordError = passwordProblem(password);
  if (passwordError) return res.status(400).json({ error: passwordError });
  if (db.data.User.some(user => user.email === email)) {
    return res.status(409).json({ error: 'The account could not be created. Sign in or use account recovery.' });
  }
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
  const verificationUrl = `${publicOrigin}/verify-email?token=${encodeURIComponent(verificationToken)}`;
  await deliverEmail({ to: user.email, subject: 'Verify your Reigns Atelier email', text: `Verify your email address: ${verificationUrl}` });
  setSession(res, user, req);
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
  setSession(res, user, req);
  res.json(hiddenUserFields(user));
});

app.post('/api/auth/mfa/verify-login', authLimiter, async (req, res) => {
  try {
    const payload = jwt.verify(String(req.body.challenge || ''), jwtSecret);
    if (payload.purpose !== 'mfa') throw new Error();
    const user = db.data.User.find(item => item.id === payload.id && item.status === 'active');
    const suppliedCode = String(req.body.code || '');
    const authenticatorValid = user?.mfaSecret && /^\d{6}$/.test(suppliedCode)
      && authenticator.check(suppliedCode, decrypt(user.mfaSecret));
    const recoveryHash = hashToken(normalizeRecoveryCode(suppliedCode));
    const recoveryIndex = user?.mfaRecoveryCodeHashes?.findIndex(item => safeEqual(item, recoveryHash)) ?? -1;
    if (!user?.mfaSecret || (!authenticatorValid && recoveryIndex < 0)) {
      return res.status(401).json({ error: 'Invalid authentication code.' });
    }
    if (recoveryIndex >= 0) {
      user.mfaRecoveryCodeHashes.splice(recoveryIndex, 1);
      await audit(user, 'account.mfa_recovery_code_used', 'User', user.id, {
        remainingCodes: user.mfaRecoveryCodeHashes.length,
      });
      await save();
      await deliverEmail({
        to: user.email,
        subject: 'A Reigns Atelier recovery code was used',
        text: 'A one-time recovery code was used to sign in. If this was not you, reset your password immediately.',
      });
    }
    setSession(res, user, req);
    res.json(hiddenUserFields(user));
  } catch {
    res.status(401).json({ error: 'The authentication challenge expired. Sign in again.' });
  }
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('atelier_session');
  res.clearCookie('atelier_csrf');
  res.clearCookie('atelier_admin_access');
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

app.get('/api/auth/oauth/:provider/start', authLimiter, (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  const returnTo = safeLocalPath(req.query.returnTo, '/account?oauth=success');
  if (!['google', 'apple'].includes(provider) || !oauthConfigured(provider)) {
    return res.redirect(`/login?oauth=${encodeURIComponent('unavailable')}`);
  }
  const state = beginOAuth(res, provider, returnTo);
  const redirectUri = oauthCallbackUrl(provider);
  if (provider === 'google') {
    const query = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${query}`);
  }
  const query = new URLSearchParams({
    client_id: process.env.APPLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    response_mode: 'form_post',
    scope: 'name email',
    state,
  });
  return res.redirect(`https://appleid.apple.com/auth/authorize?${query}`);
});

async function completeOAuth(req, res, provider) {
  const state = validateOAuthState(req, res, provider);
  if (req.query?.error || req.body?.error) return res.redirect('/login?oauth=cancelled');
  const code = String(req.query?.code || req.body?.code || '');
  if (!code) throw new Error('No authorization code was returned.');
  const profile = await exchangeOAuthCode(provider, code);
  if (provider === 'apple' && req.body?.user) {
    try {
      const name = JSON.parse(req.body.user)?.name;
      profile.name = [name?.firstName, name?.lastName].filter(Boolean).join(' ') || profile.name;
    } catch {
      // Apple only supplies the optional name on the first consent response.
    }
  }
  return finishOAuthSignIn(req, res, provider, profile, state.returnTo);
}

app.get('/api/auth/oauth/google/callback', authLimiter, async (req, res) => {
  try {
    await completeOAuth(req, res, 'google');
  } catch (error) {
    reportOperationalError('google_oauth_failed', error);
    res.redirect('/login?oauth=failed');
  }
});

app.post('/api/auth/oauth/apple/callback', authLimiter, async (req, res) => {
  try {
    await completeOAuth(req, res, 'apple');
  } catch (error) {
    reportOperationalError('apple_oauth_failed', error);
    res.redirect('/login?oauth=failed');
  }
});

app.get('/api/admin/access', requireStaffIdentity, (req, res) => {
  res.json({
    unlocked: hasAdminAccess(req, req.user),
    mfaRequired: requiresProductionMfa(req.user),
  });
});

app.post('/api/admin/unlock', requireStaffIdentity, authLimiter, async (req, res) => {
  const passwordValid = await bcrypt.compare(String(req.body.password || ''), req.user.passwordHash);
  if (!passwordValid) return res.status(401).json({ error: 'The password is incorrect.' });
  if (requiresProductionMfa(req.user)) {
    return res.status(403).json({ error: 'Multi-factor authentication is required before opening Studio Control.', code: 'mfa_required' });
  }
  const accessToken = jwt.sign({
    id: req.user.id,
    version: req.user.sessionVersion || 0,
    purpose: 'admin_access',
  }, jwtSecret, { expiresIn: '30m' });
  res.cookie('atelier_admin_access', accessToken, {
    httpOnly: true,
    sameSite: 'strict',
    secure: secureCookie,
    maxAge: 30 * 60 * 1000,
  });
  res.json({ unlocked: true });
});

app.post('/api/admin/lock', requireStaffIdentity, (_req, res) => {
  res.clearCookie('atelier_admin_access');
  res.json({ unlocked: false });
});

app.post('/api/auth/forgot-password', authLimiter, verifyHuman, async (req, res) => {
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
    const url = `${publicOrigin}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await deliverEmail({ to: user.email, subject: 'Reset your Reigns Atelier password', text: `Reset your password: ${url}` });
  }
  res.json({ success: true });
});

app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  const rawToken = String(req.body.token || '');
  const password = String(req.body.password || '');
  const passwordError = passwordProblem(password);
  if (passwordError) return res.status(400).json({ error: passwordError });
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
  await deliverEmail({
    to: user.email,
    subject: 'Your Reigns Atelier password was changed',
    text: 'Your password was changed using account recovery. If this was not you, contact the studio immediately.',
  });
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
  const invitationUrl = `${publicOrigin}/accept-invite?token=${encodeURIComponent(rawToken)}`;
  const delivery = await deliverEmail({
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
  const invitationUrl = `${publicOrigin}/accept-invite?token=${encodeURIComponent(rawToken)}`;
  const delivery = await deliverEmail({ to: user.email, subject: 'Your Reigns Atelier invitation', text: `Accept your invitation: ${invitationUrl}` });
  await audit(req.user, 'user.invitation_resent', 'User', user.id);
  await save();
  res.json({ success: true, delivery });
});

app.post('/api/auth/accept-invite', authLimiter, async (req, res) => {
  const rawToken = String(req.body.token || '');
  const password = String(req.body.password || '');
  const passwordError = passwordProblem(password);
  if (passwordError) return res.status(400).json({ error: passwordError });
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
  setSession(res, user, req);
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
  const verificationUrl = `${publicOrigin}/verify-email?token=${encodeURIComponent(rawToken)}`;
  const delivery = await deliverEmail({ to: req.user.email, subject: 'Verify your Reigns Atelier email', text: `Verify your email address: ${verificationUrl}` });
  await save();
  res.json({ success: true, delivery });
});

app.post('/api/admin/mfa/setup', requireAdminIdentity, authLimiter, async (req, res) => {
  const secret = authenticator.generateSecret();
  req.user.pendingMfaSecret = encrypt(secret);
  await save();
  const label = encodeURIComponent(`Reigns Atelier:${req.user.email}`);
  const issuer = encodeURIComponent('Reigns Atelier');
  const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
  res.json({ qrDataUrl: await QRCode.toDataURL(otpauth), manualKey: secret });
});

app.post('/api/admin/mfa/enable', requireAdminIdentity, authLimiter, async (req, res) => {
  if (!req.user.pendingMfaSecret) return res.status(400).json({ error: 'Start MFA setup first.' });
  const secret = decrypt(req.user.pendingMfaSecret);
  if (!authenticator.check(String(req.body.code || ''), secret)) return res.status(400).json({ error: 'Invalid authentication code.' });
  req.user.mfaSecret = req.user.pendingMfaSecret;
  delete req.user.pendingMfaSecret;
  req.user.mfaEnabled = true;
  const recoveryCodes = setRecoveryCodes(req.user);
  await audit(req.user, 'account.mfa_enabled', 'User', req.user.id);
  await save();
  await deliverEmail({
    to: req.user.email,
    subject: 'Two-factor authentication enabled',
    text: 'Two-factor authentication was enabled for your Reigns Atelier account. Store your recovery codes securely.',
  });
  res.json({ success: true, recoveryCodes });
});

app.post('/api/admin/mfa/disable', requireAdmin, authLimiter, async (req, res) => {
  const passwordValid = await bcrypt.compare(String(req.body.password || ''), req.user.passwordHash);
  const codeValid = req.user.mfaSecret && authenticator.check(String(req.body.code || ''), decrypt(req.user.mfaSecret));
  if (!passwordValid || !codeValid) return res.status(400).json({ error: 'Password or authentication code is incorrect.' });
  delete req.user.mfaSecret;
  delete req.user.pendingMfaSecret;
  delete req.user.mfaRecoveryCodeHashes;
  req.user.mfaEnabled = false;
  await audit(req.user, 'account.mfa_disabled', 'User', req.user.id);
  await save();
  await deliverEmail({
    to: req.user.email,
    subject: 'Two-factor authentication disabled',
    text: 'Two-factor authentication was disabled for your Reigns Atelier account. If this was not you, reset your password immediately.',
  });
  res.json({ success: true });
});

app.post('/api/admin/mfa/recovery-codes', requireAdmin, authLimiter, async (req, res) => {
  const passwordValid = await bcrypt.compare(String(req.body.password || ''), req.user.passwordHash);
  const codeValid = req.user.mfaSecret
    && authenticator.check(String(req.body.code || ''), decrypt(req.user.mfaSecret));
  if (!passwordValid || !codeValid) {
    return res.status(400).json({ error: 'Password or authentication code is incorrect.' });
  }
  const recoveryCodes = setRecoveryCodes(req.user);
  await audit(req.user, 'account.mfa_recovery_codes_regenerated', 'User', req.user.id);
  await save();
  await deliverEmail({
    to: req.user.email,
    subject: 'New recovery codes generated',
    text: 'Your previous Reigns Atelier recovery codes were replaced. If this was not you, reset your password immediately.',
  });
  res.json({ success: true, recoveryCodes });
});

const chatTyping = new Map();
const chatStreams = new Map();
let redisPublisher = null;
let redisSubscriber = null;
let redisReady = false;
const redisInstanceId = randomBytes(8).toString('hex');
const isAdministrator = user => user?.role === 'admin';
const conversationHasAdministrator = conversation => (conversation.participantIds || []).some(id => {
  const participant = db.data.User.find(user => user.id === id && !user.deleted_at && user.status === 'active');
  return isAdministrator(participant);
});
// Customer messaging is a private studio-support channel. Staff can work with
// the full directory, while customers can access only Community Updates and
// conversations that include a current administrator.
const chatMember = (conversation, user) => Boolean(user && (
  conversation.type === 'announcement'
  || (conversation.type === 'group' && conversation.participantIds?.includes(user.id))
  || (conversation.participantIds?.includes(user.id)
    && (staffRoles.has(user.role) || conversationHasAdministrator(conversation)))
));
const emitLocalChatEvent = (userIds, event, data = {}) => {
  [...new Set(userIds || [])].forEach(userId => {
    (chatStreams.get(userId) || new Set()).forEach(response => {
      try { response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* stale stream cleanup happens on close */ }
    });
  });
};
const emitChatEvent = (userIds, event, data = {}) => {
  const uniqueUserIds = [...new Set(userIds || [])];
  emitLocalChatEvent(uniqueUserIds, event, data);
  if (redisReady) redisPublisher.publish('reigns:chat-events', JSON.stringify({ origin: redisInstanceId, userIds: uniqueUserIds, event, data })).catch(error => reportOperationalError('redis_publish_failed', error));
};
if (process.env.REDIS_URL) {
  try {
    redisPublisher = createClient({ url: process.env.REDIS_URL });
    redisSubscriber = redisPublisher.duplicate();
    redisPublisher.on('error', error => reportOperationalError('redis_error', error));
    redisSubscriber.on('error', error => reportOperationalError('redis_subscriber_error', error));
    await Promise.all([redisPublisher.connect(), redisSubscriber.connect()]);
    await redisSubscriber.subscribe('reigns:chat-events', raw => {
      try {
        const payload = JSON.parse(raw);
        if (payload.origin !== redisInstanceId) emitLocalChatEvent(payload.userIds, payload.event, payload.data);
      } catch (error) { reportOperationalError('redis_event_invalid', error); }
    });
    redisReady = true;
  } catch (error) {
    redisReady = false;
    reportOperationalError('redis_startup_failed', error);
  }
}
const chatUser = user => ({
  id: user.id,
  name: user.full_name || user.email.split('@')[0],
  role: user.role,
  avatarUrl: user.avatarUrl || '',
  avatarUpdatedAt: user.updated_date || user.created_date || null,
  online: Date.now() - new Date(user.lastSeenAt || 0).getTime() < 90_000,
  lastSeenAt: user.lastSeenAt || null,
});
const isConversationBlocked = conversation => Boolean(conversation.blockedBy?.length);
const chatMessageVisibleTo = (item, viewer) => !item.deleted_at
  && (!item.expiresAt || new Date(item.expiresAt).getTime() > Date.now())
  && !(item.hiddenFor || []).includes(viewer.id)
  && (!item.recipientIds?.length || item.senderId === viewer.id || staffRoles.has(viewer.role) || item.recipientIds.includes(viewer.id));
const latestVisibleChatMessage = (conversationId, viewer = null) => db.data.ChatMessage
  .filter(item => item.conversationId === conversationId && !item.deleted_at && (!viewer || chatMessageVisibleTo(item, viewer)))
  .sort((a, b) => String(b.created_date).localeCompare(String(a.created_date)))[0];
const refreshConversationSummary = conversation => {
  const latest = latestVisibleChatMessage(conversation.id);
  conversation.lastMessageAt = latest?.created_date || conversation.created_date;
  conversation.lastMessage = latest ? (latest.body || (latest.ciphertext ? 'Encrypted message' : '') || latest.attachmentName || 'Attachment') : 'Conversation started';
};
const unreadNotificationCount = userId => db.data.Notification.filter(item => (
  item.userId === userId && !item.read && !item.deleted_at
)).length;
const defaultNotificationPreferences = () => ({
  pushEnabled: true,
  messages: true,
  community: true,
  orders: true,
  studio: true,
  quietHours: { enabled: false, start: '22:00', end: '07:00', timezone: 'Africa/Accra' },
});
const notificationCategory = type => type?.startsWith('chat.announcement') ? 'community'
  : type?.startsWith('chat.') ? 'messages'
    : type?.startsWith('order.') || type?.startsWith('payment.') ? 'orders' : 'studio';
const minutesAtTimezone = timezone => {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    return Number(parts.find(part => part.type === 'hour')?.value) * 60 + Number(parts.find(part => part.type === 'minute')?.value);
  } catch { return new Date().getHours() * 60 + new Date().getMinutes(); }
};
const inQuietHours = preferences => {
  const quiet = preferences.quietHours || {};
  if (!quiet.enabled) return false;
  const toMinutes = value => { const [hour, minute] = String(value || '').split(':').map(Number); return hour * 60 + minute; };
  const current = minutesAtTimezone(quiet.timezone || 'Africa/Accra');
  const start = toMinutes(quiet.start || '22:00');
  const end = toMinutes(quiet.end || '07:00');
  return start <= end ? current >= start && current < end : current >= start || current < end;
};
const pushToUsers = async (userIds, payload, mutedBy = []) => {
  if (!pushConfigured) return;
  const category = payload.category || notificationCategory(payload.type);
  const recipients = db.data.PushSubscription.filter(item => {
    const user = db.data.User.find(entry => entry.id === item.userId);
    const preferences = { ...defaultNotificationPreferences(), ...(user?.notificationPreferences || {}) };
    return userIds.includes(item.userId) && !mutedBy.includes(item.userId) && !item.deleted_at
      && preferences.pushEnabled !== false && preferences[category] !== false && !inQuietHours(preferences);
  });
  await Promise.all(recipients.map(async item => {
    try {
      await webpush.sendNotification(item.subscription, JSON.stringify({
        ...payload,
        badgeCount: unreadNotificationCount(item.userId),
      }));
      item.lastUsedAt = now();
    } catch (error) {
      if ([404, 410].includes(error.statusCode)) item.deleted_at = now();
      else reportOperationalError('push_delivery_failed', error, { userId: item.userId });
    }
  }));
};

const audienceRecipients = audience => {
  const users = db.data.User.filter(item => !item.deleted_at && item.status === 'active');
  if (audience === 'staff') return users.filter(item => staffRoles.has(item.role));
  if (audience === 'partners') {
    const ids = new Set(db.data.PartnerApplication.filter(item => item.status === 'approved' && !item.deleted_at).map(item => item.userId));
    return users.filter(item => item.role === 'partner' || ids.has(item.id));
  }
  if (audience === 'interns') {
    const emails = new Set(db.data.InternshipApplication.filter(item => !item.deleted_at).map(item => String(item.email || '').toLowerCase()));
    return users.filter(item => item.role === 'intern' || emails.has(String(item.email).toLowerCase()));
  }
  if (audience === 'customers') return users.filter(item => item.role === 'customer');
  return users;
};
const publishCommunityUpdate = async update => {
  if (update.status === 'published' || update.status === 'cancelled') return false;
  const recipients = audienceRecipients(update.audience || 'all');
  const participantIds = recipients.map(item => item.id);
  let conversation = db.data.ChatConversation.find(item => item.type === 'announcement' && !item.deleted_at);
  if (!conversation) {
    conversation = { id: newId(), type: 'announcement', title: 'Community Updates', participantIds: [], pinnedBy: [], createdBy: update.createdBy, created_date: now() };
    db.data.ChatConversation.push(conversation);
  }
  conversation.participantIds = [...new Set([...(conversation.participantIds || []), ...participantIds])];
  conversation.pinnedBy = [...new Set([...(conversation.pinnedBy || []), ...participantIds])];
  const message = {
    id: newId(), conversationId: conversation.id, senderId: update.createdBy, body: update.body,
    announcement: true, announcementId: update.id, recipientIds: participantIds,
    announcementTitle: update.title, richMedia: update.richMedia || null, action: update.action || null,
    deliveredAt: now(), readBy: [update.createdBy], reactions: {}, created_date: now(),
  };
  db.data.ChatMessage.push(message);
  refreshConversationSummary(conversation);
  const recipientIds = participantIds.filter(id => id !== update.createdBy);
  recipientIds.forEach(userId => db.data.Notification.push({ id: newId(), userId, type: 'chat.announcement', title: update.title, message: update.body.slice(0, 180), section: 'messages', entity: 'CommunityUpdate', entityId: update.id, priority: 'normal', read: false, created_date: now() }));
  update.status = 'published'; update.publishedAt = now(); update.recipientIds = recipientIds; update.messageId = message.id; update.conversationId = conversation.id; update.updated_date = now();
  await pushToUsers(recipientIds, { title: update.title, body: update.body.slice(0, 180), url: `/messages?conversation=${conversation.id}`, tag: `community-${update.id}`, category: 'community' }, conversation.mutedBy || []);
  emitChatEvent(participantIds, 'message', { conversationId: conversation.id, messageId: message.id });
  return true;
};
const processScheduledCommunityUpdates = async () => {
  let lockToken = null;
  if (redisReady) {
    lockToken = `${redisInstanceId}:${Date.now()}`;
    const acquired = await redisPublisher.set('reigns:jobs:community-updates', lockToken, { NX: true, PX: 55_000 });
    if (!acquired) return;
  }
  try {
    let changed = false;
    for (const update of db.data.CommunityUpdate.filter(item => item.status === 'scheduled' && new Date(item.scheduledAt || 0).getTime() <= Date.now())) {
      changed = (await publishCommunityUpdate(update)) || changed;
    }
    if (changed) await save();
  } finally {
    if (redisReady && lockToken) {
      await redisPublisher.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", { keys: ['reigns:jobs:community-updates'], arguments: [lockToken] }).catch(() => {});
    }
  }
};
const backgroundQueue = await initializeJobQueue({
  handlers: {
    'community.publish-due': async () => { await processScheduledCommunityUpdates(); return { completedAt: now() }; },
    'voice.transcribe': async data => {
      if (!process.env.SPEECH_API_URL) throw new Error('SPEECH_API_URL is not configured.');
      const message = db.data.ChatMessage.find(item => item.id === data.messageId && !item.deleted_at);
      if (!message?.attachmentUrl || !String(message.attachmentType || '').startsWith('audio/')) throw new Error('Audio message not found.');
      const response = await fetch(process.env.SPEECH_API_URL, {
        method: 'POST', signal: AbortSignal.timeout(60_000),
        headers: { 'content-type': 'application/json', ...(process.env.SPEECH_API_TOKEN ? { authorization: `Bearer ${process.env.SPEECH_API_TOKEN}` } : {}) },
        body: JSON.stringify({ mediaUrl: message.attachmentUrl, language: data.language || 'auto', translateTo: data.translateTo || '' }),
      });
      if (!response.ok) throw new Error(`Speech service returned ${response.status}.`);
      const result = await response.json();
      message.transcription = String(result.transcription || '').slice(0, 20_000);
      message.translation = String(result.translation || '').slice(0, 20_000);
      message.transcribedAt = now(); await save();
      const conversation = db.data.ChatConversation.find(item => item.id === message.conversationId);
      emitChatEvent(conversation?.participantIds, 'message', { conversationId: message.conversationId, messageId: message.id });
      return { messageId: message.id };
    },
  },
  onDeadLetter: async (job, error) => {
    db.data.ChatJobFailure.push({ id: newId(), jobId: String(job.id), name: job.name, payload: job.data, attempts: job.attemptsMade, error: String(error?.message || error).slice(0, 2000), status: 'dead-letter', created_date: now() });
    await save();
    reportOperationalError('background_job_dead_lettered', error, { jobId: job.id, name: job.name });
  },
}).catch(error => {
  reportOperationalError('job_queue_startup_failed', error);
  return { configured: false, mode: 'direct' };
});
const communityUpdateTimer = backgroundJobsEnabled
  ? setInterval(() => enqueueJob('community.publish-due', {}, { jobId: `community-${Math.floor(Date.now() / 30000)}` }).catch(error => reportOperationalError('community_update_job_failed', error)), 30_000)
  : null;
communityUpdateTimer?.unref();
if (backgroundJobsEnabled) enqueueJob('community.publish-due', {}, { jobId: `community-startup-${Date.now()}` }).catch(error => reportOperationalError('community_update_startup_failed', error));
const conversationView = (item, viewer) => {
  const typing = chatTyping.get(item.id) || {};
  const typingUsers = Object.entries(typing)
    .filter(([id, at]) => id !== viewer.id && Date.now() - at < 6_000)
    .map(([id]) => db.data.User.find(user => user.id === id))
    .filter(Boolean)
    .map(chatUser);
  const latest = latestVisibleChatMessage(item.id, viewer);
  return {
    ...item,
    lastMessageAt: latest?.created_date || item.created_date,
    lastMessage: latest ? (latest.body || (latest.ciphertext ? 'Encrypted message' : '') || latest.attachmentName || 'Attachment') : 'Conversation started',
    participants: (item.participantIds || []).map(id => db.data.User.find(user => user.id === id)).filter(Boolean).map(chatUser),
    unread: db.data.ChatMessage.filter(message => message.conversationId === item.id && message.senderId !== viewer.id && !(message.readBy || []).includes(viewer.id) && chatMessageVisibleTo(message, viewer)).length,
    muted: Boolean(item.mutedBy?.includes(viewer.id)),
    archived: Boolean(item.archivedBy?.includes(viewer.id)),
    favourite: Boolean(item.favouritedBy?.includes(viewer.id)),
    pinned: Boolean(item.pinnedBy?.includes(viewer.id)),
    blocked: Boolean(item.blockedBy?.length),
    blockedByMe: Boolean(item.blockedBy?.includes(viewer.id)),
    typingUsers,
  };
};

app.get('/api/push/config', requireVerifiedUser, (_req, res) => {
  res.json({ configured: pushConfigured, publicKey: pushConfigured ? process.env.VAPID_PUBLIC_KEY : '' });
});

app.post('/api/push/subscriptions', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const subscription = req.body?.subscription;
  if (!pushConfigured) return res.status(503).json({ error: 'Push notifications are not configured yet.' });
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return res.status(400).json({ error: 'The browser subscription is incomplete.' });
  let record = db.data.PushSubscription.find(item => item.subscription?.endpoint === subscription.endpoint);
  if (!record) {
    record = { id: newId(), userId: req.user.id, subscription, userAgent: String(req.get('user-agent') || '').slice(0, 500), created_date: now() };
    db.data.PushSubscription.push(record);
  } else {
    record.userId = req.user.id; record.subscription = subscription; record.deleted_at = null; record.updated_date = now();
  }
  await save();
  res.status(201).json({ success: true });
});

app.delete('/api/push/subscriptions', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const endpoint = String(req.body?.endpoint || '');
  db.data.PushSubscription.filter(item => item.userId === req.user.id && (!endpoint || item.subscription?.endpoint === endpoint)).forEach(item => { item.deleted_at = now(); });
  await save();
  res.json({ success: true });
});

app.get('/api/chat/events', requireVerifiedUser, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const streams = chatStreams.get(req.user.id) || new Set();
  streams.add(res);
  chatStreams.set(req.user.id, streams);
  res.write(`event: ready\ndata: ${JSON.stringify({ connected: true })}\n\n`);
  const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(keepAlive);
    streams.delete(res);
    if (!streams.size) chatStreams.delete(req.user.id);
  });
});

app.get('/api/chat/directory', requireVerifiedUser, (req, res) => {
  // Customer accounts may discover studio administrators only. Staff retain
  // the operational directory needed to answer and manage customer chats.
  const people = db.data.User.filter(item => !item.deleted_at
    && item.status === 'active'
    && item.id !== req.user.id
    && (staffRoles.has(req.user.role) || item.role === 'admin')
    && (item.chatDiscoverable !== false || staffRoles.has(req.user.role)));
  res.json(people.map(chatUser));
});

app.get('/api/chat/group-directory', requireVerifiedUser, (req, res) => {
  const people = db.data.User.filter(item => !item.deleted_at && item.status === 'active' && item.id !== req.user.id
    && (item.chatDiscoverable !== false || staffRoles.has(req.user.role)));
  res.json(people.map(chatUser));
});

app.post('/api/chat/presence', requireVerifiedUser, async (req, res) => {
  const previous = new Date(req.user.lastSeenAt || 0).getTime();
  if (Date.now() - previous > 45_000) {
    req.user.lastSeenAt = now();
    await save();
  }
  res.json({ online: true });
});

app.get('/api/chat/conversations', requireVerifiedUser, async (req, res) => {
  let community = db.data.ChatConversation.find(item => item.type === 'announcement' && !item.deleted_at);
  let communityChanged = false;
  if (!community) {
    const participantIds = db.data.User.filter(item => !item.deleted_at && item.status === 'active').map(item => item.id);
    community = {
      id: newId(), type: 'announcement', title: 'Community Updates',
      participantIds, pinnedBy: participantIds,
      createdBy: db.data.User.find(item => item.role === 'admin' && !item.deleted_at)?.id || req.user.id,
      created_date: now(),
    };
    db.data.ChatConversation.push(community);
    communityChanged = true;
  } else if (!community.participantIds?.includes(req.user.id)) {
    community.participantIds = [...new Set([...(community.participantIds || []), req.user.id])];
    community.pinnedBy = [...new Set([...(community.pinnedBy || []), req.user.id])];
    communityChanged = true;
  }
  if (communityChanged) await save();
  const conversations = db.data.ChatConversation
    .filter(item => !item.deleted_at && chatMember(item, req.user))
    .sort((a, b) => Number(b.type === 'announcement') - Number(a.type === 'announcement')
      || Number(Boolean(b.pinnedBy?.includes(req.user.id))) - Number(Boolean(a.pinnedBy?.includes(req.user.id)))
      || String(b.lastMessageAt || b.created_date).localeCompare(String(a.lastMessageAt || a.created_date)))
    .map(item => conversationView(item, req.user));
  res.json(conversations);
});

app.post('/api/chat/conversations', requireVerifiedUser, mutationLimiter, async (req, res) => {
  let recipient = db.data.User.find(item => item.id === String(req.body.userId || '') && !item.deleted_at && item.status === 'active');
  if (!recipient) return res.status(404).json({ error: 'That person is no longer available. Choose another signed-in member.' });
  if (recipient.id === req.user.id) return res.status(400).json({ error: 'Choose another person.' });
  if (!staffRoles.has(req.user.role) && recipient.role !== 'admin') return res.status(403).json({ error: 'Customer conversations can be started with a studio administrator only.' });
  if (recipient.chatDiscoverable === false && !staffRoles.has(req.user.role)) return res.status(403).json({ error: 'That person is not accepting new conversations.' });
  const ids = [req.user.id, recipient.id].sort();
  let conversation = db.data.ChatConversation.find(item => !item.deleted_at && !['announcement', 'group'].includes(item.type) && JSON.stringify([...(item.participantIds || [])].sort()) === JSON.stringify(ids));
  if (!conversation) {
    conversation = { id: newId(), participantIds: ids, createdBy: req.user.id, lastMessageAt: now(), created_date: now() };
    db.data.ChatConversation.push(conversation);
    await save();
  }
  res.status(201).json(conversation);
});

app.post('/api/chat/groups', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, 100);
  const requested = Array.isArray(req.body.participantIds) ? req.body.participantIds.slice(0, 63).map(String) : [];
  const participantIds = [...new Set([req.user.id, ...requested])].filter(id => db.data.User.some(user => user.id === id && user.status === 'active' && !user.deleted_at
    && (id === req.user.id || user.chatDiscoverable !== false || staffRoles.has(req.user.role))));
  if (!title) return res.status(400).json({ error: 'Name the group.' });
  if (participantIds.length < 2) return res.status(400).json({ error: 'Choose at least one other member.' });
  const conversation = {
    id: newId(), type: 'group', title, participantIds, createdBy: req.user.id,
    roles: Object.fromEntries(participantIds.map(id => [id, id === req.user.id ? 'owner' : 'member'])),
    lastMessageAt: now(), created_date: now(),
  };
  db.data.ChatConversation.push(conversation);
  await audit(req.user, 'chat.group_created', 'ChatConversation', conversation.id, { participantCount: participantIds.length });
  await save(); emitChatEvent(participantIds, 'conversation', { conversationId: conversation.id });
  res.status(201).json(conversationView(conversation, req.user));
});

app.patch('/api/chat/groups/:id', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const conversation = db.data.ChatConversation.find(item => item.id === req.params.id && item.type === 'group' && !item.deleted_at);
  if (!conversation || !chatMember(conversation, req.user)) return res.status(404).json({ error: 'Group not found.' });
  const myRole = conversation.roles?.[req.user.id];
  if (req.body.action === 'leave') {
    if (myRole === 'owner') return res.status(400).json({ error: 'Transfer ownership before leaving this group.' });
    conversation.participantIds = conversation.participantIds.filter(id => id !== req.user.id);
    delete conversation.roles[req.user.id];
    conversation.updated_date = now(); await save();
    emitChatEvent(conversation.participantIds, 'conversation', { conversationId: conversation.id });
    return res.json({ success: true, left: true });
  }
  if (!['owner', 'admin'].includes(myRole) && !staffRoles.has(req.user.role)) return res.status(403).json({ error: 'Only group administrators can make this change.' });
  if (typeof req.body.title === 'string') conversation.title = String(req.body.title).trim().slice(0, 100) || conversation.title;
  if (Array.isArray(req.body.participantIds)) {
    const ids = [...new Set([conversation.createdBy, ...req.body.participantIds.slice(0, 63).map(String)])].filter(id => db.data.User.some(user => user.id === id && user.status === 'active' && !user.deleted_at
      && (conversation.participantIds.includes(id) || user.chatDiscoverable !== false || staffRoles.has(req.user.role))));
    conversation.participantIds = ids;
    conversation.roles = Object.fromEntries(ids.map(id => [id, conversation.roles?.[id] || (id === conversation.createdBy ? 'owner' : 'member')]));
  }
  if (req.body.userId && ['admin', 'member'].includes(req.body.role) && conversation.participantIds.includes(String(req.body.userId))) {
    const targetId = String(req.body.userId);
    if (conversation.roles[targetId] === 'owner') return res.status(400).json({ error: 'The group owner role cannot be changed.' });
    conversation.roles[targetId] = req.body.role;
  }
  conversation.updated_date = now(); await save();
  emitChatEvent(conversation.participantIds, 'conversation', { conversationId: conversation.id });
  res.json(conversationView(conversation, req.user));
});

app.get('/api/chat/stories', requireVerifiedUser, async (req, res) => {
  let changed = false;
  db.data.ChatStory.filter(item => !item.deleted_at && new Date(item.expiresAt).getTime() <= Date.now()).forEach(item => { item.deleted_at = now(); changed = true; });
  if (changed) await save();
  const active = db.data.ChatStory.filter(item => !item.deleted_at && new Date(item.expiresAt).getTime() > Date.now());
  res.json(active.map(item => {
    const canSeeViews = item.userId === req.user.id || staffRoles.has(req.user.role);
    return {
      ...item,
      views: canSeeViews ? item.views : undefined,
      viewCount: item.views?.length || 0,
      viewed: item.views?.some(view => view.userId === req.user.id) || false,
      mine: item.userId === req.user.id,
      author: chatUser(db.data.User.find(user => user.id === item.userId) || { id: '', email: 'removed@account', role: 'customer' }),
    };
  }));
});

app.post('/api/chat/stories', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const body = String(req.body.body || '').trim().slice(0, 1200);
  const mediaUrl = String(req.body.mediaUrl || '').trim().slice(0, 2048);
  if (!body && !mediaUrl) return res.status(400).json({ error: 'Add text, a photo, or a video.' });
  if (mediaUrl && !/^https?:\/\//i.test(mediaUrl) && !mediaUrl.startsWith('/uploads/')) return res.status(400).json({ error: 'The story media address is invalid.' });
  const story = { id: newId(), userId: req.user.id, body, mediaUrl, mediaType: String(req.body.mediaType || '').slice(0, 80), views: [], expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), created_date: now() };
  db.data.ChatStory.push(story); await save(); emitChatEvent(db.data.User.filter(user => user.status === 'active').map(user => user.id), 'story', { storyId: story.id });
  res.status(201).json(story);
});

app.post('/api/chat/stories/:id/view', requireVerifiedUser, async (req, res) => {
  const story = db.data.ChatStory.find(item => item.id === req.params.id && !item.deleted_at && new Date(item.expiresAt).getTime() > Date.now());
  if (!story) return res.status(404).json({ error: 'Story expired or was removed.' });
  story.views ||= []; if (!story.views.some(view => view.userId === req.user.id)) story.views.push({ userId: req.user.id, viewedAt: now() });
  await save(); res.json({ success: true });
});

app.delete('/api/chat/stories/:id', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const story = db.data.ChatStory.find(item => item.id === req.params.id && !item.deleted_at);
  if (!story || (story.userId !== req.user.id && !staffRoles.has(req.user.role))) return res.status(404).json({ error: 'Story not found.' });
  story.deleted_at = now(); await save(); res.json({ success: true });
});

app.post('/api/chat/announcements', requireAdmin, mutationLimiter, async (req, res) => {
  const title = String(req.body.title || 'Community Updates').trim().slice(0, 100);
  const body = String(req.body.body || '').trim().slice(0, 10_000);
  if (!body) return res.status(400).json({ error: 'Write an announcement.' });
  const audience = ['all', 'customers', 'partners', 'interns', 'staff'].includes(req.body.audience) ? req.body.audience : 'all';
  const scheduledAt = req.body.scheduledAt ? new Date(req.body.scheduledAt) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return res.status(400).json({ error: 'Choose a valid schedule date and time.' });
  const safeAnnouncementUrl = value => {
    const candidate = String(value || '').trim().slice(0, 2048);
    if (!candidate) return '';
    if (candidate.startsWith('/') && !candidate.startsWith('//')) return candidate;
    try {
      const parsed = new URL(candidate);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
    } catch {
      return '';
    }
  };
  const richType = ['image', 'product', 'film'].includes(req.body.richMedia?.type) ? req.body.richMedia.type : '';
  const richUrl = safeAnnouncementUrl(req.body.richMedia?.url);
  const richImageUrl = safeAnnouncementUrl(req.body.richMedia?.imageUrl);
  const actionUrl = safeAnnouncementUrl(req.body.action?.url);
  const update = {
    id: newId(), title, body, audience,
    status: scheduledAt && scheduledAt.getTime() > Date.now() + 30_000 ? 'scheduled' : 'draft',
    scheduledAt: scheduledAt?.toISOString() || null,
    richMedia: richType ? { type: richType, title: String(req.body.richMedia?.title || '').slice(0, 160), imageUrl: richImageUrl, url: richUrl } : null,
    action: req.body.action?.label && actionUrl ? { label: String(req.body.action.label).slice(0, 60), url: actionUrl } : null,
    createdBy: req.user.id, created_date: now(),
  };
  db.data.CommunityUpdate.push(update);
  if (update.status !== 'scheduled') await publishCommunityUpdate(update);
  await save();
  res.status(201).json({ ...update, type: 'announcement' });
});

app.get('/api/chat/announcements/manage', requireAdmin, (_req, res) => {
  res.json(db.data.CommunityUpdate.filter(item => !item.deleted_at).sort((a, b) => String(b.created_date).localeCompare(String(a.created_date))).map(item => {
    const message = db.data.ChatMessage.find(entry => entry.id === item.messageId);
    const recipients = item.recipientIds || [];
    return { ...item, deliveredCount: recipients.length, readCount: (message?.readBy || []).filter(id => recipients.includes(id)).length };
  }));
});

app.patch('/api/chat/announcements/:id/cancel', requireAdmin, mutationLimiter, async (req, res) => {
  const update = db.data.CommunityUpdate.find(item => item.id === req.params.id && !item.deleted_at);
  if (!update) return res.status(404).json({ error: 'Community update not found.' });
  if (update.status !== 'scheduled') return res.status(400).json({ error: 'Only scheduled updates can be cancelled.' });
  update.status = 'cancelled'; update.cancelledAt = now(); update.updated_date = now();
  await save(); res.json(update);
});

app.post('/api/chat/conversations/:id/typing', requireVerifiedUser, (req, res) => {
  const conversation = db.data.ChatConversation.find(item => item.id === req.params.id && !item.deleted_at);
  if (!conversation || !chatMember(conversation, req.user)) return res.status(404).json({ error: 'Conversation not found.' });
  const state = chatTyping.get(conversation.id) || {};
  if (req.body.typing) state[req.user.id] = Date.now(); else delete state[req.user.id];
  chatTyping.set(conversation.id, state);
  emitChatEvent(conversation.participantIds, 'typing', { conversationId: conversation.id });
  res.json({ success: true });
});

app.patch('/api/chat/conversations/:id/settings', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const conversation = db.data.ChatConversation.find(item => item.id === req.params.id && !item.deleted_at);
  if (!conversation || !chatMember(conversation, req.user)) return res.status(404).json({ error: 'Conversation not found.' });
  const toggle = (field, enabled) => {
    conversation[field] ||= [];
    conversation[field] = enabled ? [...new Set([...conversation[field], req.user.id])] : conversation[field].filter(id => id !== req.user.id);
  };
  if (typeof req.body.muted === 'boolean') toggle('mutedBy', req.body.muted);
  if (typeof req.body.archived === 'boolean') toggle('archivedBy', req.body.archived);
  if (typeof req.body.favourite === 'boolean') toggle('favouritedBy', req.body.favourite);
  if (typeof req.body.pinned === 'boolean') toggle('pinnedBy', req.body.pinned);
  if (typeof req.body.blocked === 'boolean') toggle('blockedBy', req.body.blocked);
  if (req.body.markUnread === true) {
    const latestIncoming = [...db.data.ChatMessage]
      .filter(message => message.conversationId === conversation.id && message.senderId !== req.user.id && !message.deleted_at)
      .sort((a, b) => String(b.created_date).localeCompare(String(a.created_date)))[0];
    if (latestIncoming) latestIncoming.readBy = (latestIncoming.readBy || []).filter(id => id !== req.user.id);
  }
  conversation.updated_date = now();
  await save();
  emitChatEvent(conversation.participantIds, 'conversation', { conversationId: conversation.id });
  res.json(conversationView(conversation, req.user));
});

app.post('/api/chat/conversations/:id/report', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const conversation = db.data.ChatConversation.find(item => item.id === req.params.id && !item.deleted_at);
  if (!conversation || !chatMember(conversation, req.user) || conversation.type === 'announcement') return res.status(404).json({ error: 'Conversation not found.' });
  const reason = String(req.body.reason || '').trim().slice(0, 120);
  const details = String(req.body.details || '').trim().slice(0, 2000);
  if (!reason) return res.status(400).json({ error: 'Choose or enter a reason for the report.' });
  const existing = db.data.ChatReport.find(item => item.conversationId === conversation.id && item.reporterId === req.user.id && item.status === 'open' && !item.deleted_at);
  if (existing) return res.status(409).json({ error: 'This conversation already has an open report from you.' });
  const report = { id: newId(), conversationId: conversation.id, reporterId: req.user.id, reportedUserIds: (conversation.participantIds || []).filter(id => id !== req.user.id), messageId: String(req.body.messageId || '') || null, reason, details, status: 'open', created_date: now() };
  db.data.ChatReport.push(report);
  notifyStudioStaff({ title: 'Private conversation reported', message: `${req.user.full_name || 'A member'} reported a conversation: ${reason}`, section: 'chat-reports', entity: 'ChatReport', entityId: report.id, priority: 'high' });
  await save();
  res.status(201).json(report);
});

app.get('/api/chat/reports', requireAdmin, (_req, res) => {
  res.json(db.data.ChatReport.filter(item => !item.deleted_at).sort((a, b) => String(b.created_date).localeCompare(String(a.created_date))).map(item => ({
    ...item,
    reporter: chatUser(db.data.User.find(user => user.id === item.reporterId) || { id: '', email: 'removed@account', role: 'customer' }),
    reportedUsers: (item.reportedUserIds || []).map(id => db.data.User.find(user => user.id === id)).filter(Boolean).map(chatUser),
  })));
});

app.patch('/api/chat/reports/:id', requireAdmin, mutationLimiter, async (req, res) => {
  const report = db.data.ChatReport.find(item => item.id === req.params.id && !item.deleted_at);
  if (!report) return res.status(404).json({ error: 'Report not found.' });
  if (['open', 'reviewing', 'resolved', 'dismissed'].includes(req.body.status)) report.status = req.body.status;
  report.moderatorNotes = String(req.body.moderatorNotes || report.moderatorNotes || '').slice(0, 2000);
  report.reviewedBy = req.user.id; report.updated_date = now();
  await audit(req.user, 'chat.report_reviewed', 'ChatReport', report.id, { status: report.status });
  await save(); res.json(report);
});

const boundedExpiry = value => {
  const seconds = Number(value || 0);
  return Number.isFinite(seconds) && seconds >= 60 && seconds <= 30 * 24 * 60 * 60
    ? new Date(Date.now() + seconds * 1000).toISOString() : null;
};
const cleanSharedLocation = value => {
  if (!value || typeof value !== 'object') return null;
  const latitude = Number(value.latitude); const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude, label: String(value.label || '').trim().slice(0, 160) };
};
const cleanSharedContact = value => {
  if (!value || typeof value !== 'object') return null;
  const name = String(value.name || '').trim().slice(0, 120);
  const phone = String(value.phone || '').trim().replace(/[^+\d()\-\s]/g, '').slice(0, 40);
  const email = String(value.email || '').trim().toLowerCase().slice(0, 180);
  return name && (phone || email) ? { name, phone, email } : null;
};
const messageRisk = (userId, body) => {
  const recent = db.data.ChatMessage.filter(item => item.senderId === userId && Date.now() - new Date(item.created_date).getTime() < 60_000);
  const duplicateCount = recent.filter(item => item.body && item.body === body).length;
  const urlCount = (body.match(/https?:\/\//gi) || []).length;
  return Math.min(100, recent.length * 4 + duplicateCount * 22 + Math.max(0, urlCount - 2) * 15);
};
const messageExtensions = (entry, replyTo) => ({
  replyToId: replyTo?.id || null,
  replyPreview: replyTo ? String(replyTo.body || replyTo.attachmentName || 'Attachment').slice(0, 180) : '',
  replyMediaPreview: replyTo?.attachmentUrl ? { type: String(replyTo.attachmentType || '').slice(0, 80), name: String(replyTo.attachmentName || '').slice(0, 180), url: replyTo.attachmentUrl } : null,
  expiresAt: boundedExpiry(entry?.expiresInSeconds),
  viewOnce: Boolean(entry?.viewOnce), viewedOnceBy: [],
  sharedLocation: cleanSharedLocation(entry?.sharedLocation),
  sharedContact: cleanSharedContact(entry?.sharedContact),
  ciphertext: String(entry?.ciphertext || '').slice(0, 50_000),
  encryption: entry?.ciphertext ? { algorithm: String(entry?.encryption?.algorithm || 'X25519-AES-GCM').slice(0, 40), keyId: String(entry?.encryption?.keyId || '').slice(0, 120), version: 1 } : null,
});
const chatPushPayload = (message, sender, conversationId, batchCount = 1) => {
  const type = String(message?.attachmentType || '').toLowerCase();
  const attachmentLabel = type.startsWith('image/') ? '📷 Photo'
    : type.startsWith('video/') ? '🎥 Video'
      : type.startsWith('audio/') ? '🎙️ Voice message'
        : message?.attachmentName ? `📎 ${message.attachmentName}` : '';
  const body = String(message?.body || (message?.ciphertext ? 'Encrypted message' : '') || (batchCount > 1 ? `${batchCount} new attachments` : attachmentLabel) || 'New message').slice(0, 180);
  const url = `/messages?conversation=${conversationId}`;
  return {
    title: `New message from ${sender.full_name || 'Reigns Atelier'}`,
    body,
    url,
    replyUrl: url,
    tag: `chat-${conversationId}`,
    icon: sender.avatarUrl || '/brand/reigns-app-icon-192.png',
    image: type.startsWith('image/') ? message.attachmentUrl : undefined,
    category: 'chat',
  };
};

app.get('/api/chat/conversations/:id/messages', requireVerifiedUser, (req, res) => {
  const conversation = db.data.ChatConversation.find(item => item.id === req.params.id && !item.deleted_at);
  if (!conversation || !chatMember(conversation, req.user)) return res.status(404).json({ error: 'Conversation not found.' });
  const query = String(req.query.q || '').trim().toLowerCase();
  const allRows = db.data.ChatMessage
    .filter(item => item.conversationId === conversation.id && chatMessageVisibleTo(item, req.user)
      && (!query || `${item.body || ''} ${item.attachmentName || ''}`.toLowerCase().includes(query)))
    .sort((a, b) => String(`${a.created_date}|${a.id}`).localeCompare(String(`${b.created_date}|${b.id}`)));
  const requestedLimit = Math.min(100, Math.max(1, Number(req.query.limit || 0)));
  if (!req.query.limit || query) return res.json(allRows);
  const before = String(req.query.before || '');
  const eligible = before ? allRows.filter(item => `${item.created_date}|${item.id}` < before) : allRows;
  const items = eligible.slice(-requestedLimit);
  res.json({ items, nextCursor: eligible.length > items.length && items[0] ? `${items[0].created_date}|${items[0].id}` : null });
});

app.post('/api/chat/conversations/:id/messages', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const conversation = db.data.ChatConversation.find(item => item.id === req.params.id && !item.deleted_at);
  if (!conversation || !chatMember(conversation, req.user)) return res.status(404).json({ error: 'Conversation not found.' });
  if (conversation.type === 'announcement' && !staffRoles.has(req.user.role)) return res.status(403).json({ error: 'Only studio staff can post announcements.' });
  if (isConversationBlocked(conversation)) return res.status(403).json({ error: 'Unblock this conversation before sending a message.' });
  const clientId = String(req.body.clientId || '').trim().slice(0, 100);
  if (clientId) {
    const existing = db.data.ChatMessage.find(item => item.conversationId === conversation.id && item.senderId === req.user.id && item.clientId === clientId && !item.deleted_at);
    if (existing) return res.status(200).json(existing);
  }
  const body = String(req.body.body || '').trim().slice(0, 10000);
  const attachmentUrl = String(req.body.attachmentUrl || '').trim().slice(0, 2048);
  const sharedLocation = cleanSharedLocation(req.body.sharedLocation);
  const sharedContact = cleanSharedContact(req.body.sharedContact);
  const ciphertext = String(req.body.ciphertext || '').trim();
  if (!body && !attachmentUrl && !sharedLocation && !sharedContact && !ciphertext) return res.status(400).json({ error: 'Write a message or attach something.' });
  if (attachmentUrl && !/^https?:\/\//i.test(attachmentUrl) && !attachmentUrl.startsWith('/uploads/')) {
    return res.status(400).json({ error: 'The attachment address is not valid.' });
  }
  const replyToId = String(req.body.replyToId || '').trim();
  const replyTo = replyToId
    ? db.data.ChatMessage.find(item => item.id === replyToId && item.conversationId === conversation.id && !item.deleted_at)
    : null;
  const riskScore = messageRisk(req.user.id, body);
  if (riskScore >= 80 && !staffRoles.has(req.user.role)) return res.status(429).json({ error: 'This message was paused by spam protection. Wait a moment and try again.' });
  const message = {
    id: newId(), clientId: clientId || null, conversationId: conversation.id, senderId: req.user.id, body,
    attachmentUrl, attachmentName: String(req.body.attachmentName || '').slice(0, 240),
    attachmentType: String(req.body.attachmentType || '').slice(0, 120),
    attachmentBytes: Math.max(0, Number(req.body.attachmentBytes || 0)),
    ...messageExtensions(req.body, replyTo), sharedLocation, sharedContact,
    allowForward: staffRoles.has(req.user.role) ? Boolean(req.body.allowForward) : false,
    deliveredAt: now(), readBy: [req.user.id], reactions: {}, created_date: now(),
  };
  if (riskScore >= 45) db.data.ChatModerationEvent.push({ id: newId(), type: 'spam_score', status: 'review', score: riskScore, userId: req.user.id, messageId: message.id, conversationId: conversation.id, created_date: now() });
  db.data.ChatMessage.push(message);
  conversation.lastMessageAt = message.created_date;
  conversation.lastMessage = body || (message.ciphertext ? 'Encrypted message' : '') || message.attachmentName || 'Attachment';
  const recipientIds = (conversation.participantIds || []).filter(id => id !== req.user.id);
  recipientIds.forEach(userId => db.data.Notification.push({ id: newId(), userId, type: 'chat.message', title: `New message from ${req.user.full_name || req.user.email}`, message: conversation.lastMessage.slice(0, 180), section: 'messages', entity: 'ChatConversation', entityId: conversation.id, priority: 'normal', read: false, created_date: now() }));
  await pushToUsers(recipientIds, chatPushPayload(message, req.user, conversation.id), conversation.mutedBy || []);
  await save();
  emitChatEvent(conversation.participantIds, 'message', { conversationId: conversation.id, messageId: message.id });
  res.status(201).json(message);
});

app.post('/api/chat/conversations/:id/messages/batch', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const conversation = db.data.ChatConversation.find(item => item.id === req.params.id && !item.deleted_at);
  if (!conversation || !chatMember(conversation, req.user)) return res.status(404).json({ error: 'Conversation not found.' });
  if (conversation.type === 'announcement' && !staffRoles.has(req.user.role)) return res.status(403).json({ error: 'Only studio staff can post announcements.' });
  if (isConversationBlocked(conversation)) return res.status(403).json({ error: 'Unblock this conversation before sending a message.' });
  const entries = Array.isArray(req.body.messages) ? req.body.messages.slice(0, 10) : [];
  if (!entries.length) return res.status(400).json({ error: 'Add at least one message or file.' });
  const replyToId = String(entries[0]?.replyToId || '').trim();
  const replyTo = replyToId
    ? db.data.ChatMessage.find(item => item.id === replyToId && item.conversationId === conversation.id && !item.deleted_at)
    : null;
  const created = [];
  for (const [index, entry] of entries.entries()) {
    const clientId = String(entry?.clientId || '').trim().slice(0, 100);
    const existing = clientId && db.data.ChatMessage.find(item => item.conversationId === conversation.id && item.senderId === req.user.id && item.clientId === clientId && !item.deleted_at);
    if (existing) { created.push(existing); continue; }
    const body = String(entry?.body || '').trim().slice(0, 10000);
    const attachmentUrl = String(entry?.attachmentUrl || '').trim().slice(0, 2048);
    const extension = messageExtensions(entry, index === 0 ? replyTo : null);
    if (!body && !attachmentUrl && !extension.sharedLocation && !extension.sharedContact && !extension.ciphertext) return res.status(400).json({ error: `Message ${index + 1} is empty.` });
    if (attachmentUrl && !/^https?:\/\//i.test(attachmentUrl) && !attachmentUrl.startsWith('/uploads/')) {
      return res.status(400).json({ error: `Attachment ${index + 1} has an invalid address.` });
    }
    created.push({
      id: newId(), clientId: clientId || null, conversationId: conversation.id, senderId: req.user.id, body,
      attachmentUrl, attachmentName: String(entry?.attachmentName || '').slice(0, 240),
      attachmentType: String(entry?.attachmentType || '').slice(0, 120),
      attachmentBytes: Math.max(0, Number(entry?.attachmentBytes || 0)),
      ...extension,
      allowForward: staffRoles.has(req.user.role) ? Boolean(entry?.allowForward) : false,
      deliveredAt: now(), readBy: [req.user.id], reactions: {}, created_date: now(),
    });
  }
  const existingMessageIds = new Set(db.data.ChatMessage.map(item => item.id));
  const fresh = created.filter(item => !existingMessageIds.has(item.id));
  if (!fresh.length) return res.status(200).json(created);
  db.data.ChatMessage.push(...fresh);
  const last = fresh.at(-1);
  conversation.lastMessageAt = last.created_date;
  conversation.lastMessage = last.body || (last.ciphertext ? 'Encrypted message' : '') || last.attachmentName || (fresh.length > 1 ? `${fresh.length} attachments` : 'Attachment');
  const recipientIds = (conversation.participantIds || []).filter(id => id !== req.user.id);
  recipientIds.forEach(userId => db.data.Notification.push({ id: newId(), userId, type: 'chat.message', title: `New message from ${req.user.full_name || req.user.email}`, message: conversation.lastMessage.slice(0, 180), section: 'messages', entity: 'ChatConversation', entityId: conversation.id, priority: 'normal', read: false, created_date: now() }));
  await pushToUsers(recipientIds, chatPushPayload(last, req.user, conversation.id, fresh.length), conversation.mutedBy || []);
  await save();
  emitChatEvent(conversation.participantIds, 'message', { conversationId: conversation.id, messageIds: fresh.map(item => item.id) });
  res.status(201).json(created);
});

app.post('/api/chat/conversations/:id/read', requireVerifiedUser, async (req, res) => {
  const conversation = db.data.ChatConversation.find(item => item.id === req.params.id && !item.deleted_at);
  if (!conversation || !chatMember(conversation, req.user)) return res.status(404).json({ error: 'Conversation not found.' });
  const firstReadAt = now();
  db.data.ChatMessage
    .filter(item => item.conversationId === conversation.id && item.senderId !== req.user.id && !(item.readBy || []).includes(req.user.id))
    .forEach(item => { item.readBy = [...new Set([...(item.readBy || []), req.user.id])]; item.readAt ||= firstReadAt; });
  db.data.Notification
    .filter(item => item.userId === req.user.id && item.entity === 'ChatConversation' && item.entityId === conversation.id && !item.read && !item.deleted_at)
    .forEach(item => { item.read = true; item.readAt = firstReadAt; });
  await save();
  emitChatEvent(conversation.participantIds, 'read', { conversationId: conversation.id, userId: req.user.id });
  res.json({ success: true });
});

app.patch('/api/chat/messages/:id/forwarding', requireAdmin, mutationLimiter, async (req, res) => {
  const message = db.data.ChatMessage.find(item => item.id === req.params.id && !item.deleted_at);
  if (!message) return res.status(404).json({ error: 'Message not found.' });
  message.allowForward = Boolean(req.body.allowed); message.updated_date = now();
  await save();
  const conversation = db.data.ChatConversation.find(item => item.id === message.conversationId && !item.deleted_at);
  emitChatEvent(conversation?.participantIds, 'message', { conversationId: message.conversationId, messageId: message.id });
  res.json(message);
});

app.post('/api/chat/messages/:id/forward', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const source = db.data.ChatMessage.find(item => item.id === req.params.id && !item.deleted_at && !item.deletedForEveryone);
  const sourceConversation = source && db.data.ChatConversation.find(item => item.id === source.conversationId && !item.deleted_at);
  const target = db.data.ChatConversation.find(item => item.id === String(req.body.conversationId || '') && !item.deleted_at);
  if (!source || !sourceConversation || !chatMember(sourceConversation, req.user)) return res.status(404).json({ error: 'Message not found.' });
  if (!target || !chatMember(target, req.user)) return res.status(404).json({ error: 'Destination conversation not found.' });
  if (target.type === 'announcement' && !staffRoles.has(req.user.role)) return res.status(403).json({ error: 'Only studio staff can post announcements.' });
  if (!source.allowForward && !staffRoles.has(req.user.role)) return res.status(403).json({ error: 'The sender has not allowed this attachment to be forwarded.' });
  const forwarded = {
    id: newId(), conversationId: target.id, senderId: req.user.id,
    body: source.body, attachmentUrl: source.attachmentUrl, attachmentName: source.attachmentName,
    attachmentType: source.attachmentType, attachmentBytes: source.attachmentBytes,
    forwardedFromId: source.id, forwarded: true, allowForward: staffRoles.has(req.user.role),
    deliveredAt: now(), readBy: [req.user.id], reactions: {}, created_date: now(),
  };
  db.data.ChatMessage.push(forwarded);
  target.lastMessageAt = forwarded.created_date;
  target.lastMessage = forwarded.body || forwarded.attachmentName || 'Forwarded message';
  await save();
  emitChatEvent(target.participantIds, 'message', { conversationId: target.id, messageId: forwarded.id });
  res.status(201).json(forwarded);
});

app.post('/api/chat/messages/:id/reaction', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const message = db.data.ChatMessage.find(item => item.id === req.params.id && !item.deleted_at);
  const conversation = message && db.data.ChatConversation.find(item => item.id === message.conversationId && !item.deleted_at);
  if (!message || !conversation || !chatMember(conversation, req.user)) return res.status(404).json({ error: 'Message not found.' });
  const emoji = String(req.body.emoji || '').slice(0, 8);
  message.reactions ||= {};
  if (!emoji) delete message.reactions[req.user.id];
  else if (!['👍', '❤️', '😂', '😮', '😢', '🙏'].includes(emoji)) return res.status(400).json({ error: 'Choose a supported reaction.' });
  else message.reactions[req.user.id] = emoji;
  message.updated_date = now();
  await save();
  emitChatEvent(conversation.participantIds, 'message', { conversationId: conversation.id, messageId: message.id });
  res.json(message);
});

app.patch('/api/chat/messages/:id/star', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const message = db.data.ChatMessage.find(item => item.id === req.params.id && !item.deleted_at);
  const conversation = message && db.data.ChatConversation.find(item => item.id === message.conversationId && !item.deleted_at);
  if (!message || !conversation || !chatMember(conversation, req.user)) return res.status(404).json({ error: 'Message not found.' });
  message.starredBy ||= [];
  message.starredBy = req.body.starred === false
    ? message.starredBy.filter(id => id !== req.user.id)
    : [...new Set([...message.starredBy, req.user.id])];
  message.updated_date = now();
  await save();
  res.json(message);
});

app.post('/api/chat/messages/:id/consume', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const message = db.data.ChatMessage.find(item => item.id === req.params.id && item.viewOnce && !item.deleted_at && !item.deletedForEveryone);
  const conversation = message && db.data.ChatConversation.find(item => item.id === message.conversationId && !item.deleted_at);
  if (!message || !conversation || !chatMember(conversation, req.user)) return res.status(404).json({ error: 'View-once message not found.' });
  if (message.senderId === req.user.id) return res.json({ consumed: false, owner: true });
  message.viewedOnceBy ||= [];
  if (!message.viewedOnceBy.includes(req.user.id)) message.viewedOnceBy.push(req.user.id);
  await save(); emitChatEvent(conversation.participantIds, 'message', { conversationId: conversation.id, messageId: message.id });
  res.json({ consumed: true });
});

app.post('/api/chat/messages/:id/transcribe', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const message = db.data.ChatMessage.find(item => item.id === req.params.id && !item.deleted_at);
  const conversation = message && db.data.ChatConversation.find(item => item.id === message.conversationId && !item.deleted_at);
  if (!message || !conversation || !chatMember(conversation, req.user) || !String(message.attachmentType || '').startsWith('audio/')) return res.status(404).json({ error: 'Voice note not found.' });
  if (!process.env.SPEECH_API_URL) return res.status(503).json({ error: 'Voice transcription is not configured yet.' });
  const result = await enqueueJob('voice.transcribe', { messageId: message.id, language: String(req.body.language || 'auto').slice(0, 20), translateTo: String(req.body.translateTo || '').slice(0, 20) }, { jobId: `transcribe-${message.id}-${String(req.body.translateTo || 'original')}` });
  res.status(202).json(result);
});

app.get('/api/chat/saved-collections', requireVerifiedUser, (req, res) => {
  res.json(db.data.ChatSavedCollection.filter(item => item.userId === req.user.id && !item.deleted_at));
});

app.post('/api/chat/saved-collections', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: 'Name the collection.' });
  const collection = { id: newId(), userId: req.user.id, name, messageIds: [], created_date: now() };
  db.data.ChatSavedCollection.push(collection); await save(); res.status(201).json(collection);
});

app.patch('/api/chat/saved-collections/:id', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const collection = db.data.ChatSavedCollection.find(item => item.id === req.params.id && item.userId === req.user.id && !item.deleted_at);
  if (!collection) return res.status(404).json({ error: 'Saved collection not found.' });
  if (typeof req.body.name === 'string') collection.name = String(req.body.name).trim().slice(0, 80) || collection.name;
  if (req.body.messageId) {
    const messageId = String(req.body.messageId);
    const message = db.data.ChatMessage.find(item => item.id === messageId && !item.deleted_at);
    const conversation = message && db.data.ChatConversation.find(item => item.id === message.conversationId && chatMember(item, req.user));
    if (!conversation) return res.status(404).json({ error: 'Message not found.' });
    collection.messageIds ||= [];
    collection.messageIds = req.body.saved === false ? collection.messageIds.filter(id => id !== messageId) : [...new Set([...collection.messageIds, messageId])];
  }
  collection.updated_date = now(); await save(); res.json(collection);
});

app.put('/api/chat/keys', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const deviceId = String(req.body.deviceId || '').trim().slice(0, 160);
  const identityKey = String(req.body.identityKey || '').trim().slice(0, 4096);
  const signedPreKey = String(req.body.signedPreKey || '').trim().slice(0, 4096);
  const signature = String(req.body.signature || '').trim().slice(0, 4096);
  if (!deviceId || !identityKey || !signedPreKey || !signature) return res.status(400).json({ error: 'Device ID, identity key, signed pre-key, and signature are required.' });
  let bundle = db.data.ChatKeyBundle.find(item => item.userId === req.user.id && item.deviceId === deviceId && !item.deleted_at);
  const oneTimePreKeys = Array.isArray(req.body.oneTimePreKeys) ? req.body.oneTimePreKeys.slice(0, 100).map(value => String(value).slice(0, 4096)) : [];
  if (!bundle) { bundle = { id: newId(), userId: req.user.id, deviceId, created_date: now() }; db.data.ChatKeyBundle.push(bundle); }
  Object.assign(bundle, { identityKey, signedPreKey, signature, algorithm: 'ECDSA-P256+ECDH-P256+AES-GCM', oneTimePreKeys, lastSeenAt: now(), updated_date: now() });
  await save(); res.json({ success: true, keyId: bundle.id, oneTimePreKeyCount: oneTimePreKeys.length });
});

app.get('/api/chat/keys/:userId', requireVerifiedUser, async (req, res) => {
  const userId = String(req.params.userId);
  const sharesConversation = db.data.ChatConversation.some(item => !item.deleted_at && item.participantIds?.includes(req.user.id) && item.participantIds?.includes(userId));
  if (!sharesConversation) return res.status(403).json({ error: 'Start a conversation before requesting encryption keys.' });
  const bundles = db.data.ChatKeyBundle.filter(item => item.userId === userId && !item.deleted_at);
  if (!bundles.length) return res.status(404).json({ error: 'This user has not enabled encrypted messaging on a device.' });
  res.json({
    userId,
    devices: bundles.map(bundle => ({
      keyId: bundle.id, deviceId: bundle.deviceId || bundle.id, identityKey: bundle.identityKey,
      signedPreKey: bundle.signedPreKey, signature: bundle.signature, algorithm: bundle.algorithm || 'legacy',
      updatedAt: bundle.updated_date || bundle.created_date,
    })),
  });
});

const CALL_RING_TIMEOUT_MS = 45_000;
const closeExpiredCalls = async () => {
  const expired = db.data.ChatCall.filter(call => !call.deleted_at && call.status === 'ringing' && Date.now() - new Date(call.created_date).getTime() >= CALL_RING_TIMEOUT_MS);
  if (!expired.length) return;
  expired.forEach(call => {
    call.status = 'missed'; call.endedAt = now(); call.updated_date = now(); call.signals = [];
    emitChatEvent(call.participantIds, 'call', { callId: call.id, conversationId: call.conversationId, action: 'missed' });
  });
  await save();
};
const callView = (call, viewerId) => {
  const peerId = call.participantIds?.find(id => id !== viewerId);
  const peer = db.data.User.find(item => item.id === peerId);
  return {
    ...call,
    signals: undefined,
    pendingSignals: (call.signals || []).filter(item => item.fromUserId !== viewerId).map(item => item.signal),
    direction: call.initiatorId === viewerId ? 'outgoing' : 'incoming',
    peer: peer ? chatUser(peer) : null,
  };
};
const rtcConfiguration = userId => {
  const stunUrls = String(process.env.STUN_URLS || 'stun:stun.l.google.com:19302').split(',').map(value => value.trim()).filter(Boolean);
  const turnUrls = String(process.env.TURN_URLS || '').split(',').map(value => value.trim()).filter(Boolean);
  const iceServers = stunUrls.length ? [{ urls: stunUrls }] : [];
  if (turnUrls.length) {
    let username = String(process.env.TURN_USERNAME || '');
    let credential = String(process.env.TURN_CREDENTIAL || '');
    if (process.env.TURN_SHARED_SECRET) {
      username = `${Math.floor(Date.now() / 1000) + 3600}:${userId}`;
      credential = createHmac('sha1', process.env.TURN_SHARED_SECRET).update(username).digest('base64');
    }
    if (username && credential) iceServers.push({ urls: turnUrls, username, credential });
  }
  return { iceServers, turnConfigured: turnUrls.length > 0 && iceServers.length > 1, credentialExpiresIn: process.env.TURN_SHARED_SECRET ? 3600 : null };
};

app.get('/api/chat/rtc-config', requireVerifiedUser, (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(rtcConfiguration(_req.user.id));
});

app.get('/api/chat/calls', requireVerifiedUser, async (req, res) => {
  await closeExpiredCalls();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const calls = db.data.ChatCall.filter(item => !item.deleted_at && item.participantIds?.includes(req.user.id))
    .sort((a, b) => String(b.created_date).localeCompare(String(a.created_date))).slice(0, limit);
  res.json(calls.map(call => callView(call, req.user.id)));
});

app.post('/api/chat/calls', requireVerifiedUser, mutationLimiter, async (req, res) => {
  await closeExpiredCalls();
  const conversation = db.data.ChatConversation.find(item => item.id === String(req.body.conversationId || '') && !item.deleted_at);
  if (!conversation || !chatMember(conversation, req.user) || conversation.type === 'announcement') return res.status(404).json({ error: 'Conversation not found.' });
  const kind = req.body.kind === 'video' ? 'video' : 'voice';
  const existing = db.data.ChatCall.find(item => item.conversationId === conversation.id && ['ringing', 'accepted'].includes(item.status) && !item.deleted_at);
  if (existing) return res.status(409).json({ error: 'A call is already active in this conversation.', call: callView(existing, req.user.id) });
  const call = { id: newId(), conversationId: conversation.id, initiatorId: req.user.id, participantIds: conversation.participantIds, kind, status: 'ringing', signals: [], created_date: now(), updated_date: now() };
  db.data.ChatCall.push(call); await save();
  const recipients = conversation.participantIds.filter(id => id !== req.user.id);
  const callUrl = `/messages?conversation=${conversation.id}&call=${call.id}`;
  recipients.forEach(userId => db.data.Notification.push({ id: newId(), userId, type: 'chat.call', title: `Incoming ${kind} call`, message: `${req.user.full_name || req.user.email} is calling`, section: 'messages', entity: 'ChatCall', entityId: call.id, priority: 'high', read: false, created_date: now() }));
  await save();
  emitChatEvent(recipients, 'call', { ...callView(call, recipients[0]), action: 'ringing', from: chatUser(req.user) });
  await pushToUsers(recipients, { title: `Incoming ${kind} call`, body: `${req.user.full_name || req.user.email} is calling`, url: callUrl, tag: `call-${call.id}`, category: 'messages', callId: call.id, conversationId: conversation.id, kind });
  setTimeout(() => closeExpiredCalls().catch(error => reportOperationalError('call_timeout_failed', error, { callId: call.id })), CALL_RING_TIMEOUT_MS + 250).unref?.();
  res.status(201).json(callView(call, req.user.id));
});

app.patch('/api/chat/calls/:id', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const call = db.data.ChatCall.find(item => item.id === req.params.id && !item.deleted_at && item.participantIds?.includes(req.user.id));
  if (!call) return res.status(404).json({ error: 'Call not found.' });
  const action = String(req.body.action || '');
  if (!['accepted', 'rejected', 'ended', 'missed'].includes(action)) return res.status(400).json({ error: 'Invalid call action.' });
  if (action === 'accepted' && call.status !== 'ringing') return res.status(409).json({ error: 'This call is no longer ringing.' });
  if (action === 'accepted' && call.initiatorId === req.user.id) return res.status(403).json({ error: 'The recipient must accept the call.' });
  call.status = action; call.updated_date = now(); if (action === 'accepted') call.acceptedAt = now(); if (['rejected', 'ended', 'missed'].includes(action)) call.endedAt = now();
  if (['rejected', 'ended', 'missed'].includes(action)) call.signals = [];
  await save(); emitChatEvent(call.participantIds, 'call', { callId: call.id, conversationId: call.conversationId, action, userId: req.user.id }); res.json(callView(call, req.user.id));
});

app.post('/api/chat/calls/:id/signal', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const call = db.data.ChatCall.find(item => item.id === req.params.id && !item.deleted_at && item.participantIds?.includes(req.user.id));
  if (!call || ['rejected', 'ended', 'missed'].includes(call.status)) return res.status(404).json({ error: 'Active call not found.' });
  const signal = req.body.signal;
  if (!signal || typeof signal !== 'object' || JSON.stringify(signal).length > 100_000) return res.status(400).json({ error: 'Invalid WebRTC signal.' });
  call.signals ||= [];
  call.signals.push({ id: newId(), fromUserId: req.user.id, signal, createdAt: now() });
  call.signals = call.signals.slice(-100);
  call.updated_date = now();
  await save();
  emitChatEvent(call.participantIds.filter(id => id !== req.user.id), 'call-signal', { callId: call.id, fromUserId: req.user.id, signal });
  res.json({ relayed: true });
});

const privateAddress = address => {
  const value = String(address || '').toLowerCase();
  if (!isIP(value)) return true;
  if (value.includes(':')) {
    if (value.startsWith('::ffff:') && value.split(':').at(-1)?.includes('.')) return privateAddress(value.split(':').at(-1));
    return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:') || value.startsWith('::ffff:127.');
  }
  const [a, b] = value.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
};
const safePreviewTarget = async raw => {
  const parsed = new URL(String(raw || '').trim());
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Only public HTTP or HTTPS links can be previewed.');
  const addresses = await lookup(parsed.hostname, { all: true });
  if (!addresses.length || addresses.some(item => privateAddress(item.address))) throw new Error('Private network links cannot be previewed.');
  return parsed;
};
const htmlMeta = (html, names) => {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
    ];
    for (const pattern of patterns) { const match = html.match(pattern); if (match?.[1]) return match[1].replace(/&amp;/g, '&').slice(0, 600); }
  }
  return '';
};
const limitedResponseText = async (response, maximumBytes = 500_000) => {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maximumBytes) throw new Error('That page is too large to preview safely.');
  if (!response.body?.getReader) return (await response.text()).slice(0, maximumBytes);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new Error('That page is too large to preview safely.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
};

app.post('/api/chat/link-preview', requireVerifiedUser, mutationLimiter, async (req, res) => {
  try {
    const target = await safePreviewTarget(req.body.url);
    const response = await fetch(target, { redirect: 'error', signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'ReignsAtelier-LinkPreview/1.0', accept: 'text/html' } });
    if (!response.ok || !String(response.headers.get('content-type') || '').includes('text/html')) throw new Error('That page does not provide a safe HTML preview.');
    const html = await limitedResponseText(response);
    const title = htmlMeta(html, ['og:title', 'twitter:title']) || html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim().slice(0, 240) || target.hostname;
    const image = htmlMeta(html, ['og:image', 'twitter:image']);
    let imageUrl = '';
    try { if (image) { const candidate = await safePreviewTarget(new URL(image, target)); imageUrl = candidate.toString(); } } catch { /* omit unsafe or private-network images */ }
    res.json({ url: target.toString(), hostname: target.hostname, title, description: htmlMeta(html, ['og:description', 'description', 'twitter:description']), imageUrl });
  } catch (error) {
    res.status(400).json({ error: error.message || 'This link could not be previewed safely.' });
  }
});

const escapeVcard = value => String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
app.get('/api/chat/messages/:id/contact.vcf', requireVerifiedUser, (req, res) => {
  const message = db.data.ChatMessage.find(item => item.id === req.params.id && !item.deleted_at && item.sharedContact);
  const conversation = message && db.data.ChatConversation.find(item => item.id === message.conversationId && !item.deleted_at);
  if (!message || !conversation || !chatMember(conversation, req.user)) return res.status(404).json({ error: 'Contact card not found.' });
  const contact = message.sharedContact;
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escapeVcard(contact.name)}`];
  if (contact.phone) lines.push(`TEL;TYPE=CELL:${escapeVcard(contact.phone)}`);
  if (contact.email) lines.push(`EMAIL:${escapeVcard(contact.email)}`);
  lines.push('END:VCARD');
  const filename = String(contact.name || 'contact').replace(/[^a-z0-9 _-]/gi, '').trim().slice(0, 80) || 'contact';
  res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.vcf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(`${lines.join('\r\n')}\r\n`);
});

app.get('/api/chat/capabilities', requireVerifiedUser, (_req, res) => {
  res.json({
    realtime: 'server-sent-events',
    push: pushConfigured,
    secureTransport: process.env.NODE_ENV !== 'production' || /^https:/i.test(String(process.env.SITE_URL || '')),
    encryptedAtRest: Boolean(process.env.CHAT_ENCRYPTION_KEY),
    endToEndEncryptionFoundation: true,
    independentlyAuditedE2EE: false,
    multiDeviceKeyBundles: true,
    offlineRecovery: true,
    voiceCalls: true,
    videoCalls: true,
    turnConfigured: Boolean(process.env.TURN_URLS && (process.env.TURN_SHARED_SECRET || (process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL))),
    incomingCallNotifications: pushConfigured,
    stories: true,
    groups: true,
    durableQueue: backgroundQueue.configured,
    note: 'WebRTC signaling and opaque key bundles are available. A formal independent cryptographic audit is still required before advertising audited end-to-end encryption.',
  });
});

app.get('/api/chat/sync', requireVerifiedUser, (req, res) => {
  const since = new Date(String(req.query.since || 0));
  const sinceMs = Number.isNaN(since.getTime()) ? 0 : since.getTime();
  const conversations = db.data.ChatConversation.filter(item => chatMember(item, req.user)
    && Math.max(new Date(item.updated_date || item.created_date || 0).getTime(), new Date(item.lastMessageAt || 0).getTime()) > sinceMs);
  const conversationIds = new Set(db.data.ChatConversation.filter(item => chatMember(item, req.user)).map(item => item.id));
  const messages = db.data.ChatMessage.filter(item => conversationIds.has(item.conversationId)
    && new Date(item.updated_date || item.created_date || 0).getTime() > sinceMs
    && chatMessageVisibleTo(item, req.user));
  res.json({ cursor: now(), conversations, messages });
});

app.get('/api/chat/gifs', requireVerifiedUser, async (req, res) => {
  const key = String(process.env.GIPHY_API_KEY || '').trim();
  if (!key) return res.json({ configured: false, items: [] });
  const query = String(req.query.q || '').trim().slice(0, 80);
  if (!query) return res.json({ configured: true, items: [] });
  try {
    const target = new URL('https://api.giphy.com/v1/gifs/search');
    target.searchParams.set('api_key', key); target.searchParams.set('q', query); target.searchParams.set('limit', '24'); target.searchParams.set('rating', 'g');
    const response = await fetch(target, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error('GIF provider unavailable.');
    const payload = await response.json();
    res.json({ configured: true, items: (payload.data || []).map(item => ({ id: item.id, title: item.title, url: item.images?.fixed_height?.url, previewUrl: item.images?.fixed_height_small?.url })).filter(item => item.url) });
  } catch { res.status(503).json({ error: 'GIF search is temporarily unavailable.' }); }
});

app.post('/api/chat/gifs/import', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const key = String(process.env.GIPHY_API_KEY || '').trim();
  if (!key) return res.status(503).json({ error: 'GIF sharing is not configured yet.' });
  const gifId = String(req.body?.id || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(gifId)) return res.status(400).json({ error: 'Choose a valid GIF.' });
  try {
    // Resolve the asset through GIPHY by ID so this route cannot be used to
    // fetch an arbitrary address supplied by a browser.
    const detailsUrl = new URL(`https://api.giphy.com/v1/gifs/${encodeURIComponent(gifId)}`);
    detailsUrl.searchParams.set('api_key', key);
    const detailsResponse = await fetch(detailsUrl, { signal: AbortSignal.timeout(8000) });
    if (!detailsResponse.ok) throw new Error('GIF provider unavailable.');
    const details = await detailsResponse.json();
    const source = String(details.data?.images?.fixed_height?.url || details.data?.images?.original?.url || '');
    const sourceUrl = new URL(source);
    if (sourceUrl.protocol !== 'https:' || !/(^|\.)giphy\.com$/i.test(sourceUrl.hostname)) {
      return res.status(400).json({ error: 'The selected GIF source is invalid.' });
    }
    const gifResponse = await fetch(sourceUrl, { signal: AbortSignal.timeout(20_000) });
    if (!gifResponse.ok) throw new Error('The selected GIF could not be downloaded.');
    const declaredBytes = Number(gifResponse.headers.get('content-length') || 0);
    if (declaredBytes > 15 * 1024 * 1024) return res.status(413).json({ error: 'Choose a GIF smaller than 15 MB.' });
    const buffer = Buffer.from(await gifResponse.arrayBuffer());
    if (!buffer.length || buffer.length > 15 * 1024 * 1024) return res.status(413).json({ error: 'Choose a GIF smaller than 15 MB.' });
    const detected = await fileTypeFromBuffer(buffer);
    if (detected?.mime !== 'image/gif') return res.status(400).json({ error: 'The selected file is not a GIF.' });
    const fileId = newId();
    const stored = await storeFile({ buffer, mime: 'image/gif', extension: 'gif', uploadDir, id: fileId });
    const media = {
      id: fileId,
      url: stored.url,
      filename: `${String(details.data?.title || 'GIPHY GIF').trim().slice(0, 180) || 'GIPHY GIF'}.gif`,
      mime: 'image/gif', bytes: buffer.length, provider: storageProvider,
      publicId: stored.publicId, resourceType: stored.resourceType,
      scanStatus: 'provider-import', userId: req.user.id,
      purpose: 'chat-attachment', altText: String(details.data?.title || 'Shared GIF').slice(0, 240),
      sourceName: 'GIPHY', contentStatus: 'licensed-provider', created_date: now(),
    };
    db.data.Media.push(media);
    await save();
    res.status(201).json({ file_url: media.url, media });
  } catch (error) {
    reportOperationalError('giphy_import_failed', error, { userId: req.user.id, gifId });
    res.status(503).json({ error: 'This GIF could not be prepared. Please try another one.' });
  }
});

app.get('/api/admin/chat/analytics', requireAdmin, async (_req, res) => {
  const sent = db.data.ChatMessage.filter(item => !item.deleted_at);
  const replies = [];
  for (const conversation of db.data.ChatConversation.filter(item => !item.deleted_at)) {
    const rows = sent.filter(item => item.conversationId === conversation.id).sort((a, b) => String(a.created_date).localeCompare(String(b.created_date)));
    for (let index = 1; index < rows.length; index += 1) if (rows[index].senderId !== rows[index - 1].senderId) replies.push(new Date(rows[index].created_date).getTime() - new Date(rows[index - 1].created_date).getTime());
  }
  res.json({
    messages: sent.length,
    conversations: db.data.ChatConversation.filter(item => !item.deleted_at).length,
    groups: db.data.ChatConversation.filter(item => item.type === 'group' && !item.deleted_at).length,
    activeStories: db.data.ChatStory.filter(item => !item.deleted_at && new Date(item.expiresAt).getTime() > Date.now()).length,
    calls: db.data.ChatCall.filter(item => !item.deleted_at).length,
    averageResponseSeconds: replies.length ? Math.round(replies.reduce((sum, value) => sum + value, 0) / replies.length / 1000) : 0,
    moderationReview: db.data.ChatModerationEvent.filter(item => item.status === 'review' && !item.deleted_at).length,
    reportsOpen: db.data.ChatReport.filter(item => item.status === 'open' && !item.deleted_at).length,
    queue: await jobQueueHealth().catch(error => ({ configured: false, error: error.message })),
  });
});

app.patch('/api/chat/messages/:id', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const message = db.data.ChatMessage.find(item => item.id === req.params.id && !item.deleted_at);
  const conversation = message && db.data.ChatConversation.find(item => item.id === message.conversationId && !item.deleted_at);
  if (!message || !conversation || !chatMember(conversation, req.user)) return res.status(404).json({ error: 'Message not found.' });
  if (message.senderId !== req.user.id) return res.status(403).json({ error: 'You can only edit your own messages.' });
  if (message.deletedForEveryone) return res.status(400).json({ error: 'A deleted message cannot be edited.' });
  if (Date.now() - new Date(message.created_date).getTime() > 15 * 60_000) return res.status(400).json({ error: 'Messages can be edited for 15 minutes after sending.' });
  const body = String(req.body.body || '').trim().slice(0, 10_000);
  if (!body && !message.attachmentUrl) return res.status(400).json({ error: 'The message cannot be empty.' });
  message.body = body;
  message.editedAt = now();
  message.updated_date = now();
  refreshConversationSummary(conversation);
  await save();
  emitChatEvent(conversation.participantIds, 'message', { conversationId: conversation.id, messageId: message.id });
  res.json(message);
});

app.get('/api/chat/messages/:id/attachment', requireVerifiedUser, async (req, res) => {
  const message = db.data.ChatMessage.find(item => item.id === req.params.id && !item.deleted_at && !item.deletedForEveryone);
  const conversation = message && db.data.ChatConversation.find(item => item.id === message.conversationId && !item.deleted_at);
  if (!message || !conversation || !chatMember(conversation, req.user) || !message.attachmentUrl) {
    return res.status(404).json({ error: 'Attachment not found.' });
  }
  if (message.viewOnce && message.senderId !== req.user.id && message.viewedOnceBy?.includes(req.user.id)) {
    return res.status(410).json({ error: 'This view-once attachment has already been opened.' });
  }
  const filename = String(message.attachmentName || 'attachment').replace(/[\r\n"\\]/g, '_').slice(0, 180);
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300');
  const media = db.data.Media.find(item => item.url === message.attachmentUrl && item.preservedData);
  if (media?.preservedData) {
    const body = Buffer.from(media.preservedData, 'base64');
    return res.type(message.attachmentType || media.mime || 'application/octet-stream').send(body);
  }
  if (message.attachmentUrl.startsWith('/uploads/')) {
    const localName = path.basename(message.attachmentUrl);
    return res.type(message.attachmentType || 'application/octet-stream').sendFile(path.join(uploadDir, localName));
  }
  let remote;
  try {
    remote = new URL(message.attachmentUrl);
  } catch {
    return res.status(400).json({ error: 'Attachment address is invalid.' });
  }
  if (remote.protocol !== 'https:' || remote.hostname !== 'res.cloudinary.com') {
    return res.status(403).json({ error: 'This attachment host is not permitted.' });
  }
  try {
    const upstream = await fetch(remote, { signal: AbortSignal.timeout(60_000) });
    if (!upstream.ok) {
      reportOperationalError('chat_attachment_upstream_rejected', new Error(`Cloud storage returned ${upstream.status}`), { messageId: message.id });
      return res.status(502).type('text/plain').send('This older attachment is unavailable from cloud storage. Ask the sender to attach it again.');
    }
    const length = Number(upstream.headers.get('content-length') || 0);
    if (length > 80 * 1024 * 1024) return res.status(413).json({ error: 'Attachment is too large to preview.' });
    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.length > 80 * 1024 * 1024) return res.status(413).json({ error: 'Attachment is too large to preview.' });
    res.type(message.attachmentType || upstream.headers.get('content-type') || 'application/octet-stream').send(body);
  } catch (error) {
    reportOperationalError('chat_attachment_proxy_failed', error, { messageId: message.id });
    res.status(502).type('text/plain').send('This attachment is temporarily unavailable. Please try again.');
  }
});

app.delete('/api/chat/messages/:id', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const message = db.data.ChatMessage.find(item => item.id === req.params.id && !item.deleted_at);
  const conversation = message && db.data.ChatConversation.find(item => item.id === message.conversationId && !item.deleted_at);
  if (!message || !conversation || !chatMember(conversation, req.user)) return res.status(404).json({ error: 'Message not found.' });
  const mode = String(req.query.mode || 'me');
  if (mode === 'everyone') {
    if (message.senderId !== req.user.id && !staffRoles.has(req.user.role)) return res.status(403).json({ error: 'You can only remove your own messages for everyone.' });
    if (!staffRoles.has(req.user.role) && Date.now() - new Date(message.created_date).getTime() > 60 * 60_000) return res.status(400).json({ error: 'Messages can be removed for everyone for one hour after sending.' });
    message.body = '';
    message.attachmentUrl = '';
    message.attachmentName = '';
    message.attachmentType = '';
    message.deletedForEveryone = true;
    message.deletedBy = req.user.id;
    message.deletedAt = now();
    message.hiddenFor = [...new Set([...(message.hiddenFor || []), req.user.id])];
  } else {
    message.hiddenFor = [...new Set([...(message.hiddenFor || []), req.user.id])];
  }
  message.updated_date = now();
  refreshConversationSummary(conversation);
  await save();
  emitChatEvent(conversation.participantIds, 'message', { conversationId: conversation.id, messageId: message.id });
  res.json({ success: true });
});

app.get('/api/entities/:name', async (req, res) => {
  const { name } = req.params;
  if (!Array.isArray(db.data[name])) return res.status(404).json({ error: 'Unknown entity.' });
  const user = readUser(req);
  const publicAccess = publicRead.has(name);
  const pendingAdminMfa = requiresProductionMfa(user);
  if (blocksEntityReadForPendingMfa(user, publicAccess)) {
    return res.status(403).json({ error: 'Enable multi-factor authentication before accessing studio records.', code: 'mfa_required' });
  }
  const ownData = ['ArtRequest', 'CommissionRequest', 'FilmRequest', 'InternshipApplication', 'Message', 'Notification', 'Order', 'PartnerApplication'].includes(name);
  const staffAccess = !pendingAdminMfa && canManage(user, name) && hasAdminAccess(req, user);
  if (!publicAccess && !staffAccess && !(user && ownData)) {
    return res.status(403).json({ error: 'You do not have access to these records.' });
  }
  const includeDeleted = req.query.includeDeleted === 'true' && staffAccess;
  const queryFilters = Object.fromEntries(Object.entries(req.query).filter(([key]) => !['sort', 'limit', 'offset', 'page', 'includeDeleted'].includes(key)));
  if (user && ownData && !staffAccess) queryFilters.userId = user.id;
  const requestedLimit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const requestedOffset = req.query.offset
    ? Math.max(0, Number(req.query.offset) || 0)
    : Math.max(0, (Number(req.query.page || 1) - 1) * requestedLimit);
  const queried = await queryCollection(name, {
    filters: queryFilters,
    sort: req.query.sort || '-created_date',
    limit: requestedLimit,
    offset: requestedOffset,
    includeDeleted,
  });
  let records = queried?.records || db.data[name].filter(record => includeDeleted || !record.deleted_at);
  if (user && ownData && !staffAccess) records = records.filter(record => record.userId === user.id);
  if (name === 'Order' && user && !staffAccess) {
    records = records.filter(record => (
      !record.customerRemovedAt
      && !(isCustomerRemovableOrder(record)
        && Date.now() - new Date(record.created_date || 0).getTime() >= CUSTOMER_ORDER_RETENTION_MS)
    ));
  }
  if (!staffAccess) {
    const starterMediaAllowed = process.env.ALLOW_STARTER_MEDIA === 'true' || process.env.NODE_ENV !== 'production';
    if (!starterMediaAllowed && ['Artwork', 'HeroSlide', 'ShopProduct', 'Video'].includes(name)) {
      // Licensed third-party sources are valid published content. Only records
      // explicitly marked as starter placeholders are hidden in production.
      records = records.filter(record => record.contentStatus !== 'starter');
    }
    if (name === 'BlogPost') records = records.filter(record => record.status === 'published' || !record.status);
    if (name === 'PriceGuide') records = records.filter(record => record.status === 'published' || !record.status);
    if (name === 'Award') records = records.filter(record => record.status === 'published' || !record.status);
    if (name === 'Testimonial') records = records.filter(record => record.status === 'approved');
    if (['Artwork', 'HeroSlide', 'ShopProduct', 'Video'].includes(name)) {
      records = records.filter(record => (
        !['draft', 'archived'].includes(record.status)
        && record.active !== false
        && (!record.scheduledAt || new Date(record.scheduledAt).getTime() <= Date.now())
      ));
    }
    if (name === 'ShopProduct') records = records.filter(record => !record.sellerId || record.listingStatus === 'approved' || !record.listingStatus);
  }
  for (const [key, value] of Object.entries(req.query)) {
    if (!['sort', 'limit', 'offset', 'page', 'includeDeleted'].includes(key)) records = records.filter(record => String(record[key]) === String(value));
  }
  const sort = req.query.sort;
  if (sort) {
    const desc = sort.startsWith('-');
    const key = desc ? sort.slice(1) : sort;
    records.sort((a, b) => String(a[key] || '').localeCompare(String(b[key] || '')) * (desc ? -1 : 1));
  }
  if (!queried) records = records.slice(requestedOffset, requestedOffset + requestedLimit);
  if (name === 'User') records = records.map(hiddenUserFields);
  res.setHeader('x-total-count', String(queried?.total ?? records.length));
  res.setHeader('x-page-limit', String(requestedLimit));
  res.setHeader('x-page-offset', String(requestedOffset));
  res.json(records);
});

app.get('/api/partner/overview', requireVerifiedUser, async (req, res) => {
  if (req.user.role !== 'partner') return res.status(403).json({ error: 'Your partner application must be approved before you can access the partner workspace.' });
  const products = db.data.ShopProduct.filter(item => item.sellerId === req.user.id && !item.deleted_at);
  const payouts = db.data.PartnerPayout.filter(item => item.partnerId === req.user.id && !item.deleted_at);
  const application = db.data.PartnerApplication.find(item => item.userId === req.user.id && !item.deleted_at);
  const sales = db.data.Order.filter(order => order.paymentStatus === 'paid' && !order.deleted_at)
    .flatMap(order => (order.partnerSettlements || []).map(settlement => ({ ...settlement, orderId: order.id, trackingCode: order.trackingCode, paidAt: order.paidAt })))
    .filter(settlement => settlement.partnerId === req.user.id);
  const grossSales = sales.reduce((sum, sale) => sum + sale.gross, 0);
  const studioCommission = sales.reduce((sum, sale) => sum + sale.studioCommission, 0);
  const earned = sales.reduce((sum, sale) => sum + sale.partnerAmount, 0);
  const paidOut = payouts.filter(item => item.status === 'paid').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  res.json({ application, products, payouts, sales, grossSales, studioCommission, earned, paidOut, availableBalance: Math.max(0, earned - paidOut) });
});

app.post('/api/partner/products', requireVerifiedUser, mutationLimiter, async (req, res) => {
  if (req.user.role !== 'partner') return res.status(403).json({ error: 'Only approved partners can submit items for review.' });
  let clean;
  try { clean = validateEntity('ShopProduct', req.body); }
  catch (error) { return res.status(error.status || 400).json({ error: error.message }); }
  const product = {
    ...clean, id: newId(), sellerId: req.user.id, sellerName: req.user.full_name || req.user.email,
    listingStatus: 'pending', status: 'draft', isPartnerListing: true, created_date: now(), updated_date: now(),
  };
  db.data.ShopProduct.push(product);
  notifyStudioStaff({ title: 'Partner listing needs review', message: `${product.sellerName} submitted “${product.title}”.`, section: 'partners', entity: 'ShopProduct', entityId: product.id, priority: 'normal' });
  await audit(req.user, 'partner.product_submitted', 'ShopProduct', product.id, { title: product.title });
  await save();
  res.status(201).json(product);
});

app.patch('/api/partner/products/:id', requireVerifiedUser, mutationLimiter, async (req, res) => {
  if (req.user.role !== 'partner') return res.status(403).json({ error: 'Only approved partners can change partner listings.' });
  const product = db.data.ShopProduct.find(item => item.id === req.params.id && item.sellerId === req.user.id && !item.deleted_at);
  if (!product) return res.status(404).json({ error: 'Partner listing not found.' });
  let clean;
  try { clean = validateEntity('ShopProduct', { ...product, ...req.body }, { partial: true }); }
  catch (error) { return res.status(error.status || 400).json({ error: error.message }); }
  Object.assign(product, clean, { sellerId: req.user.id, sellerName: req.user.full_name || req.user.email, listingStatus: 'pending', status: 'draft', updated_date: now() });
  notifyStudioStaff({ title: 'Partner listing updated', message: `${product.sellerName} updated “${product.title}”; review is required again.`, section: 'partners', entity: 'ShopProduct', entityId: product.id });
  await audit(req.user, 'partner.product_updated', 'ShopProduct', product.id);
  await save();
  res.json(product);
});

app.patch('/api/admin/partners/:id', requireAdmin, mutationLimiter, async (req, res) => {
  const application = db.data.PartnerApplication.find(item => item.id === req.params.id && !item.deleted_at);
  if (!application) return res.status(404).json({ error: 'Partner application not found.' });
  const wasApproved = application.status === 'approved';
  const status = ['pending', 'approved', 'rejected', 'suspended'].includes(req.body.status) ? req.body.status : application.status || 'pending';
  const commissionRate = Math.max(0, Math.min(100, Number(req.body.commissionRate ?? application.commissionRate ?? 0)));
  Object.assign(application, { status, commissionRate, contractUrl: String(req.body.contractUrl || application.contractUrl || '').slice(0, 2048), reviewedAt: now(), reviewedBy: req.user.id, updated_date: now() });
  const partner = db.data.User.find(item => item.id === application.userId && !item.deleted_at);
  if (partner && !staffRoles.has(partner.role)) {
    partner.role = status === 'approved' ? 'partner' : 'customer';
    partner.partnerProfile = { shopName: application.shopName, commissionRate, status: status === 'approved' ? 'active' : status };
    partner.updated_date = now();
  }
  if (!wasApproved && status === 'approved') {
    try {
      application.approvalDelivery = await deliverApprovalUpdate({ entityName: 'PartnerApplication', record: application, actor: req.user });
    } catch (error) {
      application.approvalDelivery = { failedAt: now(), error: error.message || 'Customer delivery failed.' };
      void reportOperationalError('approval_delivery_failed', error, { entityName: 'PartnerApplication', entityId: application.id });
    }
  }
  await audit(req.user, 'partner.application_reviewed', 'PartnerApplication', application.id, { status, commissionRate });
  await save();
  res.json({ application, partner: partner ? hiddenUserFields(partner) : null });
});

app.post('/api/entities/:name', mutationLimiter, limitPublicForms, verifyHuman, async (req, res) => {
  const { name } = req.params;
  if (!Array.isArray(db.data[name])) return res.status(404).json({ error: 'Unknown entity.' });
  const user = readUser(req);
  const publicCreate = name === 'NewsletterSubscriber';
  if (canManage(user, name) && !hasAdminAccess(req, user) && !authenticatedCreate.has(name) && !publicCreate) {
    return res.status(403).json({ error: 'Re-enter your password to unlock Studio Control.', code: 'admin_unlock_required' });
  }
  if (!canManage(user, name) && !authenticatedCreate.has(name) && !publicCreate) {
    return res.status(403).json({ error: 'You do not have permission to create this record.' });
  }
  if (authenticatedCreate.has(name) && !user) return res.status(401).json({ error: 'Please log in to continue.' });
  if (authenticatedCreate.has(name) && !user.emailVerified) {
    return res.status(403).json({ error: 'Verify your email address before sending messages, commissions, or orders.', code: 'email_verification_required' });
  }
  if (name === 'Order') {
    const idempotencyKey = String(req.get('idempotency-key') || '').trim().slice(0, 120);
    if (idempotencyKey) {
      const existingOrder = db.data.Order.find(item => item.userId === user.id && item.idempotencyKey === idempotencyKey && !item.deleted_at);
      if (existingOrder) return res.status(200).json(existingOrder);
    }
  }
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
    clean.subtotal = clean.items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const commerce = commerceSettings();
    if (commerce.paymentMethods?.[clean.paymentMethod] === false) {
      return res.status(400).json({ error: 'That payment method is not currently available.' });
    }
    if (clean.paymentMethod === 'paystack' && !paymentStatus.configured) {
      return res.status(503).json({ error: 'Secure online payment is not available yet. Choose another payment method.' });
    }
    if (clean.deliveryMethod === 'delivery' && !clean.shippingAddress) {
      return res.status(400).json({ error: 'Enter a delivery address or choose studio pickup.' });
    }
    if (clean.deliveryMethod === 'delivery' && clean.deliveryQuoteRequested) {
      clean.deliveryZone = { id: 'custom-quote', name: 'Location needs a delivery quote', fee: 0, eta: 'The studio will confirm the delivery fee.' };
      clean.shipping = 0;
      clean.paymentMethod = 'pay_on_delivery';
      clean.channel = 'manual';
    } else if (clean.deliveryMethod === 'delivery') {
      const zone = commerce.deliveryZones.find(candidate => (
        candidate.active !== false && String(candidate.id) === String(clean.deliveryZoneId)
      ));
      if (!zone) return res.status(400).json({ error: 'Choose an available delivery zone.' });
      clean.deliveryZone = {
        id: String(zone.id),
        name: String(zone.name || ''),
        fee: Math.max(0, Number(zone.fee) || 0),
        eta: String(zone.eta || ''),
      };
      clean.shipping = clean.deliveryZone.fee;
    } else {
      clean.shipping = 0;
    }
    clean.total = clean.subtotal + clean.shipping;
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
  if (['ArtRequest', 'FilmRequest'].includes(name)) {
    record.status = 'received';
    record.replies = [];
    record.statusHistory = [{ status: 'received', at: now(), actorId: user.id }];
  }
  if (name === 'CommissionRequest') {
    record.status = 'pending';
    record.statusHistory = [{ status: 'pending', at: now(), actorId: user.id }];
    record.expiresAt = new Date(Date.now() + (record.channel === 'paystack' ? 30 : 24 * 60) * 60 * 1000).toISOString();
  }
  if (name === 'InternshipApplication') {
    record.status = 'received';
    record.statusHistory = [{ status: 'received', at: now(), actorId: user.id }];
  }
  if (name === 'PartnerApplication') {
    record.status = 'pending';
    record.commissionRate = 0;
    record.reviewedAt = null;
  }
  if (name === 'Order') {
    record.status = record.deliveryQuoteRequested ? 'delivery_quote_required' : 'pending';
    record.paymentStatus = record.deliveryQuoteRequested ? 'quote_required' : record.paymentMethod === 'pay_on_delivery' ? 'pay_on_delivery' : 'awaiting_payment';
    record.proofStatus = 'not_submitted';
    record.currency = paymentStatus.currency;
    record.trackingCode = createOrderTrackingCode();
    record.trackingToken = randomBytes(24).toString('base64url');
    record.idempotencyKey = String(req.get('idempotency-key') || '').trim().slice(0, 120) || null;
    record.statusHistory = [{ status: 'pending', at: now(), actorId: user.id }];
    record.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    try {
      reserveOrderInventory(record);
    } catch (error) {
      return res.status(error.status || 409).json({ error: error.message });
    }
  }
  db.data[name].push(record);
  if (name === 'Message') {
    notifyStudioStaff({ title: 'New customer message', message: `${record.name || record.email || 'A customer'} sent a message that needs a reply.`, section: 'inbox', entity: name, entityId: record.id, priority: 'high' });
  }
  if (name === 'ArtRequest') {
    notifyStudioStaff({ title: 'New Studio Art Finder request', message: `${user.full_name || user.email} is looking for “${record.title}”.`, section: 'studio-requests', entity: name, entityId: record.id, priority: 'high' });
  }
  if (name === 'FilmRequest') {
    notifyStudioStaff({ title: 'New Studio Film Request', message: `${user.full_name || user.email} requested “${record.topic}”.`, section: 'studio-requests', entity: name, entityId: record.id, priority: 'normal' });
  }
  if (name === 'CommissionRequest') {
    notifyStudioStaff({ title: 'New commission request', message: `${record.name || 'A customer'} requested a ${record.artworkType || 'new'} commission.`, section: 'commissions', entity: name, entityId: record.id, priority: 'high' });
  }
  if (name === 'InternshipApplication') {
    notifyStudioStaff({ title: 'New internship application', message: `${record.name || 'An applicant'} submitted an internship application.`, section: 'internships', entity: name, entityId: record.id, priority: 'normal' });
  }
  if (name === 'PartnerApplication') {
    notifyStudioStaff({ title: 'New partner application', message: `${record.fullName || record.email || 'A seller'} wants to join the curated marketplace.`, section: 'partners', entity: name, entityId: record.id, priority: 'high' });
  }
  if (name === 'Order') {
    const quote = record.deliveryQuoteRequested;
    notifyStudioStaff({ title: quote ? 'Delivery quote required' : 'New shop order', message: quote ? `${record.shippingAddress?.recipientName || 'A customer'} needs a custom delivery quote for ${record.trackingCode}.` : `${record.shippingAddress?.recipientName || 'A customer'} placed order ${record.trackingCode}.`, section: 'orders', entity: name, entityId: record.id, priority: quote ? 'high' : 'normal' });
  }
  if (false && name === 'CommissionRequest') {
    record.confirmationDelivery = await deliverEmail({
      to: record.email,
      subject: 'Your commission request — Reigns Atelier',
      text: `Hi ${record.name},\n\nYour commission request has been received. The studio will review it and respond with next steps.\n\nArtwork type: ${record.artworkType}${record.otherArtworkType ? ` (${record.otherArtworkType})` : ''}\nBudget: ${record.budget}\n\nReigns Atelier`,
    });
  }
  if (false && name === 'InternshipApplication') {
    record.confirmationDelivery = await deliverEmail({
      to: record.email,
      subject: 'Internship application received — Reigns Atelier',
      text: `Hi ${record.name},\n\nWe received your internship application and will review it with care. We will contact you about next steps.\n\nReigns Atelier`,
    });
  }
  if (false && name === 'PartnerApplication') {
    record.confirmationDelivery = await deliverEmail({
      to: record.email,
      subject: 'Partner application received — Reigns Atelier',
      text: `Hi ${record.fullName},\n\nYour partner application has been received. The studio will review your work and contact you about next steps.\n\nReigns Atelier`,
    });
  }
  if (['CommissionRequest', 'InternshipApplication', 'PartnerApplication', 'ArtRequest', 'FilmRequest'].includes(name)) {
    try {
      record.confirmationDelivery = await deliverSubmissionUpdate({ entityName: name, record, requester: user });
    } catch (error) {
      record.confirmationDelivery = { failedAt: now(), error: error.message || 'Submission confirmation failed.' };
      void reportOperationalError('submission_delivery_failed', error, { entityName: name, entityId: record.id });
    }
  }
  await audit(user, `${name.toLowerCase()}.created`, name, record.id);
  await save();
  res.status(201).json(record);
});

app.get('/api/payments/config', (_req, res) => {
  res.json({
    provider: paymentStatus.provider,
    configured: paymentStatus.configured,
    currency: paymentStatus.currency,
  });
});

app.post('/api/payments/initialize', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const order = db.data.Order.find(item => item.id === req.body.orderId && item.userId === req.user.id && !item.deleted_at);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.paymentMethod !== 'paystack') return res.status(400).json({ error: 'This order uses a manual payment method.' });
  if (order.paymentStatus === 'quote_required') return res.status(409).json({ error: 'The studio must confirm the custom delivery fee before payment can begin.' });
  if (order.status === 'cancelled') return res.status(409).json({ error: 'This order has been cancelled.' });
  if (order.paymentStatus === 'paid') return res.status(409).json({ error: 'This order is already paid.' });
  if (order.paymentReference && order.paymentAuthorizationUrl) {
    return res.json({ authorizationUrl: order.paymentAuthorizationUrl, accessCode: order.paymentAccessCode || '', reference: order.paymentReference, resumed: true });
  }
  if (!paymentStatus.configured) return res.status(503).json({ error: 'Online payment is not configured. Choose WhatsApp ordering instead.' });
  try {
    const reference = `atelier-${order.id}-${Date.now()}`;
    const callbackUrl = `${publicOrigin}/account?payment_reference=${encodeURIComponent(reference)}`;
    const initialized = await initializePayment({
      email: req.user.email,
      amount: order.total,
      reference,
      callbackUrl,
      metadata: { orderId: order.id, userId: req.user.id },
    });
    order.channel = paymentStatus.provider;
    order.paymentReference = reference;
    order.paymentStatus = 'initialized';
    order.paymentAuthorizationUrl = initialized.authorization_url;
    order.paymentAccessCode = initialized.access_code;
    await audit(req.user, 'order.payment_initialized', 'Order', order.id, { provider: paymentStatus.provider });
    await save();
    res.json({ authorizationUrl: initialized.authorization_url, accessCode: initialized.access_code, reference });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.get('/api/payments/verify/:reference', requireVerifiedUser, async (req, res) => {
  const order = db.data.Order.find(item => item.paymentReference === req.params.reference && item.userId === req.user.id);
  if (!order) return res.status(404).json({ error: 'Payment record not found.' });
  if (order.paymentStatus === 'paid') return res.json({ paid: true, order });
  try {
    const payment = await verifyPayment(req.params.reference);
    const paid = await confirmPaidOrder(order, payment, payment.id);
    await audit(req.user, paid ? 'order.payment_confirmed' : 'order.payment_failed', 'Order', order.id);
    await save();
    res.json({ paid, order });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

// A customer can check an order without signing in, but must know both the
// tracking code and the email used at checkout.  Only safe fulfilment fields
// are returned; addresses, payment references and uploaded files stay private.
app.post('/api/orders/track', authLimiter, async (req, res) => {
  const trackingCode = String(req.body?.trackingCode || '').trim().toUpperCase();
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!trackingCode || !email) return res.status(400).json({ error: 'Enter both your tracking code and checkout email.' });
  const order = db.data.Order.find(item => (
    !item.deleted_at
    && String(item.trackingCode || '').toUpperCase() === trackingCode
    && String(item.accountEmail || '').trim().toLowerCase() === email
  ));
  if (!order) return res.status(404).json({ error: 'No order matches that tracking code and email.' });
  res.json(safeOrderTrackingPayload(order));
});

app.post('/api/orders/track-token', authLimiter, async (req, res) => {
  const trackingToken = String(req.body?.trackingToken || '').trim();
  if (!trackingToken) return res.status(400).json({ error: 'A secure tracking link is required.' });
  const order = db.data.Order.find(item => !item.deleted_at && safeEqual(String(item.trackingToken || ''), trackingToken));
  if (!order) return res.status(404).json({ error: 'This secure tracking link is no longer available. Use your tracking code and checkout email.' });
  res.json(safeOrderTrackingPayload(order));
});

app.post('/api/orders/:id/cancel', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const order = db.data.Order.find(item => item.id === req.params.id && item.userId === req.user.id && !item.deleted_at);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.paymentStatus === 'paid' || ['confirmed', 'fulfilled', 'shipped'].includes(order.status)) {
    return res.status(409).json({ error: 'This order can no longer be cancelled online. Contact the studio for help.' });
  }
  order.status = 'cancelled';
  order.cancelledAt = now();
  releaseOrderInventory(order);
  order.statusHistory ||= [];
  order.statusHistory.push({ status: 'cancelled', at: now(), actorId: req.user.id });
  await audit(req.user, 'order.cancelled', 'Order', order.id);
  await save();
  res.json(order);
});

app.delete('/api/account/orders/unfinished', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const removable = db.data.Order.filter(item => (
    item.userId === req.user.id && !item.customerRemovedAt && isCustomerRemovableOrder(item)
  ));
  removable.forEach(order => hideOrderFromCustomer(order, 'customer_removed_all_unfinished', req.user.id));
  if (removable.length) {
    await audit(req.user, 'orders.unfinished_removed_from_account', 'Order', null, { count: removable.length });
    await save();
  }
  res.json({ success: true, removed: removable.length });
});

app.get('/api/account/orders', requireVerifiedUser, async (req, res) => {
  let changed = false;
  const orders = db.data.Order
    .filter(item => item.userId === req.user.id && !item.deleted_at)
    .filter(item => {
      const expiredFromAccount = isCustomerRemovableOrder(item)
        && Date.now() - new Date(item.created_date || 0).getTime() >= CUSTOMER_ORDER_RETENTION_MS;
      if (expiredFromAccount && !item.customerRemovedAt) {
        changed ||= hideOrderFromCustomer(item, 'unfinished_checkout_expired', item.userId);
      }
      return !item.customerRemovedAt;
    })
    .sort((a, b) => String(b.created_date || '').localeCompare(String(a.created_date || '')))
    .slice(0, 100);
  if (changed) await save();
  res.json(orders);
});

app.delete('/api/account/orders/:id', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const order = db.data.Order.find(item => (
    item.id === req.params.id && item.userId === req.user.id && !item.deleted_at && !item.customerRemovedAt
  ));
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (!hideOrderFromCustomer(order, 'customer_removed_unfinished', req.user.id)) {
    return res.status(409).json({ error: 'Paid or active orders must remain in your account for tracking and support.' });
  }
  await audit(req.user, 'order.removed_from_account', 'Order', order.id);
  await save();
  res.json({ success: true, id: order.id });
});

app.post('/api/orders/:id/payment-proof', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const order = db.data.Order.find(item => item.id === req.params.id && item.userId === req.user.id && !item.deleted_at);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.paymentStatus === 'paid' || order.status === 'cancelled') {
    return res.status(409).json({ error: 'Payment proof can no longer be changed for this order.' });
  }
  if (!['mobile_money', 'bank_transfer'].includes(order.paymentMethod)) {
    return res.status(400).json({ error: 'Payment proof is not required for this order.' });
  }
  const media = db.data.Media.find(item => (
    item.id === String(req.body.mediaId || '')
    && item.userId === req.user.id
    && item.mime?.startsWith('image/')
    && !item.deleted_at
  ));
  if (!media) return res.status(400).json({ error: 'Upload a payment screenshot from this account first.' });
  const paymentProofUrl = String(req.body.paymentProofUrl || '').trim();
  if (paymentProofUrl !== media.url) return res.status(400).json({ error: 'The payment screenshot does not match the uploaded file.' });
  order.paymentProofUrl = paymentProofUrl;
  order.paymentProofMediaId = media.id;
  order.proofStatus = 'submitted';
  order.paymentStatus = 'payment_submitted';
  order.proofSubmittedAt = now();
  order.updated_date = now();
  notifyStudioStaff({
    title: 'Payment proof submitted',
    message: `${order.shippingAddress?.recipientName || order.accountEmail || 'A customer'} submitted payment proof for ${order.trackingCode}.`,
    section: 'orders',
    entity: 'Order',
    entityId: order.id,
    priority: 'high',
  });
  await audit(req.user, 'order.payment_proof_submitted', 'Order', order.id);
  await save();
  res.json(order);
});

app.post('/api/email/send', requireVerifiedUser, async (req, res) => {
  const subject = String(req.body.subject || 'Reigns Atelier').slice(0, 160);
  const text = String(req.body.text || req.body.body || '').slice(0, 10000);
  const delivery = await deliverEmail({ to: req.user.email, subject, text });
  res.json(delivery);
});

const latestSetting = (key, fallback = '') => {
  const rows = (db.data.SiteContent || [])
    .filter(item => item.page === 'Settings' && item.key === key && !item.deleted_at)
    .sort((a, b) => String(a.updated_date || a.created_date || '').localeCompare(String(b.updated_date || b.created_date || '')));
  return String(rows.at(-1)?.value || fallback);
};

const approvalCopy = (entityName, record, recipient) => {
  const definitions = {
    InternshipApplication: ['internship', 'internship application', 'Internship application approved — Reigns Atelier', 'Good news, {{name}} — your internship application has been approved. The studio will contact you with the next steps.'],
    CommissionRequest: ['commission', 'commission request', 'Commission request approved — Reigns Atelier', 'Good news, {{name}} — your commission request has been approved. Open your account or messages to continue with the studio.'],
    ArtRequest: ['art_request', 'Studio Art Finder request', 'Studio Art Finder request approved — Reigns Atelier', 'Good news, {{name}} — your Studio Art Finder request has been approved. The studio will message you with the available options.'],
    FilmRequest: ['film_request', 'art film request', 'Art film request approved — Reigns Atelier', 'Good news, {{name}} — your art film request has been approved. Watch your studio messages for the next update.'],
    PartnerApplication: ['partner', 'partner application', 'Partner application approved — Reigns Atelier', 'Good news, {{name}} — your partner application has been approved. Your partner workspace is ready and you can now submit items for studio review.'],
  };
  const [key, item, fallbackSubject, fallbackMessage] = definitions[entityName] || ['generic', String(entityName || 'request').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), 'Your request was approved — Reigns Atelier', 'Good news, {{name}} — your {{item}} has been approved. Sign in to view the update and continue with the studio.'];
  const name = recipient.full_name || record.name || 'there';
  const expand = value => String(value).replaceAll('{{name}}', name).replaceAll('{{item}}', item);
  return {
    subject: expand(latestSetting(`approval_${key}_subject`, fallbackSubject)),
    message: expand(latestSetting(`approval_${key}_message`, fallbackMessage)),
  };
};

const approvalSenderFor = (recipient, actor) => {
  if (!recipient || recipient.id !== actor.id) return actor;
  return (db.data.User || []).find(item => (
    !item.deleted_at && item.status === 'active' && staffRoles.has(item.role) && item.id !== recipient.id
  )) || actor;
};

const deliverApprovalUpdate = async ({ entityName, record, actor }) => {
  const email = String(record.accountEmail || record.email || '').trim().toLowerCase();
  const recipient = (db.data.User || []).find(item => !item.deleted_at && (item.id === record.userId || (email && String(item.email || '').toLowerCase() === email)));
  const copy = approvalCopy(entityName, record, recipient || { full_name: record.name || record.fullName || '' });
  if (!recipient) {
    const emailDelivery = email ? await deliverEmail({
      to: email, subject: copy.subject,
      text: `${copy.message}\n\nSign in to Reigns Atelier to view the update and reply to the studio.`,
    }) : { skipped: true, reason: 'recipient_not_found' };
    return { deliveredAt: now(), emailDelivery, messageSkipped: true };
  }
  const sender = approvalSenderFor(recipient, actor);
  const participantIds = [sender.id, recipient.id].filter((id, index, values) => values.indexOf(id) === index).sort();
  let conversation = (db.data.ChatConversation || []).find(item => !item.deleted_at && item.type !== 'announcement' && JSON.stringify([...(item.participantIds || [])].sort()) === JSON.stringify(participantIds));
  if (!conversation) {
    conversation = { id: newId(), participantIds, createdBy: sender.id, lastMessageAt: now(), created_date: now() };
    db.data.ChatConversation.push(conversation);
  }
  const message = {
    id: newId(), conversationId: conversation.id, senderId: sender.id, body: copy.message,
    attachmentUrl: '', attachmentName: '', attachmentType: '', attachmentBytes: 0,
    allowForward: false, deliveredAt: now(), readBy: [sender.id], reactions: {},
    systemEvent: 'approval', entity: entityName, entityId: record.id, created_date: now(),
  };
  db.data.ChatMessage.push(message);
  conversation.lastMessageAt = message.created_date;
  db.data.Notification.push({
    id: newId(), userId: recipient.id, type: `${entityName}.approved`, title: copy.subject,
    message: copy.message.slice(0, 240), section: 'messages', entity: entityName, entityId: record.id,
    conversationId: conversation.id, priority: 'high', read: false, created_date: now(),
  });
  await pushToUsers([recipient.id], chatPushPayload(message, sender, conversation.id), conversation.mutedBy || []);
  emitChatEvent(participantIds, 'message.created', { conversationId: conversation.id, message });
  const emailDelivery = email || recipient.email ? await deliverEmail({
    to: email || recipient.email,
    subject: copy.subject,
    text: `${copy.message}\n\nSign in to Reigns Atelier to view the update and reply to the studio.`,
  }) : { skipped: true, reason: 'email_missing' };
  return { deliveredAt: now(), conversationId: conversation.id, messageId: message.id, emailDelivery };
};

const submissionCopy = (entityName, record, recipient) => {
  const definitions = {
    CommissionRequest: ['commission request', 'Commission request received — Reigns Atelier'],
    InternshipApplication: ['internship application', 'Internship application received — Reigns Atelier'],
    PartnerApplication: ['partner application', 'Partner application received — Reigns Atelier'],
    ArtRequest: ['Studio Art Finder request', 'Studio Art Finder request received — Reigns Atelier'],
    FilmRequest: ['art film request', 'Art film request received — Reigns Atelier'],
  };
  const [item, subject] = definitions[entityName] || ['request', 'Request received — Reigns Atelier'];
  const name = recipient?.full_name || record.name || record.fullName || 'there';
  return {
    subject,
    message: `Thank you, ${name}. Your ${item} has been received safely and is now awaiting studio review. We will notify you here and by email when its status changes.`,
  };
};

const deliverSubmissionUpdate = async ({ entityName, record, requester }) => {
  const email = String(record.accountEmail || record.email || requester?.email || '').trim().toLowerCase();
  const recipient = requester || (db.data.User || []).find(item => !item.deleted_at && (item.id === record.userId || (email && String(item.email || '').toLowerCase() === email)));
  const copy = submissionCopy(entityName, record, recipient);
  const sender = (db.data.User || []).find(item => !item.deleted_at && item.status === 'active' && staffRoles.has(item.role) && item.id !== recipient?.id);
  let conversationId = null;
  let messageId = null;
  if (recipient && sender) {
    const participantIds = [sender.id, recipient.id].sort();
    let conversation = (db.data.ChatConversation || []).find(item => !item.deleted_at && item.type !== 'announcement' && JSON.stringify([...(item.participantIds || [])].sort()) === JSON.stringify(participantIds));
    if (!conversation) {
      conversation = { id: newId(), participantIds, createdBy: sender.id, lastMessageAt: now(), created_date: now() };
      db.data.ChatConversation.push(conversation);
    }
    const message = {
      id: newId(), conversationId: conversation.id, senderId: sender.id, body: copy.message,
      attachmentUrl: '', attachmentName: '', attachmentType: '', attachmentBytes: 0,
      allowForward: false, deliveredAt: now(), readBy: [sender.id], reactions: {},
      systemEvent: 'submission', entity: entityName, entityId: record.id, created_date: now(),
    };
    db.data.ChatMessage.push(message);
    conversation.lastMessageAt = message.created_date;
    db.data.Notification.push({
      id: newId(), userId: recipient.id, type: `${entityName}.received`, title: copy.subject,
      message: copy.message.slice(0, 240), section: 'messages', entity: entityName, entityId: record.id,
      conversationId: conversation.id, priority: 'normal', read: false, created_date: now(),
    });
    await pushToUsers([recipient.id], chatPushPayload(message, sender, conversation.id), conversation.mutedBy || []);
    emitChatEvent(participantIds, 'message.created', { conversationId: conversation.id, message });
    conversationId = conversation.id;
    messageId = message.id;
  }
  const emailDelivery = email ? await deliverEmail({
    to: email, subject: copy.subject,
    text: `${copy.message}\n\nSign in to Reigns Atelier to view messages from the studio.`,
  }) : { skipped: true, reason: 'email_missing' };
  return { deliveredAt: now(), conversationId, messageId, emailDelivery };
};

app.patch('/api/entities/:name/:id', requireStaff, mutationLimiter, async (req, res) => {
  const records = db.data[req.params.name];
  const record = records?.find(item => item.id === req.params.id);
  if (!record) return res.status(404).json({ error: 'Record not found.' });
  if (req.params.name === 'AuditLog') return res.status(403).json({ error: 'Audit records are append-only.' });
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
  if (req.params.name === 'User' && record.role === 'admin' && (changes.role && changes.role !== 'admin' || changes.status === 'suspended')) {
    const activeAdmins = db.data.User.filter(item => item.role === 'admin' && item.status === 'active' && !item.deleted_at);
    if (activeAdmins.length <= 1) return res.status(409).json({ error: 'The final active administrator cannot be demoted or suspended.' });
  }
  if (req.params.name === 'Order' && changes.paymentStatus && changes.paymentStatus !== record.paymentStatus) {
    if (changes.paymentStatus === 'paid') {
      changes.proofStatus = record.paymentProofUrl ? 'approved' : record.proofStatus;
      changes.status = record.status === 'pending' ? 'confirmed' : record.status;
      record.paidAt ||= now();
      assignPartnerSettlements(record);
    } else if (changes.paymentStatus === 'failed' && record.paymentProofUrl) {
      changes.proofStatus = 'rejected';
    } else if (changes.paymentStatus === 'payment_submitted') {
      changes.proofStatus = 'submitted';
    }
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
    if (req.params.name === 'Order' && record.accountEmail) {
      const statusLabel = String(changes.status).replaceAll('_', ' ');
      record.statusEmailDelivery = await deliverEmail({
        to: record.accountEmail,
        subject: `Order ${record.trackingCode || ''} update — Reigns Atelier`,
        text: `Your order ${record.trackingCode || ''} has been updated to: ${statusLabel}.\n\nTotal: ${record.currency || 'GHS'} ${Number(changes.total ?? record.total ?? 0).toFixed(2)}\n\nSign in to your account to view the order and continue payment when requested.`,
      });
    }
  }
  if (['ArtRequest', 'FilmRequest'].includes(req.params.name)) {
    const previousReplyCount = Array.isArray(record.replies) ? record.replies.length : 0;
    const nextReplyCount = Array.isArray(changes.replies) ? changes.replies.length : previousReplyCount;
    if (changes.status && changes.status !== record.status) {
      record.statusHistory ||= [];
      record.statusHistory.push({ status: changes.status, at: now(), actorId: req.user.id });
    }
    if (nextReplyCount > previousReplyCount && record.userId) {
      const newestReply = changes.replies[nextReplyCount - 1];
      const requestLabel = req.params.name === 'ArtRequest' ? 'Studio Art Finder' : 'Studio film request';
      db.data.Notification.push({
        id: newId(), userId: record.userId, type: `${req.params.name}.reply`,
        title: `${requestLabel} replied`, message: String(newestReply?.text || 'The studio sent you a new reply.').slice(0, 240),
        section: 'account', entity: req.params.name, entityId: record.id,
        priority: 'normal', read: false, created_date: now(),
      });
      if (record.accountEmail) {
        record.replyEmailDelivery = await deliverEmail({
          to: record.accountEmail,
          subject: `${requestLabel} update — Reigns Atelier`,
          text: `${String(newestReply?.text || 'The studio sent you a new reply.')}\n\nSign in to My Account to review your request and continue the conversation.`,
        });
      }
    }
  }
  if (req.params.name === 'User' && ['suspended', 'active'].includes(changes.status)) {
    record.sessionVersion = (record.sessionVersion || 0) + 1;
  }
  if (['ArtRequest', 'FilmRequest'].includes(req.params.name)) {
    const previousReplyCount = Array.isArray(record.replies) ? record.replies.length : 0;
    const nextReplyCount = Array.isArray(changes.replies) ? changes.replies.length : previousReplyCount;
    const hasNewReply = nextReplyCount > previousReplyCount;
    if (hasNewReply || (changes.status && changes.status !== record.status)) {
      const label = req.params.name === 'ArtRequest' ? 'Studio Art Finder request' : 'Studio Film request';
      const latestReply = hasNewReply ? changes.replies[nextReplyCount - 1]?.text : '';
      db.data.Notification.push({
        id: newId(), userId: record.userId, type: `${req.params.name}.updated`,
        title: `${label} updated`,
        message: latestReply || `Status changed to ${String(changes.status || record.status || 'updated').replaceAll('_', ' ')}.`,
        section: 'account', entity: req.params.name, entityId: record.id,
        priority: 'normal', read: false, created_date: now(),
      });
      if (record.accountEmail) {
        record.replyEmailDelivery = await deliverEmail({
          to: record.accountEmail,
          subject: `${label} update — Reigns Atelier`,
          text: `${latestReply || 'Your request status has been updated.'}\n\nSign in to your Reigns Atelier account to view the full request and continue the conversation.`,
        });
      }
    }
  }
  const wasApproved = ['approved', 'accepted'].includes(String(record.status || '').toLowerCase());
  const isApproved = ['approved', 'accepted'].includes(String(changes.status || '').toLowerCase());
  Object.assign(record, changes, { updated_date: now() });
  if (!wasApproved && isApproved && (record.userId || record.accountEmail || record.email)) {
    try {
      record.approvalDelivery = await deliverApprovalUpdate({ entityName: req.params.name, record, actor: req.user });
    } catch (error) {
      record.approvalDelivery = { failedAt: now(), error: error.message || 'Customer delivery failed.' };
      void reportOperationalError('approval_delivery_failed', error, {
        entityName: req.params.name,
        entityId: record.id,
        actorId: req.user.id,
      }).catch(() => {});
    }
  }
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
  if (req.params.name === 'AuditLog') return res.status(403).json({ error: 'Audit records are append-only.' });
  if (req.params.name === 'User' && record.role === 'admin') {
    const activeAdmins = db.data.User.filter(item => item.role === 'admin' && item.status === 'active' && !item.deleted_at);
    if (activeAdmins.length <= 1) return res.status(409).json({ error: 'The final active administrator cannot be deleted.' });
  }
  if (req.params.name === 'User' && record.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
  record.deleted_at = now();
  record.deleted_by = req.user.id;
  await audit(req.user, `${req.params.name.toLowerCase()}.deleted`, req.params.name, record.id);
  await save();
  res.json({ success: true });
});

app.post('/api/entities/:name/:id/restore', requireStaff, mutationLimiter, async (req, res) => {
  const records = db.data[req.params.name];
  const record = records?.find(item => item.id === req.params.id);
  if (!record) return res.status(404).json({ error: 'Record not found.' });
  if (!canManage(req.user, req.params.name)) return res.status(403).json({ error: 'You do not have permission to restore this record.' });
  if (req.params.name === 'AuditLog') return res.status(403).json({ error: 'Audit records cannot be changed.' });
  delete record.deleted_at;
  delete record.deleted_by;
  record.restoredAt = now();
  record.restoredBy = req.user.id;
  await audit(req.user, `${req.params.name.toLowerCase()}.restored`, req.params.name, record.id);
  await save();
  res.json(record);
});

app.post('/api/messages/:id/reply', requireStaff, mutationLimiter, async (req, res) => {
  if (!canManage(req.user, 'Message')) return res.status(403).json({ error: 'You do not have permission to reply.' });
  const message = db.data.Message.find(item => item.id === req.params.id);
  if (!message) return res.status(404).json({ error: 'Message not found.' });
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Reply cannot be empty.' });
  const delivery = await deliverEmail({ to: message.email, subject: `Re: ${message.subject || 'Your message to Reigns Atelier'}`, text });
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

// Shop wishlists are private to the signed-in customer and travel with their
// account. Guests can still save locally until they choose to sign in.
app.get('/api/wishlist', requireUser, (req, res) => {
  res.json(Array.isArray(req.user.wishlistProductIds) ? req.user.wishlistProductIds : []);
});

app.post('/api/wishlist/:productId', requireUser, mutationLimiter, async (req, res) => {
  const product = db.data.ShopProduct.find(item => item.id === req.params.productId && !item.deleted_at);
  if (!product) return res.status(404).json({ error: 'Art shop item not found.' });
  const saved = new Set(Array.isArray(req.user.wishlistProductIds) ? req.user.wishlistProductIds : []);
  const requestedSaved = req.body?.saved;
  const shouldSave = typeof requestedSaved === 'boolean' ? requestedSaved : !saved.has(product.id);
  if (shouldSave) saved.add(product.id); else saved.delete(product.id);
  req.user.wishlistProductIds = [...saved];
  await audit(req.user, shouldSave ? 'wishlist.saved' : 'wishlist.removed', 'ShopProduct', product.id);
  await save();
  res.json(req.user.wishlistProductIds);
});

app.post('/api/upload', requireVerifiedUser, mutationLimiter, (req, res, next) => {
  upload.single('file')(req, res, error => {
    if (error?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'This file is too large. Videos must be 75 MB or smaller.' });
    }
    if (error) return res.status(400).json({ error: error.message || 'The file could not be uploaded.' });
    next();
  });
}, async (req, res) => {
  const uploadPurpose = String(req.body?.purpose || '');
  const isPublicApplicationUpload = uploadPurpose === 'internship-letter';
  const isChatAttachment = uploadPurpose === 'chat-attachment';
  const isProfileAvatar = uploadPurpose === 'profile-avatar';
  if (staffRoles.has(req.user.role) && !isPublicApplicationUpload && !isChatAttachment && !isProfileAvatar && !hasAdminAccess(req, req.user)) {
    return res.status(403).json({ error: 'Re-enter your password to unlock Studio Control.', code: 'admin_unlock_required' });
  }
  if (!req.file) return res.status(400).json({ error: 'Choose a supported image, video, or PDF file.' });
  const detected = await fileTypeFromBuffer(req.file.buffer);
  const allowed = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime',
    'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/webm',
    'application/pdf', 'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ]);
  if (!detected || !allowed.has(detected.mime)) return res.status(400).json({ error: 'Choose a supported image, video, audio, PDF, Word, Excel, PowerPoint or ZIP file.' });
  if (isProfileAvatar && !detected.mime.startsWith('image/')) {
    return res.status(400).json({ error: 'Profile photos must be JPG, PNG, WebP, AVIF or GIF images.' });
  }
  let scanStatus = 'not-configured';
  if (process.env.MALWARE_SCAN_URL) {
    try {
      const scanResponse = await fetch(process.env.MALWARE_SCAN_URL, {
        method: 'POST', body: req.file.buffer, signal: AbortSignal.timeout(20_000),
        headers: { 'content-type': detected.mime, 'x-file-name': encodeURIComponent(String(req.file.originalname || 'upload').slice(0, 180)), ...(process.env.MALWARE_SCAN_TOKEN ? { authorization: `Bearer ${process.env.MALWARE_SCAN_TOKEN}` } : {}) },
      });
      if (!scanResponse.ok) throw new Error(`Scanner returned ${scanResponse.status}.`);
      const scan = await scanResponse.json();
      if (scan.clean !== true) {
        db.data.ChatModerationEvent.push({ id: newId(), type: 'attachment_malware', status: 'blocked', userId: req.user.id, filename: String(req.file.originalname || '').slice(0, 240), result: scan.result || 'unsafe', created_date: now() });
        await save();
        return res.status(400).json({ error: 'This attachment did not pass the safety scan and was not stored.' });
      }
      scanStatus = 'clean';
    } catch (error) {
      reportOperationalError('malware_scan_failed', error, { userId: req.user.id });
      return res.status(503).json({ error: 'The attachment safety scanner is temporarily unavailable. Please retry.' });
    }
  }
  const fileId = newId();
  const stored = await storeFile({ buffer: req.file.buffer, mime: detected.mime, extension: detected.ext, uploadDir, id: fileId });
  const media = {
    id: fileId,
    url: stored.url,
    filename: String(req.file.originalname || `${fileId}.${detected.ext}`).slice(0, 240),
    mime: detected.mime,
    bytes: req.file.size,
    provider: storageProvider,
    publicId: stored.publicId,
    resourceType: stored.resourceType,
    scanStatus,
    userId: req.user.id,
    purpose: isPublicApplicationUpload ? 'internship-letter' : isChatAttachment ? 'chat-attachment' : isProfileAvatar ? 'profile-avatar' : staffRoles.has(req.user.role) ? 'content-library' : 'customer-reference',
    altText: '',
    sourceName: isPublicApplicationUpload ? 'Internship applicant upload' : isChatAttachment ? 'Private chat attachment' : isProfileAvatar ? 'Profile photo' : staffRoles.has(req.user.role) ? 'Studio upload' : 'Customer upload',
    contentStatus: staffRoles.has(req.user.role) && !isPublicApplicationUpload && !isChatAttachment && !isProfileAvatar ? 'original' : 'customer-reference',
    // Keep a private database copy of modest-sized chat documents. Some cloud
    // accounts restrict PDF/raw delivery even after accepting the upload; the
    // authenticated attachment endpoint can still serve the exact bytes.
    preservedData: isChatAttachment && !detected.mime.startsWith('image/') && !detected.mime.startsWith('video/') && !detected.mime.startsWith('audio/') && req.file.size <= 12 * 1024 * 1024
      ? req.file.buffer.toString('base64')
      : undefined,
    created_date: now(),
  };
  db.data.Media.push(media);
  await audit(req.user, 'file.uploaded', 'Upload', fileId, { mime: detected.mime, bytes: req.file.size, provider: storageProvider });
  await save();
  res.status(201).json({ file_url: stored.url, media });
});

app.delete('/api/admin/media/:id/purge', requireAdmin, mutationLimiter, async (req, res) => {
  const media = db.data.Media.find(item => item.id === req.params.id);
  if (!media) return res.status(404).json({ error: 'Media record not found.' });
  if (!media.deleted_at) return res.status(409).json({ error: 'Move media to the recycle bin before permanently deleting it.' });
  await deleteStoredFile({ publicId: media.publicId, resourceType: media.resourceType, uploadDir });
  db.data.Media = db.data.Media.filter(item => item.id !== media.id);
  await audit(req.user, 'media.purged', 'Media', media.id, { provider: media.provider });
  await save();
  res.json({ success: true });
});

app.post('/api/admin/recycle-bin/purge', requireAdmin, mutationLimiter, async (req, res) => {
  const allowedEntities = new Set(['Artwork', 'HeroSlide', 'Media', 'ShopProduct', 'Testimonial', 'Video', 'BlogPost']);
  const requested = Array.isArray(req.body.items) ? req.body.items : [];
  if (!requested.length) return res.status(400).json({ error: 'Select at least one recycle-bin item to permanently delete.' });

  let purged = 0;
  for (const entry of requested) {
    const entity = String(entry?.entity || '');
    const id = String(entry?.id || '');
    if (!allowedEntities.has(entity) || !id) continue;
    const record = db.data[entity]?.find(item => item.id === id && item.deleted_at);
    if (!record) continue;
    if (entity === 'Media') {
      await deleteStoredFile({ publicId: record.publicId, resourceType: record.resourceType, uploadDir });
    }
    db.data[entity] = db.data[entity].filter(item => item.id !== id);
    purged += 1;
  }
  await audit(req.user, 'recycle_bin.purged', 'RecycleBin', null, { purged });
  await save();
  res.json({ success: true, purged });
});

app.get('/api/notifications/unread-count', requireVerifiedUser, (req, res) => {
  res.json({ count: unreadNotificationCount(req.user.id) });
});

app.get('/api/notifications', requireVerifiedUser, (req, res) => {
  const filter = String(req.query.filter || 'all');
  const category = String(req.query.category || 'all');
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const items = db.data.Notification.filter(item => item.userId === req.user.id && !item.deleted_at)
    .filter(item => filter !== 'unread' || !item.read)
    .filter(item => category === 'all' || notificationCategory(item.type) === category)
    .sort((a, b) => String(b.created_date).localeCompare(String(a.created_date)))
    .slice(0, limit);
  res.json(items);
});

app.get('/api/account/notification-preferences', requireVerifiedUser, (req, res) => {
  res.json({ ...defaultNotificationPreferences(), ...(req.user.notificationPreferences || {}) });
});

app.patch('/api/account/notification-preferences', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const current = { ...defaultNotificationPreferences(), ...(req.user.notificationPreferences || {}) };
  for (const key of ['pushEnabled', 'messages', 'community', 'orders', 'studio']) if (typeof req.body[key] === 'boolean') current[key] = req.body[key];
  if (req.body.quietHours && typeof req.body.quietHours === 'object') {
    const start = /^\d{2}:\d{2}$/.test(req.body.quietHours.start) ? req.body.quietHours.start : current.quietHours.start;
    const end = /^\d{2}:\d{2}$/.test(req.body.quietHours.end) ? req.body.quietHours.end : current.quietHours.end;
    current.quietHours = { enabled: Boolean(req.body.quietHours.enabled), start, end, timezone: String(req.body.quietHours.timezone || current.quietHours.timezone).slice(0, 80) };
  }
  req.user.notificationPreferences = current; req.user.updated_date = now();
  await save(); res.json(current);
});

app.post('/api/notifications/read-all', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const readAt = now();
  db.data.Notification
    .filter(item => item.userId === req.user.id && !item.read && !item.deleted_at)
    .forEach(item => { item.read = true; item.readAt = readAt; });
  await save();
  res.json({ success: true, count: 0 });
});

app.post('/api/notifications/:id/read', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const notification = db.data.Notification.find(item => item.id === req.params.id && item.userId === req.user.id && !item.deleted_at);
  if (!notification) return res.status(404).json({ error: 'Notification not found.' });
  notification.read = true;
  notification.readAt = now();
  await save();
  res.json(notification);
});

app.patch('/api/account/profile', requireUser, mutationLimiter, async (req, res) => {
  const fullName = String(req.body.full_name || '').trim().slice(0, 120);
  if (!fullName) return res.status(400).json({ error: 'Enter your full name.' });
  req.user.full_name = fullName;
  if (typeof req.body.chatDiscoverable === 'boolean') req.user.chatDiscoverable = req.body.chatDiscoverable;
  if (typeof req.body.avatarUrl === 'string') {
    const avatarUrl = req.body.avatarUrl.trim().slice(0, 2048);
    if (avatarUrl && !/^https:\/\//i.test(avatarUrl) && !avatarUrl.startsWith('/uploads/')) {
      return res.status(400).json({ error: 'Profile image address is invalid.' });
    }
    req.user.avatarUrl = avatarUrl;
  }
  req.user.updated_date = now();
  await audit(req.user, 'account.profile_updated', 'User', req.user.id);
  await save();
  res.json(hiddenUserFields(req.user));
});

app.post('/api/account/change-password', requireUser, authLimiter, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  if (!(await bcrypt.compare(currentPassword, req.user.passwordHash))) return res.status(400).json({ error: 'Current password is incorrect.' });
  const passwordError = passwordProblem(newPassword);
  if (passwordError) return res.status(400).json({ error: passwordError });
  req.user.passwordHash = await bcrypt.hash(newPassword, 12);
  req.user.sessionVersion = (req.user.sessionVersion || 0) + 1;
  await audit(req.user, 'account.password_changed', 'User', req.user.id);
  await save();
  await deliverEmail({
    to: req.user.email,
    subject: 'Your Reigns Atelier password was changed',
    text: 'Your account password was changed. If this was not you, use account recovery immediately.',
  });
  setSession(res, req.user, req);
  res.json({ success: true });
});

app.post('/api/account/logout-all', requireUser, authLimiter, async (req, res) => {
  req.user.sessionVersion = (req.user.sessionVersion || 0) + 1;
  db.data.ChatDevice.filter(item => item.userId === req.user.id && !item.revokedAt).forEach(item => { item.revokedAt = now(); });
  await audit(req.user, 'account.sessions_revoked', 'User', req.user.id);
  await save();
  res.clearCookie('atelier_session');
  res.clearCookie('atelier_csrf');
  res.json({ success: true });
});

app.get('/api/account/sessions', requireUser, (req, res) => {
  res.json(db.data.ChatDevice.filter(item => item.userId === req.user.id && !item.deleted_at).map(item => ({
    id: item.id, label: item.label, userAgent: item.userAgent, createdAt: item.created_date, lastSeenAt: item.lastSeenAt,
    revokedAt: item.revokedAt || null, current: item.id === req.user._sessionId,
  })).sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt))));
});

app.delete('/api/account/sessions/:id', requireUser, mutationLimiter, async (req, res) => {
  const device = db.data.ChatDevice.find(item => item.id === req.params.id && item.userId === req.user.id && !item.deleted_at);
  if (!device) return res.status(404).json({ error: 'Device session not found.' });
  device.revokedAt = now(); device.updated_date = now();
  await audit(req.user, 'account.device_revoked', 'ChatDevice', device.id);
  await save();
  if (device.id === req.user._sessionId) { res.clearCookie('atelier_session'); res.clearCookie('atelier_csrf'); }
  res.json({ success: true, current: device.id === req.user._sessionId });
});

app.delete('/api/account', requireUser, mutationLimiter, async (req, res) => {
  const passwordValid = await bcrypt.compare(String(req.body.password || ''), req.user.passwordHash);
  if (!passwordValid) return res.status(400).json({ error: 'Enter your current password to close the account.' });
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
    conversations: db.data.ChatConversation.filter(item => item.participantIds?.includes(req.user.id) && !item.deleted_at),
    chatMessages: db.data.ChatMessage.filter(item => item.senderId === req.user.id && !item.deleted_at),
    stories: owned('ChatStory'), devices: owned('ChatDevice').map(({ ipHash, ...item }) => item),
  });
});

app.get('/api/newsletter/unsubscribe', async (req, res) => {
  const subscriber = db.data.NewsletterSubscriber.find(item => safeEqual(item.unsubscribeToken, req.query.token));
  if (subscriber) {
    subscriber.deleted_at = now();
    subscriber.unsubscribedAt = now();
    await save();
  }
  res.redirect(`${publicOrigin}/?unsubscribed=1`);
});

app.post('/api/admin/backup', requireAdmin, async (req, res) => {
  const result = await backupDatabase({ force: true });
  await audit(req.user, 'system.backup_created', 'System', null);
  await save();
  res.json(result
    ? { success: true, createdAt: now(), path: result }
    : {
        success: false,
        managed: databaseKind === 'postgresql-relational',
        provider: databaseKind,
        createdAt: now(),
        message: databaseKind === 'postgresql-relational'
          ? 'Use the managed PostgreSQL backup and restore rehearsal for production data.'
          : 'No new backup was created.',
      });
});

app.post('/api/admin/outbox/retry', requireAdmin, async (req, res) => {
  for (const item of db.data.Outbox.filter(entry => entry.status === 'failed')) {
    item.status = 'pending';
    item.nextAttemptAt = now();
  }
  await save();
  await processEmailOutbox();
  res.json({ success: true });
});

app.get('/api/metrics', (req, res) => {
  const configuredToken = process.env.METRICS_TOKEN;
  if (!configuredToken || !safeEqual(configuredToken, req.get('authorization')?.replace(/^Bearer\s+/i, ''))) {
    return res.status(401).type('text/plain').send('Unauthorized');
  }
  const lines = [
    '# HELP atelier_pending_messages Messages waiting for a staff reply.',
    '# TYPE atelier_pending_messages gauge',
    `atelier_pending_messages ${db.data.Message.filter(item => !['replied', 'archived', 'spam'].includes(item.status) && !item.deleted_at).length}`,
    '# HELP atelier_pending_orders Orders not yet completed.',
    '# TYPE atelier_pending_orders gauge',
    `atelier_pending_orders ${db.data.Order.filter(item => item.status === 'pending' && !item.deleted_at).length}`,
    '# HELP atelier_email_queue Email messages waiting for delivery.',
    '# TYPE atelier_email_queue gauge',
    `atelier_email_queue ${db.data.Outbox.filter(item => item.status === 'pending').length}`,
    '# HELP atelier_email_failures Email messages that exhausted retries.',
    '# TYPE atelier_email_failures gauge',
    `atelier_email_failures ${db.data.Outbox.filter(item => item.status === 'failed').length}`,
    '# HELP atelier_process_resident_memory_bytes Resident process memory.',
    '# TYPE atelier_process_resident_memory_bytes gauge',
    `atelier_process_resident_memory_bytes ${process.memoryUsage().rss}`,
  ];
  res.type('text/plain; version=0.0.4').send(`${lines.join('\n')}\n`);
});

if (process.env.NODE_ENV === 'production' || process.env.SERVE_STATIC === 'true') {
  app.use(express.static(path.join(root, 'dist')));
  app.use((req, res, next) => {
    if (req.method === 'GET') return res.sendFile(path.join(root, 'dist', 'index.html'));
    next();
  });
}

app.use((error, _req, res, _next) => {
  reportOperationalError('unhandled_error', error, { requestId: _req.requestId, path: _req.path, method: _req.method });
  res.status(error.status || 500).json({ error: error.status ? error.message : 'The server could not complete this request.' });
});

const server = app.listen(port, host, () => console.log(`Reigns Atelier API listening on http://${host}:${port}`));
const shutdown = signal => {
  console.log(JSON.stringify({ level: 'info', event: 'shutdown', signal }));
  if (outboxTimer) clearInterval(outboxTimer);
  if (maintenanceTimer) clearInterval(maintenanceTimer);
  if (communityUpdateTimer) clearInterval(communityUpdateTimer);
  server.close(async () => {
    await save();
    if (redisSubscriber?.isOpen) await redisSubscriber.quit().catch(() => {});
    if (redisPublisher?.isOpen) await redisPublisher.quit().catch(() => {});
    await closeJobQueue().catch(() => {});
    await closeDatabase();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
