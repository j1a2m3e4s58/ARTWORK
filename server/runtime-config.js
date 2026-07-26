const productionRequirements = [
  'DATABASE_URL',
  'APP_ORIGIN',
  'SITE_URL',
  'JWT_SECRET',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'EMAIL_FROM',
  'TURNSTILE_SECRET_KEY',
  'VITE_TURNSTILE_SITE_KEY',
  'METRICS_TOKEN',
];

const isPlaceholder = value => /replace-with|example\.com|changeme|change-me/i.test(String(value || ''));

export function validateRuntimeConfiguration(env = process.env) {
  if (env.NODE_ENV !== 'production') return [];

  const problems = productionRequirements
    .filter(name => !env[name] || isPlaceholder(env[name]))
    .map(name => `${name} is missing or still contains a placeholder value`);

  if (env.TRUST_PROXY !== 'true') problems.push('TRUST_PROXY must be true behind Render');
  if (env.STORAGE_PROVIDER !== 'cloudinary') problems.push('STORAGE_PROVIDER must be cloudinary in production');
  if (String(env.JWT_SECRET || '').length < 32) problems.push('JWT_SECRET must contain at least 32 characters');
  if (String(env.ADMIN_PASSWORD || '').length < 12) problems.push('ADMIN_PASSWORD must contain at least 12 characters');

  for (const name of ['APP_ORIGIN', 'SITE_URL']) {
    if (env[name] && !String(env[name]).startsWith('https://')) {
      problems.push(`${name} must use HTTPS in production`);
    }
  }

  return problems;
}

export function assertRuntimeConfiguration(env = process.env) {
  const problems = validateRuntimeConfiguration(env);
  if (problems.length) {
    throw new Error(`Production configuration is incomplete:\n- ${problems.join('\n- ')}`);
  }
}
