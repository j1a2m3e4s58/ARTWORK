export async function reportOperationalError(event, error, context = {}) {
  const payload = {
    service: 'reigns-atelier',
    environment: process.env.NODE_ENV || 'development',
    event,
    message: error?.message || String(error),
    context,
    occurredAt: new Date().toISOString(),
  };
  console.error(JSON.stringify({ level: 'error', ...payload }));
  if (!process.env.ERROR_WEBHOOK_URL) return { delivered: false, reason: 'webhook_not_configured' };
  try {
    const response = await fetch(process.env.ERROR_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok
      ? { delivered: true, status: response.status }
      : { delivered: false, reason: `webhook_http_${response.status}` };
  } catch {
    // Console output remains the reliable fallback when the alert channel fails.
    return { delivered: false, reason: 'webhook_delivery_failed' };
  }
}
