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

const readCsrfToken = () => document.cookie
  .split('; ')
  .find(cookie => cookie.startsWith('atelier_csrf='))
  ?.split('=').slice(1).join('=');

const uploadWithProgress = ({ file, purpose = '', onProgress, signal }) => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  const body = new FormData();
  body.append('file', file);
  if (purpose) body.append('purpose', purpose);
  xhr.open('POST', '/api/upload');
  xhr.withCredentials = true;
  const csrf = readCsrfToken();
  if (csrf) xhr.setRequestHeader('X-CSRF-Token', decodeURIComponent(csrf));
  xhr.upload.onprogress = event => event.lengthComputable && onProgress?.(Math.round((event.loaded / event.total) * 100));
  xhr.onload = () => {
    let data = {};
    try { data = JSON.parse(xhr.responseText || '{}'); } catch { /* use fallback */ }
    if (xhr.status >= 200 && xhr.status < 300) resolve(data);
    else reject(new Error(data.error || 'Upload failed.'));
  };
  xhr.onerror = () => reject(new Error('Upload failed because the connection was interrupted.'));
  xhr.onabort = () => reject(new DOMException('Upload cancelled.', 'AbortError'));
  signal?.addEventListener('abort', () => xhr.abort(), { once: true });
  xhr.send(body);
});

const requestLabels = {
  CommissionRequest: 'commission request',
  InternshipApplication: 'internship application',
  PartnerApplication: 'partner application',
  ArtRequest: 'Studio Art Finder request',
  FilmRequest: 'art film request',
};

