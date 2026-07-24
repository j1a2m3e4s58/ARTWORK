const request = async (url, options = {}) => {
  const isForm = options.body instanceof FormData;
  const csrfToken = document.cookie
    .split('; ')
    .find(cookie => cookie.startsWith('atelier_csrf='))
    ?.split('=')
    .slice(1)
    .join('=');
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...(!isForm ? { 'Content-Type': 'application/json' } : {}),
      ...(csrfToken ? { 'X-CSRF-Token': decodeURIComponent(csrfToken) } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
};

const createEntity = name => ({
  list(sort, limit) {
    const params = new URLSearchParams();
    if (sort) params.set('sort', sort);
    if (limit) params.set('limit', limit);
    return request(`/api/entities/${name}?${params}`);
  },
  filter(query = {}, sort, limit) {
    const params = new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)]));
    if (sort) params.set('sort', sort);
    if (limit) params.set('limit', limit);
    return request(`/api/entities/${name}?${params}`);
  },
  create(data) {
    return request(`/api/entities/${name}`, { method: 'POST', body: JSON.stringify(data) });
  },
  update(id, data) {
    return request(`/api/entities/${name}/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  },
  delete(id) {
    return request(`/api/entities/${name}/${id}`, { method: 'DELETE' });
  },
  bulkCreate(items) {
    return Promise.all(items.map(item => this.create(item)));
  },
});

const entityNames = [
  'Artwork', 'AuditLog', 'BlogPost', 'CommissionRequest', 'HeroSlide', 'Media', 'Message', 'NewsletterSubscriber',
  'Notification', 'Order', 'Outbox', 'Quote', 'ShopProduct', 'SiteContent', 'Testimonial', 'User', 'Video',
];

const entities = Object.fromEntries(entityNames.map(name => [name, createEntity(name)]));

export const studioClient = {
  entities,
  admin: {
    createUser(data) {
      return request('/api/admin/users', { method: 'POST', body: JSON.stringify(data) });
    },
    resendInvite(id) {
      return request(`/api/admin/users/${id}/resend-invite`, { method: 'POST' });
    },
    backup() {
      return request('/api/admin/backup', { method: 'POST' });
    },
  },
  messages: {
    reply(id, text) {
      return request(`/api/messages/${id}/reply`, { method: 'POST', body: JSON.stringify({ text }) });
    },
  },
  artworks: {
    myLikes() {
      return request('/api/artworks/likes/me');
    },
    toggleLike(id) {
      return request(`/api/artworks/${id}/like`, { method: 'POST' });
    },
  },
  integrations: {
    Core: {
      async UploadFile({ file }) {
        const body = new FormData();
        body.append('file', file);
        return request('/api/upload', { method: 'POST', body });
      },
      SendEmail(message) {
        return request('/api/email/send', { method: 'POST', body: JSON.stringify(message) });
      },
    },
  },
  auth: {
    me: () => request('/api/auth/me'),
    loginViaEmailPassword: (email, password) => request('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }),
    verifyMfaLogin: (challenge, code) => request('/api/auth/mfa/verify-login', {
      method: 'POST', body: JSON.stringify({ challenge, code }),
    }),
    register: data => request('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    logout: () => request('/api/auth/logout', { method: 'POST' }),
    resetPasswordRequest: email => request('/api/auth/forgot-password', {
      method: 'POST', body: JSON.stringify({ email }),
    }),
    resetPassword: ({ resetToken, newPassword }) => request('/api/auth/reset-password', {
      method: 'POST', body: JSON.stringify({ token: resetToken, password: newPassword }),
    }),
    acceptInvite: ({ inviteToken, password }) => request('/api/auth/accept-invite', {
      method: 'POST', body: JSON.stringify({ token: inviteToken, password }),
    }),
    verifyEmail: verificationToken => request('/api/auth/verify-email', {
      method: 'POST', body: JSON.stringify({ token: verificationToken }),
    }),
    resendVerification: () => request('/api/auth/resend-verification', { method: 'POST' }),
    loginWithProvider: async () => { throw new Error('Social sign-in is not configured yet.'); },
    resendOtp: async () => ({ success: true }),
    verifyOtp: async () => ({ success: true }),
    setToken() {},
    redirectToLogin() { window.location.assign('/login'); },
  },
  account: {
    updateProfile(data) {
      return request('/api/account/profile', { method: 'PATCH', body: JSON.stringify(data) });
    },
    changePassword(data) {
      return request('/api/account/change-password', { method: 'POST', body: JSON.stringify(data) });
    },
    logoutAll() {
      return request('/api/account/logout-all', { method: 'POST' });
    },
    remove() {
      return request('/api/account', { method: 'DELETE' });
    },
    export() {
      return request('/api/account/export');
    },
  },
  system: {
    ready() {
      return request('/api/ready');
    },
    status() {
      return request('/api/admin/system-status');
    },
    retryOutbox() {
      return request('/api/admin/outbox/retry', { method: 'POST' });
    },
  },
  payments: {
    config: () => request('/api/payments/config'),
    initialize: orderId => request('/api/payments/initialize', { method: 'POST', body: JSON.stringify({ orderId }) }),
    verify: reference => request(`/api/payments/verify/${encodeURIComponent(reference)}`),
  },
  mfa: {
    setup: () => request('/api/admin/mfa/setup', { method: 'POST' }),
    enable: code => request('/api/admin/mfa/enable', { method: 'POST', body: JSON.stringify({ code }) }),
    disable: (password, code) => request('/api/admin/mfa/disable', { method: 'POST', body: JSON.stringify({ password, code }) }),
  },
};
