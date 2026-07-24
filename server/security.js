export function passwordProblem(password) {
  const value = String(password || '');
  if (value.length < 12) return 'Password must contain at least 12 characters.';
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value)) return 'Password must include uppercase and lowercase letters.';
  if (!/\d/.test(value)) return 'Password must include at least one number.';
  if (/(.)\1{4,}/.test(value)) return 'Password contains too many repeated characters.';
  return null;
}

export function canUseProtectedFeature(user) {
  return Boolean(user && user.status === 'active' && user.emailVerified);
}

export function requiresProductionMfa(user, environment = process.env.NODE_ENV, enabled = process.env.REQUIRE_ADMIN_MFA !== 'false') {
  return Boolean(environment === 'production' && enabled && user?.role === 'admin' && !user.mfaEnabled);
}
