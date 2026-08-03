const request = async (url, options = {}) => {
  const isForm = options.body instanceof FormData;
  const csrfToken = document.cookie
    .split('; ')
    .find(cookie => cookie.startsWith('atelier_csrf='))
    ?.split('=')
    .slice(1)
    .join('=');
  let response;
  try {
    response = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      ...options,
      headers: {
        ...(!isForm ? { 'Content-Type': 'application/json' } : {}),
        ...(csrfToken ? { 'X-CSRF-Token': decodeURIComponent(csrfToken) } : {}),
        ...options.headers,
      },
    });
  } catch {
    const message = 'Unable to reach the studio service. Check your connection and try again.';
    window.dispatchEvent(new CustomEvent('atelier:api-error', { detail: { status: 0, message, url } }));
    throw new Error(message);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error || 'Request failed.';
    window.dispatchEvent(new CustomEvent('atelier:api-error', { detail: { status: response.status, message, code: data.code, url } }));
    throw new Error(message);
  }
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
  create(data, options = {}) {
    return request(`/api/entities/${name}`, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : undefined,
    });
  },
  update(id, data) {
    return request(`/api/entities/${name}/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  },
  delete(id) {
    return request(`/api/entities/${name}/${id}`, { method: 'DELETE' });
  },
  restore(id) {
    return request(`/api/entities/${name}/${id}/restore`, { method: 'POST' });
  },
  bulkCreate(items) {
    return Promise.all(items.map(item => this.create(item)));
  },
});

const entityNames = [
  'Artwork', 'ArtRequest', 'Award', 'AuditLog', 'BlogPost', 'CommissionRequest', 'FilmRequest', 'InternshipApplication', 'HeroSlide', 'Media', 'Message', 'NewsletterSubscriber',
  'Notification', 'Order', 'Outbox', 'PartnerApplication', 'PartnerPayout', 'PriceGuide', 'Quote', 'ShopProduct', 'SiteContent', 'Testimonial', 'User', 'Video',
];

const entities = Object.fromEntries(entityNames.map(name => [name, createEntity(name)]));

export const studioClient = {
  entities,
  admin: {
    access() {
      return request('/api/admin/access');
    },
    unlock(password) {
      return request('/api/admin/unlock', { method: 'POST', body: JSON.stringify({ password }) });
    },
    lock() {
      return request('/api/admin/lock', { method: 'POST' });
    },
    createUser(data) {
      return request('/api/admin/users', { method: 'POST', body: JSON.stringify(data) });
    },
    resendInvite(id) {
      return request(`/api/admin/users/${id}/resend-invite`, { method: 'POST' });
    },
    backup() {
      return request('/api/admin/backup', { method: 'POST' });
    },
    purgeMedia(id) {
      return request(`/api/admin/media/${id}/purge`, { method: 'DELETE' });
    },
    purgeRecycleBin(items) {
      return request('/api/admin/recycle-bin/purge', { method: 'POST', body: JSON.stringify({ items }) });
    },
    testEmail() {
      return request('/api/admin/test-email', { method: 'POST' });
    },
    testStorage() {
      return request('/api/admin/test-storage', { method: 'POST' });
    },
    testAlert() {
      return request('/api/admin/test-alert', { method: 'POST' });
    },
    reviewPartnerApplication(id, data) {
      return request(`/api/admin/partners/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) });
    },
  },
  messages: {
    reply(id, text) {
      return request(`/api/messages/${id}/reply`, { method: 'POST', body: JSON.stringify({ text }) });
    },
  },
  notifications: {
    markRead(id) {
      return request(`/api/notifications/${id}/read`, { method: 'POST' });
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
  wishlist: {
    list: () => request('/api/wishlist'),
    set: (productId, saved) => request(`/api/wishlist/${encodeURIComponent(productId)}`, { method: 'POST', body: JSON.stringify({ saved }) }),
  },
  partners: {
    overview: () => request('/api/partner/overview'),
    submitProduct: data => request('/api/partner/products', { method: 'POST', body: JSON.stringify(data) }),
    updateProduct: (id, data) => request(`/api/partner/products/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },
  chat: {
    conversations: () => request('/api/chat/conversations'),
    directory: () => request('/api/chat/directory'),
    start: userId => request('/api/chat/conversations', { method: 'POST', body: JSON.stringify({ userId }) }),
    messages: id => request(`/api/chat/conversations/${encodeURIComponent(id)}/messages`),
    send: (id, data) => request(`/api/chat/conversations/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify(data) }),
    markRead: id => request(`/api/chat/conversations/${encodeURIComponent(id)}/read`, { method: 'POST' }),
    setForwarding: (messageId, allowed) => request(`/api/chat/messages/${encodeURIComponent(messageId)}/forwarding`, { method: 'PATCH', body: JSON.stringify({ allowed }) }),
    react: (messageId, emoji) => request(`/api/chat/messages/${encodeURIComponent(messageId)}/reaction`, { method: 'POST', body: JSON.stringify({ emoji }) }),
    heartbeat: () => request('/api/chat/presence', { method: 'POST' }),
  },
  integrations: {
    Core: {
      async UploadFile({ file, purpose = '' }) {
        const body = new FormData();
        body.append('file', file);
        if (purpose) body.append('purpose', purpose);
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
    resetPasswordRequest: (email, turnstileToken) => request('/api/auth/forgot-password', {
      method: 'POST', body: JSON.stringify({ email, turnstileToken }),
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
    loginWithProvider: provider => {
      const returnTo = new URLSearchParams(window.location.search).get('redirect') || '/account?oauth=success';
      window.location.assign(`/api/auth/oauth/${encodeURIComponent(provider)}/start?returnTo=${encodeURIComponent(returnTo)}`);
    },
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
    remove(password) {
      return request('/api/account', { method: 'DELETE', body: JSON.stringify({ password }) });
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
  orders: {
    track: ({ trackingCode, email }) => request('/api/orders/track', {
      method: 'POST', body: JSON.stringify({ trackingCode, email }),
    }),
    trackByToken: trackingToken => request('/api/orders/track-token', {
      method: 'POST', body: JSON.stringify({ trackingToken }),
    }),
    cancel: id => request(`/api/orders/${id}/cancel`, { method: 'POST' }),
    submitPaymentProof: (id, proof) => request(`/api/orders/${id}/payment-proof`, {
      method: 'POST',
      body: JSON.stringify(proof),
    }),
  },
  mfa: {
    setup: () => request('/api/admin/mfa/setup', { method: 'POST' }),
    enable: code => request('/api/admin/mfa/enable', { method: 'POST', body: JSON.stringify({ code }) }),
    disable: (password, code) => request('/api/admin/mfa/disable', { method: 'POST', body: JSON.stringify({ password, code }) }),
    regenerateRecoveryCodes: (password, code) => request('/api/admin/mfa/recovery-codes', {
      method: 'POST',
      body: JSON.stringify({ password, code }),
    }),
  },
};
