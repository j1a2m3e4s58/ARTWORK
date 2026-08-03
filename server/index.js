import 'dotenv/config';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
import { initializePayment, paymentStatus, verifyPayment, verifyPaymentWebhook } from './payments.js';
import { blocksEntityReadForPendingMfa, canUseProtectedFeature, passwordProblem, requiresProductionMfa } from './security.js';
import { reportOperationalError } from './operations.js';
import { assertRuntimeConfiguration } from './runtime-config.js';
import { DEFAULT_COMMISSION_PRICES } from '../src/lib/commissionPricing.js';

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
      imgSrc: ["'self'", 'data:', 'https:'],
      mediaSrc: ["'self'", 'https:'],
      frameSrc: ["'self'", 'https://www.youtube.com', 'https://player.vimeo.com', 'https://challenges.cloudflare.com'],
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
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
  next();
});
const allowedOrigins = (process.env.APP_ORIGIN || 'http://127.0.0.1:43127').split(',').map(origin => origin.trim());
const publicOrigin = String(process.env.SITE_URL || allowedOrigins[0]).replace(/\/+$/, '');
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
  setSession(res, user);
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
  if (changed) await save();
}

function sign(user) {
  return jwt.sign({ id: user.id, version: user.sessionVersion || 0 }, jwtSecret, { expiresIn: '7d' });
}

