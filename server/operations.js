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
  if (!process.env.ERROR_WEBHOOK_URL) return;
  try {
    await fetch(process.env.ERROR_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Console output remains the reliable fallback when the alert channel fails.
  }
}
