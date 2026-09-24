import nodemailer from 'nodemailer';

const provider = String(process.env.EMAIL_PROVIDER || 'smtp').toLowerCase();
const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const resendConfigured = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
const configured = provider === 'resend' ? resendConfigured : smtpConfigured;
const siteUrl = String(process.env.SITE_URL || process.env.APP_ORIGIN || 'https://reignsatelier.com')
  .split(',')[0].trim().replace(/\/+$/, '');

const escapeHtml = value => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

function emailActionLabel(subject) {
  const value = String(subject || '').toLowerCase();
  if (value.includes('reset') && value.includes('password')) return 'Reset password';
  if (value.includes('verify')) return 'Verify email address';
  if (value.includes('invit')) return 'Accept invitation';
  return 'Continue securely';
}

export function renderBrandedEmail({ subject, text }) {
  const plainText = String(text || '').trim();
  const actionUrl = plainText.match(/https?:\/\/[^\s<>"']+/)?.[0] || '';
  const message = plainText.replace(actionUrl, '').replace(/\s*:\s*$/, '').trim()
    || 'Please use the secure button below to continue.';
  const paragraphs = message.split(/\n{2,}/).map(paragraph =>
    '<p style="margin:0 0 18px;color:#49433b;font-size:16px;line-height:1.7;">'
      + escapeHtml(paragraph).replace(/\n/g, '<br>') + '</p>'
  ).join('');
  const preheader = escapeHtml(message.slice(0, 140));
  const safeSubject = escapeHtml(subject);
  const safeSiteUrl = escapeHtml(siteUrl);
  const safeActionUrl = escapeHtml(actionUrl);
  const action = actionUrl ?     '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0 22px;"><tr><td style="border-radius:4px;background:#b89552;"><a href="' + safeActionUrl + '" style="display:inline-block;padding:15px 26px;color:#11100e;text-decoration:none;font-size:15px;font-weight:700;letter-spacing:.03em;">' + escapeHtml(emailActionLabel(subject)) + '</a></td></tr></table>'
    + '<p style="margin:0 0 18px;color:#746c61;font-size:13px;line-height:1.6;">If the button does not work, copy and paste this secure link into your browser:<br><a href="' + safeActionUrl + '" style="color:#8a6a31;word-break:break-all;">' + safeActionUrl + '</a></p>' : '';

  return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>' + safeSubject + '</title></head>'
    + '<body style="margin:0;padding:0;background:#f3f0ea;font-family:Arial,Helvetica,sans-serif;">'
    + '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">' + preheader + '</div>'
    + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f0ea;"><tr><td align="center" style="padding:34px 14px;">'
    + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border:1px solid #ded7ca;border-radius:8px;overflow:hidden;box-shadow:0 12px 32px rgba(38,31,23,.08);">'
    + '<tr><td style="padding:30px 34px;background:#151412;border-bottom:3px solid #b89552;">'
    + '<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="width:48px;height:48px;border:1px solid #b89552;border-radius:50%;text-align:center;color:#d8bd82;font-family:Georgia,serif;font-size:20px;letter-spacing:-1px;">RA</td><td style="padding-left:15px;"><div style="color:#f7f2e8;font-family:Georgia,serif;font-size:22px;line-height:1.1;">Reigns Atelier</div><div style="margin-top:5px;color:#b9ad9c;font-size:10px;letter-spacing:.2em;text-transform:uppercase;">Art &middot; Story &middot; Legacy</div></td></tr></table>'
    + '</td></tr><tr><td style="padding:38px 36px 30px;">'
    + '<div style="margin-bottom:12px;color:#9a793c;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;">A note from the studio</div>'
    + '<h1 style="margin:0 0 22px;color:#1d1a17;font-family:Georgia,Times,serif;font-size:30px;font-weight:400;line-height:1.25;">' + safeSubject + '</h1>'
    + paragraphs + action
    + '<div style="margin-top:28px;padding-top:22px;border-top:1px solid #e7e1d7;color:#49433b;font-size:14px;line-height:1.7;">Warm regards,<br><strong style="color:#1d1a17;">The Reigns Atelier Studio</strong><br><span style="color:#8a8176;">Fine art &bull; Portraits &bull; Commissions</span></div>'
    + '</td></tr><tr><td style="padding:22px 34px;background:#f8f6f1;text-align:center;color:#81786c;font-size:12px;line-height:1.6;">'
    + 'This message was sent by Reigns Atelier. For your security, never share a password, verification code, or recovery code by email.<br>'
    + '<a href="' + safeSiteUrl + '" style="color:#8a6a31;text-decoration:none;">reignsatelier.com</a> &nbsp;&bull;&nbsp; &copy; ' + new Date().getFullYear() + ' Reigns Atelier'
    + '</td></tr></table></td></tr></table></body></html>';
}

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
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
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
  if (!response.ok) throw new Error(payload.message || payload.name || ('Email provider returned ' + response.status + '.'));
  return { delivered: true, messageId: payload.id };
}

export async function sendEmail({ to, subject, text, html }) {
  if (!configured) return { delivered: false, reason: provider + '_not_configured' };
  const brandedHtml = html || renderBrandedEmail({ subject, text });
  try {
    if (provider === 'resend') return await sendWithResend({ to, subject, text, html: brandedHtml });
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
      to, subject, text, html: brandedHtml,
    });
    return { delivered: true, messageId: info.messageId };
  } catch (error) {
    return { delivered: false, reason: provider + '_delivery_failed', retryable: true, error: error.message };
  }
}

export const emailConfigured = configured;
export async function checkEmail() {
  if (!configured) return { ok: false, configured: false, provider, reason: provider + '_not_configured' };
  if (provider === 'resend') return { ok: true, configured: true, provider, checked: false };
  try {
    await transporter.verify();
    return { ok: true, configured: true, provider: 'smtp' };
  } catch (error) {
    return { ok: false, configured: true, provider: 'smtp', reason: error.message };
  }
}