function setSession(res, user) {
  res.clearCookie('atelier_admin_access');
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
    ['show_shop', 'false', 'Show Shop Navigation'],
    ['show_blog', 'false', 'Show Blog Navigation'],
    ['show_testimonials', 'false', 'Enable Testimonials Page'],
    ['show_contact_map', 'false', 'Show Contact Map'],
    ['show_internships', 'false', 'Show Internships Navigation'],
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
    services: { database, email, storage, monitoring, backup, payment: paymentStatus },
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
    setSession(res, user);
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

const chatMember = (conversation, user) => Boolean(user && (staffRoles.has(user.role) || conversation.participantIds?.includes(user.id)));
const chatUser = user => ({
  id: user.id,
  name: user.full_name || user.email.split('@')[0],
  role: user.role,
  online: Date.now() - new Date(user.lastSeenAt || 0).getTime() < 90_000,
  lastSeenAt: user.lastSeenAt || null,
});

app.get('/api/chat/directory', requireVerifiedUser, (req, res) => {
  // The directory deliberately exposes only a display name, role and presence;
  // private email addresses are never returned. Every active account is
  // discoverable so customers can find other signed-in community members.
  const people = db.data.User.filter(item => !item.deleted_at && item.status === 'active' && item.id !== req.user.id);
  res.json(people.map(chatUser));
});

app.post('/api/chat/presence', requireVerifiedUser, async (req, res) => {
  req.user.lastSeenAt = now();
  await save();
  res.json({ online: true });
});

app.get('/api/chat/conversations', requireVerifiedUser, (req, res) => {
  const conversations = db.data.ChatConversation
    .filter(item => !item.deleted_at && chatMember(item, req.user))
    .sort((a, b) => String(b.lastMessageAt || b.created_date).localeCompare(String(a.lastMessageAt || a.created_date)))
    .map(item => ({ ...item, participants: (item.participantIds || []).map(id => db.data.User.find(user => user.id === id)).filter(Boolean).map(chatUser), unread: db.data.ChatMessage.filter(message => message.conversationId === item.id && message.senderId !== req.user.id && !(message.readBy || []).includes(req.user.id)).length }));
  res.json(conversations);
});

app.post('/api/chat/conversations', requireVerifiedUser, mutationLimiter, async (req, res) => {
  let recipient = db.data.User.find(item => item.id === String(req.body.userId || '') && !item.deleted_at && item.status === 'active');
  if (!recipient) recipient = db.data.User.find(item => item.role === 'admin' && item.status === 'active' && !item.deleted_at);
  if (!recipient || recipient.id === req.user.id) return res.status(400).json({ error: 'Choose an available person.' });
  const ids = [req.user.id, recipient.id].sort();
  let conversation = db.data.ChatConversation.find(item => !item.deleted_at && JSON.stringify([...(item.participantIds || [])].sort()) === JSON.stringify(ids));
  if (!conversation) {
    conversation = { id: newId(), participantIds: ids, createdBy: req.user.id, lastMessageAt: now(), created_date: now() };
    db.data.ChatConversation.push(conversation);
    await save();
  }
  res.status(201).json(conversation);
});

app.get('/api/chat/conversations/:id/messages', requireVerifiedUser, (req, res) => {
  const conversation = db.data.ChatConversation.find(item => item.id === req.params.id && !item.deleted_at);
  if (!conversation || !chatMember(conversation, req.user)) return res.status(404).json({ error: 'Conversation not found.' });
  res.json(db.data.ChatMessage.filter(item => item.conversationId === conversation.id && !item.deleted_at).sort((a, b) => String(a.created_date).localeCompare(String(b.created_date))));
});

app.post('/api/chat/conversations/:id/messages', requireVerifiedUser, mutationLimiter, async (req, res) => {
  const conversation = db.data.ChatConversation.find(item => item.id === req.params.id && !item.deleted_at);
  if (!conversation || !chatMember(conversation, req.user)) return res.status(404).json({ error: 'Conversation not found.' });
  const body = String(req.body.body || '').trim().slice(0, 10000);
  const attachmentUrl = String(req.body.attachmentUrl || '').trim().slice(0, 2048);
  if (!body && !attachmentUrl) return res.status(400).json({ error: 'Write a message or attach a file.' });
  if (attachmentUrl && !/^https?:\/\//i.test(attachmentUrl) && !attachmentUrl.startsWith('/uploads/')) {
    return res.status(400).json({ error: 'The attachment address is not valid.' });
  }
  const replyToId = String(req.body.replyToId || '').trim();
  const replyTo = replyToId
    ? db.data.ChatMessage.find(item => item.id === replyToId && item.conversationId === conversation.id && !item.deleted_at)
    : null;
  const message = {
    id: newId(), conversationId: conversation.id, senderId: req.user.id, body,
    attachmentUrl, attachmentName: String(req.body.attachmentName || '').slice(0, 240),
    attachmentType: String(req.body.attachmentType || '').slice(0, 120),
    attachmentBytes: Math.max(0, Number(req.body.attachmentBytes || 0)),
    replyToId: replyTo?.id || null,
    replyPreview: replyTo ? String(replyTo.body || replyTo.attachmentName || 'Attachment').slice(0, 180) : '',
    allowForward: staffRoles.has(req.user.role) ? Boolean(req.body.allowForward) : false,
    deliveredAt: now(), readBy: [req.user.id], reactions: {}, created_date: now(),
  };
  db.data.ChatMessage.push(message);
  conversation.lastMessageAt = message.created_date;
  conversation.lastMessage = body || message.attachmentName || 'Attachment';
  const recipientIds = (conversation.participantIds || []).filter(id => id !== req.user.id);
  recipientIds.forEach(userId => db.data.Notification.push({ id: newId(), userId, type: 'chat.message', title: `New message from ${req.user.full_name || req.user.email}`, message: conversation.lastMessage.slice(0, 180), section: 'messages', entity: 'ChatConversation', entityId: conversation.id, priority: 'normal', read: false, created_date: now() }));
  await save();
  res.status(201).json(message);
});

app.post('/api/chat/conversations/:id/read', requireVerifiedUser, async (req, res) => {
  const conversation = db.data.ChatConversation.find(item => item.id === req.params.id && !item.deleted_at);
  if (!conversation || !chatMember(conversation, req.user)) return res.status(404).json({ error: 'Conversation not found.' });
  db.data.ChatMessage.filter(item => item.conversationId === conversation.id && item.senderId !== req.user.id).forEach(item => { item.readBy = [...new Set([...(item.readBy || []), req.user.id])]; item.readAt = now(); });
  await save();
  res.json({ success: true });
});

app.patch('/api/chat/messages/:id/forwarding', requireAdmin, mutationLimiter, async (req, res) => {
  const message = db.data.ChatMessage.find(item => item.id === req.params.id && !item.deleted_at);
  if (!message) return res.status(404).json({ error: 'Message not found.' });
  message.allowForward = Boolean(req.body.allowed); message.updated_date = now();
  await save(); res.json(message);
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
  res.json(message);
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
  const status = ['pending', 'approved', 'rejected', 'suspended'].includes(req.body.status) ? req.body.status : application.status || 'pending';
  const commissionRate = Math.max(0, Math.min(100, Number(req.body.commissionRate ?? application.commissionRate ?? 0)));
  Object.assign(application, { status, commissionRate, contractUrl: String(req.body.contractUrl || application.contractUrl || '').slice(0, 2048), reviewedAt: now(), reviewedBy: req.user.id, updated_date: now() });
  const partner = db.data.User.find(item => item.id === application.userId && !item.deleted_at);
  if (partner && !staffRoles.has(partner.role)) {
    partner.role = status === 'approved' ? 'partner' : 'customer';
    partner.partnerProfile = { shopName: application.shopName, commissionRate, status: status === 'approved' ? 'active' : status };
    partner.updated_date = now();
    db.data.Notification.push({ id: newId(), userId: partner.id, type: 'partner.application', title: `Partner application ${status}`, message: status === 'approved' ? 'Your partner workspace is ready. Submit your first item for review.' : 'Your application status has been updated. Please contact the studio for details.', section: status === 'approved' ? 'partner' : 'account', entity: 'PartnerApplication', entityId: application.id, priority: 'normal', read: false, created_date: now() });
    await deliverEmail({ to: partner.email, subject: `Partner application ${status}`, text: status === 'approved' ? 'Your Reigns Atelier partner application is approved. Sign in to submit items for review.' : 'Your Reigns Atelier partner application status has changed. Please contact the studio if you have questions.' });
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
  if (name === 'CommissionRequest') {
    record.confirmationDelivery = await deliverEmail({
      to: record.email,
      subject: 'Your commission request — Reigns Atelier',
      text: `Hi ${record.name},\n\nYour commission request has been received. The studio will review it and respond with next steps.\n\nArtwork type: ${record.artworkType}${record.otherArtworkType ? ` (${record.otherArtworkType})` : ''}\nBudget: ${record.budget}\n\nReigns Atelier`,
    });
  }
  if (name === 'InternshipApplication') {
    record.confirmationDelivery = await deliverEmail({
      to: record.email,
      subject: 'Internship application received — Reigns Atelier',
      text: `Hi ${record.name},\n\nWe received your internship application and will review it with care. We will contact you about next steps.\n\nReigns Atelier`,
    });
  }
  if (name === 'PartnerApplication') {
    record.confirmationDelivery = await deliverEmail({
      to: record.email,
      subject: 'Partner application received — Reigns Atelier',
      text: `Hi ${record.fullName},\n\nYour partner application has been received. The studio will review your work and contact you about next steps.\n\nReigns Atelier`,
    });
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
    return res.json({ authorizationUrl: order.paymentAuthorizationUrl, reference: order.paymentReference, resumed: true });
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
    await audit(req.user, 'order.payment_initialized', 'Order', order.id, { provider: paymentStatus.provider });
    await save();
    res.json({ authorizationUrl: initialized.authorization_url, reference });
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
  if (staffRoles.has(req.user.role) && !isPublicApplicationUpload && !isChatAttachment && !hasAdminAccess(req, req.user)) {
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
    userId: req.user.id,
    purpose: isPublicApplicationUpload ? 'internship-letter' : isChatAttachment ? 'chat-attachment' : staffRoles.has(req.user.role) ? 'content-library' : 'customer-reference',
    altText: '',
    sourceName: isPublicApplicationUpload ? 'Internship applicant upload' : isChatAttachment ? 'Private chat attachment' : staffRoles.has(req.user.role) ? 'Studio upload' : 'Customer upload',
    contentStatus: staffRoles.has(req.user.role) && !isPublicApplicationUpload && !isChatAttachment ? 'original' : 'customer-reference',
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

app.post('/api/notifications/:id/read', requireStaff, mutationLimiter, async (req, res) => {
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
  setSession(res, req.user);
  res.json({ success: true });
});

app.post('/api/account/logout-all', requireUser, authLimiter, async (req, res) => {
  req.user.sessionVersion = (req.user.sessionVersion || 0) + 1;
  await audit(req.user, 'account.sessions_revoked', 'User', req.user.id);
  await save();
  res.clearCookie('atelier_session');
  res.clearCookie('atelier_csrf');
  res.json({ success: true });
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
  server.close(async () => {
    await save();
    await closeDatabase();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
