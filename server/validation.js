import { z } from 'zod';

const text = max => z.string().trim().max(max);
const optionalText = max => text(max).optional().default('');
const email = z.string().trim().toLowerCase().email().max(254);
const safeUrl = z.string().trim().max(2048).refine(value => {
  if (!value) return true;
  if (value.startsWith('/uploads/')) return true;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}, 'Enter a valid web address.');

export const schemas = {
  Message: z.object({
    name: text(120),
    email: email.optional(),
    subject: optionalText(160),
    message: text(10000).min(2),
    website: optionalText(200),
  }),
  CommissionRequest: z.object({
    name: text(120),
    email: email.optional(),
    phone: optionalText(40),
    artworkType: text(80),
    budget: text(80),
    deadline: optionalText(40),
    description: text(12000).min(10),
    package: optionalText(120),
    referenceImageUrl: safeUrl.optional().default(''),
  }),
  InternshipApplication: z.object({
    name: text(120), email: email, phone: optionalText(40),
    school: optionalText(180), programme: optionalText(180), availability: optionalText(160),
    interests: text(3000).min(20), notice: optionalText(3000),
    hasLetter: z.boolean().optional().default(false), letterUrl: safeUrl.optional().default(''),
  }),
  NewsletterSubscriber: z.object({
    email,
    consent: z.boolean().optional().default(true),
    website: optionalText(200),
  }),
  Order: z.object({
    items: z.array(z.object({
      productId: text(100),
      title: text(200),
      price: z.coerce.number().nonnegative().max(1000000),
      qty: z.coerce.number().int().min(1).max(100),
    })).min(1).max(50),
    total: z.coerce.number().nonnegative().max(10000000),
    channel: z.enum(['whatsapp', 'manual', 'paystack']).default('whatsapp'),
    deliveryMethod: z.enum(['digital', 'pickup', 'delivery']).default('delivery'),
    shippingAddress: z.object({
      recipientName: text(160),
      phone: text(40),
      addressLine1: text(240),
      addressLine2: optionalText(240),
      city: text(120),
      region: optionalText(120),
      country: text(120),
      postalCode: optionalText(30),
    }).optional(),
    customerNote: optionalText(2000),
  }),
  Artwork: z.object({
    title: text(200), category: optionalText(100), imageUrl: safeUrl,
    medium: optionalText(120), dimensions: optionalText(80), year: optionalText(20),
    description: optionalText(4000), price: z.union([z.string(), z.number()]).optional(),
    likes: z.coerce.number().int().nonnegative().optional(), span: optionalText(20),
  }).passthrough(),
  HeroSlide: z.object({
    title: text(120),
    accentTitle: optionalText(120),
    eyebrow: optionalText(120),
    subtitle: optionalText(800),
    imageUrl: safeUrl,
    primaryLabel: optionalText(80),
    primaryLink: optionalText(240),
    secondaryLabel: optionalText(80),
    secondaryLink: optionalText(240),
    sortOrder: z.coerce.number().int().min(0).max(999).optional().default(0),
    active: z.boolean().optional().default(true),
  }).passthrough(),
  BlogPost: z.object({
    title: text(240), slug: text(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    content: text(100000), excerpt: optionalText(1000), coverImageUrl: safeUrl.optional().default(''),
    publishedDate: optionalText(40), readTime: z.coerce.number().int().min(1).max(180).optional(),
    author: optionalText(120), status: z.enum(['draft', 'published']).optional().default('draft'),
  }).passthrough(),
  Quote: z.object({ text: text(1000), author: optionalText(160), active: z.boolean().optional().default(true) }),
  ShopProduct: z.object({
    title: text(240), type: optionalText(100), price: z.coerce.number().nonnegative().max(1000000),
    imageUrl: safeUrl, dimensions: optionalText(100), description: optionalText(4000),
    isFeatured: z.boolean().optional().default(false), inventory: z.coerce.number().int().min(0).optional(),
  }).passthrough(),
  SiteContent: z.object({ key: text(160), value: z.union([z.string().max(200000), z.number(), z.boolean()]), page: optionalText(100), group: optionalText(100) }).passthrough(),
  Testimonial: z.object({
    clientName: text(160), location: optionalText(160), rating: z.coerce.number().int().min(1).max(5),
    artworkType: optionalText(160), review: text(5000), artworkImageUrl: safeUrl.optional().default(''),
    status: z.enum(['pending', 'approved', 'rejected']).optional().default('pending'),
  }).passthrough(),
  Video: z.object({
    title: text(240), videoUrl: safeUrl, thumbnailUrl: safeUrl.optional().default(''),
    category: optionalText(120), description: optionalText(4000), duration: optionalText(40),
    isFeatured: z.boolean().optional().default(false),
  }).passthrough(),
};

export function validateEntity(name, data, { partial = false } = {}) {
  const schema = schemas[name];
  if (!schema) return data;
  const result = (partial ? schema.partial() : schema).safeParse(data);
  if (!result.success) {
    const error = new Error(result.error.issues[0]?.message || 'Invalid request data.');
    error.status = 400;
    throw error;
  }
  return result.data;
}
