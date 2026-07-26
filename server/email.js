import nodemailer from 'nodemailer';

const configured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const transporter = configured ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  pool: true,
  maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS || 3),
  // Render exposes its usable IPv4 route through a private interface.
  // Allow Nodemailer to include that interface when resolving SMTP hosts.
  allowInternalNetworkInterfaces: true,
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
}) : null;

export async function sendEmail({ to, subject, text, html }) {
  if (!transporter) return { delivered: false, reason: 'smtp_not_configured' };
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
      to,
      subject,
      text,
      html,
    });
    return { delivered: true, messageId: info.messageId };
  } catch (error) {
    return { delivered: false, reason: 'smtp_delivery_failed', retryable: true, error: error.message };
  }
}

export const emailConfigured = configured;
export async function checkEmail() {
  if (!transporter) return { ok: false, configured: false, reason: 'smtp_not_configured' };
  try {
    await transporter.verify();
    return { ok: true, configured: true };
  } catch (error) {
    return { ok: false, configured: true, reason: error.message };
  }
}