const emitRequestFeedback = (kind, name, result) => {
  if (typeof window === 'undefined' || !requestLabels[name]) return;
  const label = requestLabels[name];
  const delivery = kind === 'approval' ? result?.approvalDelivery : result?.confirmationDelivery;
  window.dispatchEvent(new CustomEvent('atelier:request-feedback', { detail: {
    kind,
    title: kind === 'approval' ? 'Approval completed' : 'Request received',
    message: kind === 'approval'
      ? `The ${label} was approved successfully. The customer update has been prepared for Messages and email.`
      : `Your ${label} was sent safely. You will receive updates in Messages and by email.`,
    messageSent: Boolean(delivery?.messageId || delivery?.conversationId),
    emailSent: Boolean(delivery?.emailDelivery && !delivery.emailDelivery.skipped),
  } }));
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
  async create(data, options = {}) {
    const result = await request(`/api/entities/${name}`, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : undefined,
    });
    emitRequestFeedback('submission', name, result);
    return result;
  },
  async update(id, data) {
    const result = await request(`/api/entities/${name}/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    if (['approved', 'accepted'].includes(String(data?.status || '').toLowerCase())) emitRequestFeedback('approval', name, result);
    return result;
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
    supportAnalytics() {
      return request('/api/admin/chat/analytics');
    },
    jobs() {
      return request('/api/admin/jobs');
    },
    retryJob(id) {
      return request(`/api/admin/jobs/${encodeURIComponent(id)}/retry`, { method: 'POST' });
    },
    moderation() {
      return request('/api/admin/chat/moderation');
    },
    reviewModeration(id, status) {
      return request(`/api/admin/chat/moderation/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    },
    async reviewPartnerApplication(id, data) {
      const result = await request(`/api/admin/partners/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) });
      if (String(data?.status).toLowerCase() === 'approved') emitRequestFeedback('approval', 'PartnerApplication', result?.application || result);
      return result;
    },
  },
  messages: {
    reply(id, text) {
      return request(`/api/messages/${id}/reply`, { method: 'POST', body: JSON.stringify({ text }) });
    },
  },
  notifications: {
    list({ filter = 'all', category = 'all', limit = 50 } = {}) {
      return request(`/api/notifications?filter=${encodeURIComponent(filter)}&category=${encodeURIComponent(category)}&limit=${encodeURIComponent(limit)}`);
    },
    unreadCount() {
      return request('/api/notifications/unread-count');
    },
    readAll() {
      return request('/api/notifications/read-all', { method: 'POST' });
    },
    markRead(id) {
      return request(`/api/notifications/${id}/read`, { method: 'POST' });
    },
    preferences: () => request('/api/account/notification-preferences'),
    updatePreferences: data => request('/api/account/notification-preferences', { method: 'PATCH', body: JSON.stringify(data) }),
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
    groupDirectory: () => request('/api/chat/group-directory'),
    start: userId => request('/api/chat/conversations', { method: 'POST', body: JSON.stringify({ userId }) }),
    messages: (id, { query = '', before = '', limit = 60, senderId = '', attachmentType = '', from = '', to = '' } = {}) => {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (senderId) params.set('senderId', senderId);
      if (attachmentType) params.set('attachmentType', attachmentType);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (!query && !senderId && !attachmentType && !from && !to) {
        params.set('limit', String(limit));
        if (before) params.set('before', before);
      }
      return request(`/api/chat/conversations/${encodeURIComponent(id)}/messages?${params}`);
    },
    resources: id => request(`/api/chat/conversations/${encodeURIComponent(id)}/resources`),
    exportConversation: id => request(`/api/chat/conversations/${encodeURIComponent(id)}/export`),
    send: (id, data) => request(`/api/chat/conversations/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify(data) }),
    sendBatch: (id, messages) => request(`/api/chat/conversations/${encodeURIComponent(id)}/messages/batch`, { method: 'POST', body: JSON.stringify({ messages }) }),
    attachmentUrl: (messageId, download = false) => `/api/chat/messages/${encodeURIComponent(messageId)}/attachment${download ? '?download=1' : ''}`,
    contactCardUrl: messageId => `/api/chat/messages/${encodeURIComponent(messageId)}/contact.vcf`,
    markRead: id => request(`/api/chat/conversations/${encodeURIComponent(id)}/read`, { method: 'POST' }),
    setForwarding: (messageId, allowed) => request(`/api/chat/messages/${encodeURIComponent(messageId)}/forwarding`, { method: 'PATCH', body: JSON.stringify({ allowed }) }),
    forward: (messageId, conversationId) => request(`/api/chat/messages/${encodeURIComponent(messageId)}/forward`, { method: 'POST', body: JSON.stringify({ conversationId }) }),
    react: (messageId, emoji) => request(`/api/chat/messages/${encodeURIComponent(messageId)}/reaction`, { method: 'POST', body: JSON.stringify({ emoji }) }),
    star: (messageId, starred) => request(`/api/chat/messages/${encodeURIComponent(messageId)}/star`, { method: 'PATCH', body: JSON.stringify({ starred }) }),
    saveMedia: (messageId, saved) => request(`/api/chat/messages/${encodeURIComponent(messageId)}/save-media`, { method: 'PATCH', body: JSON.stringify({ saved }) }),
    savedItems: () => request('/api/chat/saved-items'),
    updateLiveLocation: (messageId, data) => request(`/api/chat/messages/${encodeURIComponent(messageId)}/location`, { method: 'PATCH', body: JSON.stringify(data) }),
    edit: (messageId, body) => request(`/api/chat/messages/${encodeURIComponent(messageId)}`, { method: 'PATCH', body: JSON.stringify({ body }) }),
    remove: (messageId, mode = 'me') => request(`/api/chat/messages/${encodeURIComponent(messageId)}?mode=${encodeURIComponent(mode)}`, { method: 'DELETE' }),
    typing: (id, typing) => request(`/api/chat/conversations/${encodeURIComponent(id)}/typing`, { method: 'POST', body: JSON.stringify({ typing }) }),
    settings: (id, data) => request(`/api/chat/conversations/${encodeURIComponent(id)}/settings`, { method: 'PATCH', body: JSON.stringify(data) }),
    announce: data => request('/api/chat/announcements', { method: 'POST', body: JSON.stringify(data) }),
    announcements: () => request('/api/chat/announcements/manage'),
    cancelAnnouncement: id => request(`/api/chat/announcements/${encodeURIComponent(id)}/cancel`, { method: 'PATCH' }),
    report: (id, data) => request(`/api/chat/conversations/${encodeURIComponent(id)}/report`, { method: 'POST', body: JSON.stringify(data) }),
    reports: () => request('/api/chat/reports'),
    reviewReport: (id, data) => request(`/api/chat/reports/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
    createGroup: data => request('/api/chat/groups', { method: 'POST', body: JSON.stringify(data) }),
    updateGroup: (id, data) => request(`/api/chat/groups/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
    stories: () => request('/api/chat/stories'),
    createStory: data => request('/api/chat/stories', { method: 'POST', body: JSON.stringify(data) }),
    viewStory: id => request(`/api/chat/stories/${encodeURIComponent(id)}/view`, { method: 'POST' }),
    removeStory: id => request(`/api/chat/stories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    consume: id => request(`/api/chat/messages/${encodeURIComponent(id)}/consume`, { method: 'POST' }),
    transcribe: (id, language = 'en') => request(`/api/chat/messages/${encodeURIComponent(id)}/transcribe`, { method: 'POST', body: JSON.stringify({ language }) }),
    linkPreview: url => request('/api/chat/link-preview', { method: 'POST', body: JSON.stringify({ url }) }),
    savedCollections: () => request('/api/chat/saved-collections'),
    createSavedCollection: data => request('/api/chat/saved-collections', { method: 'POST', body: JSON.stringify(data) }),
    updateSavedCollection: (id, data) => request(`/api/chat/saved-collections/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
    publishKeys: data => request('/api/chat/keys', { method: 'PUT', body: JSON.stringify(data) }),
    keysFor: userId => request(`/api/chat/keys/${encodeURIComponent(userId)}`),
    startCall: data => request('/api/chat/calls', { method: 'POST', body: JSON.stringify(data) }),
    calls: (limit = 50) => request(`/api/chat/calls?limit=${encodeURIComponent(limit)}`),
    rtcConfig: () => request('/api/chat/rtc-config'),
    updateCall: (id, data) => request(`/api/chat/calls/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
    signalCall: (id, data) => request(`/api/chat/calls/${encodeURIComponent(id)}/signal`, { method: 'POST', body: JSON.stringify(data) }),
    heartbeat: () => request('/api/chat/presence', { method: 'POST' }),
    capabilities: () => request('/api/chat/capabilities'),
    sync: since => request(`/api/chat/sync?since=${encodeURIComponent(since || '')}`),
    gifs: query => request(`/api/chat/gifs?q=${encodeURIComponent(query || '')}`),
    importGif: id => request('/api/chat/gifs/import', { method: 'POST', body: JSON.stringify({ id }) }),
  },
  push: {
    config: () => request('/api/push/config'),
    subscribe: subscription => request('/api/push/subscriptions', { method: 'POST', body: JSON.stringify({ subscription }) }),
    unsubscribe: endpoint => request('/api/push/subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint }) }),
  },
  integrations: {
    Core: {
      async UploadFile({ file, purpose = '' }) {
        const body = new FormData();
        body.append('file', file);
        if (purpose) body.append('purpose', purpose);
        return request('/api/upload', { method: 'POST', body });
      },
      UploadFileProgress: uploadWithProgress,
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
    orders() {
      return request('/api/account/orders');
    },
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
    sessions() {
      return request('/api/account/sessions');
    },
    revokeSession(id) {
      return request(`/api/account/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    removeUnfinishedOrder(id) {
      return request(`/api/account/orders/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    removeAllUnfinishedOrders() {
      return request('/api/account/orders/unfinished', { method: 'DELETE' });
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
