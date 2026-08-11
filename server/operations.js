const sentryConfigured = Boolean(process.env.SENTRY_DSN);
let sentryPromise;

function getSentry() {
  if (!sentryConfigured) return Promise.resolve(null);
  sentryPromise ||= import('@sentry/node').then(Sentry => {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.RENDER_GIT_COMMIT || undefined,
      sendDefaultPii: false,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
    });
    return Sentry;
  });
  return sentryPromise;
}

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

  let sentry = { delivered: false, reason: 'sentry_not_configured' };
  if (sentryConfigured) {
    try {
      const Sentry = await getSentry();
      const exception = error instanceof Error ? error : new Error(String(error));
      const eventId = Sentry.withScope(scope => {
        scope.setTag('operation', event);
        scope.setContext('operation', { event, ...context });
        return Sentry.captureException(exception);
      });
      const flushed = await Sentry.flush(5000);
      sentry = flushed
        ? { delivered: true, provider: 'sentry', eventId }
        : { delivered: false, provider: 'sentry', reason: 'sentry_flush_timeout', eventId };
    } catch {
      sentry = { delivered: false, provider: 'sentry', reason: 'sentry_delivery_failed' };
    }
  }

  if (!process.env.ERROR_WEBHOOK_URL) {
    return sentry.delivered ? sentry : { ...sentry, reason: sentry.reason || 'monitoring_not_configured' };
  }
  try {
    const response = await fetch(process.env.ERROR_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    const webhook = response.ok
      ? { delivered: true, provider: 'webhook', status: response.status }
      : { delivered: false, provider: 'webhook', reason: `webhook_http_${response.status}` };
    return {
      delivered: sentry.delivered || webhook.delivered,
      sentry,
      webhook,
    };
  } catch {
    // Console output remains the reliable fallback when the alert channel fails.
    const webhook = { delivered: false, provider: 'webhook', reason: 'webhook_delivery_failed' };
    return {
      delivered: sentry.delivered,
      sentry,
      webhook,
      ...(!sentry.delivered ? { reason: 'monitoring_delivery_failed' } : {}),
    };
  }
}
