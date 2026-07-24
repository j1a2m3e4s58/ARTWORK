const request = async (url, options = {}) => {
  const isForm = options.body instanceof FormData;
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: isForm ? options.headers : {
      'Content-Type': 'application/json',
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
  'Artwork', 'BlogPost', 'CommissionRequest', 'Message', 'NewsletterSubscriber',
  'Outbox', 'Quote', 'ShopProduct', 'SiteContent', 'Testimonial', 'User', 'Video',
];

const entities = Object.fromEntries(entityNames.map(name => [name, createEntity(name)]));

const assistantReply = message => {
  const text = message.toLowerCase();
  if (text.includes('price') || text.includes('cost') || text.includes('budget')) {
    return 'Commission pricing starts at $80 for a study, $200 for a fine portrait, and $450 for a masterwork. Share the medium and size for a more focused recommendation.';
  }
  if (text.includes('time') || text.includes('deadline')) {
    return 'Typical delivery ranges from 5 days for studies to 3–5 weeks for detailed masterworks. Complexity and your deadline shape the final schedule.';
  }
  return 'Share the subject, preferred style, size, mood, colors, and deadline, and I’ll help refine your creative brief.';
};

const schemaSample = (schema, prompt = '') => {
  if (!schema) return assistantReply(prompt);
  if (schema.type === 'array') return [];
  if (schema.type === 'number') return 0;
  if (schema.type === 'boolean') return false;
  if (schema.type === 'string') return '';
  if (schema.type === 'object') {
    return Object.fromEntries(Object.entries(schema.properties || {}).map(([key, value]) => [key, schemaSample(value, prompt)]));
  }
  return null;
};

export const studioClient = {
  entities,
  admin: {
    createUser(data) {
      return request('/api/admin/users', { method: 'POST', body: JSON.stringify(data) });
    },
  },
  messages: {
    reply(id, text) {
      return request(`/api/messages/${id}/reply`, { method: 'POST', body: JSON.stringify({ text }) });
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
      async InvokeLLM({ prompt, response_json_schema }) {
        if (!response_json_schema) return assistantReply(prompt || '');
        const result = schemaSample(response_json_schema, prompt);
        if ('visionSummary' in result) {
          return {
            ...result,
            artworkType: 'Portrait',
            suggestedPackage: 'Fine Portrait',
            estimatedPrice: '$180–$250',
            estimatedTimeline: '10–14 days',
            moodTags: ['expressive', 'personal', 'refined'],
            clarifyingQuestions: ['What mood should the piece convey?', 'Which colors or details matter most?'],
            visionSummary: 'A personal artwork shaped around your subject, mood, and preferred finish.',
          };
        }
        return result;
      },
    },
  },
  auth: {
    me: () => request('/api/auth/me'),
    loginViaEmailPassword: (email, password) => request('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }),
    register: data => request('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    logout: () => request('/api/auth/logout', { method: 'POST' }),
    resetPasswordRequest: email => request('/api/auth/forgot-password', {
      method: 'POST', body: JSON.stringify({ email }),
    }),
    resetPassword: ({ resetToken, newPassword }) => request('/api/auth/reset-password', {
      method: 'POST', body: JSON.stringify({ token: resetToken, password: newPassword }),
    }),
    loginWithProvider: async () => { throw new Error('Social sign-in is not configured yet.'); },
    resendOtp: async () => ({ success: true }),
    verifyOtp: async () => ({ success: true }),
    setToken() {},
    redirectToLogin() { window.location.assign('/login'); },
  },
  agents: {
    async createConversation() { return { id: crypto.randomUUID() }; },
    subscribeToConversation() { return () => {}; },
    async addMessage(_conversation, message) {
      return { role: 'assistant', content: assistantReply(message.content) };
    },
  },
};
