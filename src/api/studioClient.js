const STORAGE_PREFIX = 'reigns-atelier:';

const read = (name) => {
  try {
    return JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${name}`) || '[]');
  } catch {
    return [];
  }
};

const write = (name, records) => {
  localStorage.setItem(`${STORAGE_PREFIX}${name}`, JSON.stringify(records));
  return records;
};

const createEntity = (name) => ({
  async list(sortBy, limit) {
    let records = [...read(name)];
    if (sortBy) {
      const descending = sortBy.startsWith('-');
      const key = descending ? sortBy.slice(1) : sortBy;
      records.sort((a, b) => {
        const result = String(a[key] ?? '').localeCompare(String(b[key] ?? ''));
        return descending ? -result : result;
      });
    }
    return limit ? records.slice(0, limit) : records;
  },
  async filter(query = {}, sortBy, limit) {
    const records = (await this.list(sortBy)).filter(record =>
      Object.entries(query).every(([key, value]) => record[key] === value)
    );
    return limit ? records.slice(0, limit) : records;
  },
  async create(data) {
    const records = read(name);
    const record = {
      ...data,
      id: crypto.randomUUID(),
      created_date: new Date().toISOString(),
    };
    write(name, [...records, record]);
    return record;
  },
  async update(id, data) {
    let updated;
    const records = read(name).map(record => {
      if (record.id !== id) return record;
      updated = { ...record, ...data, updated_date: new Date().toISOString() };
      return updated;
    });
    write(name, records);
    return updated;
  },
  async delete(id) {
    write(name, read(name).filter(record => record.id !== id));
    return true;
  },
  async bulkCreate(items) {
    return Promise.all(items.map(item => this.create(item)));
  },
});

const entityNames = [
  'Artwork',
  'BlogPost',
  'CommissionRequest',
  'NewsletterSubscriber',
  'Outbox',
  'Message',
  'Quote',
  'ShopProduct',
  'SiteContent',
  'Testimonial',
  'User',
  'Video',
];

const entities = Object.fromEntries(entityNames.map(name => [name, createEntity(name)]));

const fileToDataUrl = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const buildAssistantReply = message => {
  const text = message.toLowerCase();
  if (text.includes('price') || text.includes('cost') || text.includes('budget')) {
    return 'Commission pricing starts at $80 for a sketch study, $200 for a fine portrait, and $450 for a masterwork. Tell me your preferred medium and size for a more focused recommendation.';
  }
  if (text.includes('time') || text.includes('long') || text.includes('deadline')) {
    return 'Typical delivery ranges from 5 days for studies to 3–5 weeks for detailed masterworks. Your deadline and complexity will shape the final schedule.';
  }
  return 'I can help refine your commission idea. Share the subject, preferred style, size, mood, colors, and deadline, and I’ll suggest the best package and a clearer creative brief.';
};

const sampleFromSchema = (schema, prompt = '') => {
  if (!schema) return buildAssistantReply(prompt);
  if (schema.type === 'array') return [];
  if (schema.type === 'number') return 0;
  if (schema.type === 'boolean') return false;
  if (schema.type === 'string') return '';
  if (schema.type === 'object') {
    return Object.fromEntries(
      Object.entries(schema.properties || {}).map(([key, value]) => [key, sampleFromSchema(value, prompt)])
    );
  }
  return null;
};

export const studioClient = {
  entities,
  integrations: {
    Core: {
      async UploadFile({ file }) {
        return { file_url: await fileToDataUrl(file) };
      },
      async SendEmail(message) {
        return entities.Outbox?.create?.(message) || { delivered: false, saved: true };
      },
      async InvokeLLM({ prompt, response_json_schema }) {
        if (!response_json_schema) return buildAssistantReply(prompt || '');
        const result = sampleFromSchema(response_json_schema, prompt);
        if ('visionSummary' in result) {
          return {
            ...result,
            artworkType: 'Portrait',
            suggestedPackage: 'Fine Portrait',
            estimatedPrice: '$180–$250',
            estimatedTimeline: '10–14 days',
            moodTags: ['expressive', 'personal', 'refined'],
            clarifyingQuestions: [
              'What mood should the finished piece convey?',
              'Which colors or details matter most to you?',
            ],
            visionSummary: 'A personal artwork shaped around your subject, mood, and preferred finish.',
          };
        }
        return result;
      },
    },
  },
  auth: {
    async me() {
      return JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}session`) || 'null');
    },
    async loginViaEmailPassword(email, password) {
      const users = read('User');
      let user = users.find(item => item.email.toLowerCase() === email.toLowerCase());
      if (user && user.password !== password) throw new Error('Invalid email or password.');
      if (!user) {
        user = await entities.User.create({ email, password, role: 'customer', status: 'active' });
      }
      localStorage.setItem(`${STORAGE_PREFIX}session`, JSON.stringify(user));
      return user;
    },
    async register({ email, password, full_name }) {
      const existing = (await entities.User.filter({ email }))[0];
      if (existing) throw new Error('An account with this email already exists.');
      const user = await entities.User.create({
        email,
        password,
        full_name: full_name || email.split('@')[0],
        role: 'customer',
        status: 'active',
      });
      localStorage.setItem(`${STORAGE_PREFIX}session`, JSON.stringify(user));
      return user;
    },
    async loginWithProvider() {
      throw new Error('Social sign-in is not configured.');
    },
    async logout() {
      localStorage.removeItem(`${STORAGE_PREFIX}session`);
    },
    async resetPasswordRequest() {
      return { success: true };
    },
    async resetPassword() {
      return { success: true };
    },
    async resendOtp() {
      return { success: true };
    },
    async verifyOtp() {
      return { success: true };
    },
    setToken() {},
    redirectToLogin() {
      window.location.assign('/login');
    },
  },
  agents: {
    async createConversation() {
      return { id: crypto.randomUUID() };
    },
    subscribeToConversation() {
      return () => {};
    },
    async addMessage(_conversation, message) {
      return { role: 'assistant', content: buildAssistantReply(message.content) };
    },
  },
};
