import nodemailer from 'nodemailer';

const provider = String(process.env.EMAIL_PROVIDER || 'smtp').toLowerCase();
const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const resendConfigured = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
const configured = provider === 'resend' ? resendConfigured : smtpConfigured;

const transporter = provider === 'smtp' && smtpConfigured ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  pool: true,
  maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS || 3),
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
}) : null;

async function sendWithResend({ to, subject, text, html }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'reigns-atelier/1.0',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      reply_to: process.env.EMAIL_REPLY_TO || undefined,
      to: [to], subject, text, html,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.name || `Email provider returned ${response.status}.`);
  return { delivered: true, messageId: payload.id };
}

export async function sendEmail({ to, subject, text, html }) {
  if (!configured) return { delivered: false, reason: `${provider}_not_configured` };
  try {
    if (provider === 'resend') return await sendWithResend({ to, subject, text, html });
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
      to, subject, text, html,
    });
    return { delivered: true, messageId: info.messageId };
  } catch (error) {
    return { delivered: false, reason: `${provider}_delivery_failed`, retryable: true, error: error.message };
  }
}

export const emailConfigured = configured;
export async function checkEmail() {
  if (!configured) return { ok: false, configured: false, provider, reason: `${provider}_not_configured` };
  if (provider === 'resend') return { ok: true, configured: true, provider, checked: false };
  try {
    await transporter.verify();
    return { ok: true, configured: true, provider: 'smtp' };
  } catch (error) {
    return { ok: false, configured: true, provider: 'smtp', reason: error.message };
  }
}
