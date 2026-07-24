import { studioClient } from '@/api/studioClient';

/**
 * Feature #3: Smart Artwork Onboarding
 * Analyzes an uploaded artwork image and suggests metadata.
 */
export async function autoSuggestArtwork(imageUrl) {
  const res = await studioClient.integrations.Core.InvokeLLM({
    prompt: `You are an expert fine art curator. Analyze this artwork image and suggest metadata for a portfolio listing.

Return JSON with these fields:
- title: A poetic, evocative title (max 5 words)
- description: A compelling 1-2 sentence gallery description
- category: Pick exactly one from: Portraits, Sketches, Digital Art, Pencil Drawings, Anime Art, Realism
- tags: 5-8 descriptive tags (mood, technique, subject, color palette)
- medium: Likely medium (e.g. "Charcoal on Paper", "Digital", "Oil on Canvas")
- price_suggestion: A reasonable price in USD for an original (number only)
- span: Masonry grid span — "1x1" (square/landscape), "1x2" (tall portrait), "2x1" (wide), "2x2" (large)`,
    file_urls: [imageUrl],
    response_json_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        category: { type: 'string', enum: ['Portraits', 'Sketches', 'Digital Art', 'Pencil Drawings', 'Anime Art', 'Realism'] },
        tags: { type: 'array', items: { type: 'string' } },
        medium: { type: 'string' },
        price_suggestion: { type: 'number' },
        span: { type: 'string', enum: ['1x1', '1x2', '2x1', '2x2'] },
      },
    },
  });
  return res;
}

/**
 * Feature #2: AI Content Studio — Generate a blog post draft
 */
export async function generateBlogDraft({ topic, tone, keywords }) {
  const res = await studioClient.integrations.Core.InvokeLLM({
    prompt: `You are a skilled art blogger for "Reigns Atelier", a fine art studio.
Write a complete blog post.

Topic: ${topic}
Tone: ${tone || 'inspiring and thoughtful'}
Keywords to include: ${keywords || 'art, creativity, commission'}

Return JSON with:
- title: An engaging title
- excerpt: A 1-2 sentence hook
- content: The full blog post body as markdown (use ## for headings, paragraphs, etc.) — minimum 400 words
- readTime: Estimated read time in minutes (number)
- tags: 3-5 relevant tags`,
    response_json_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        excerpt: { type: 'string' },
        content: { type: 'string' },
        readTime: { type: 'number' },
        tags: { type: 'array', items: { type: 'string' } },
      },
    },
  });
  return res;
}

/**
 * Feature #2: AI Content Studio — Generate social media captions
 */
export async function generateCaptions({ artworkTitle, description, platform }) {
  const res = await studioClient.integrations.Core.InvokeLLM({
    prompt: `You are a social media manager for a fine art studio.
Write 3 engaging ${platform} captions for an artwork titled "${artworkTitle}".
${description ? `Artwork context: ${description}` : ''}

Return JSON with a "captions" array, each containing:
- text: The caption (with emojis if appropriate for the platform, hashtags at the end)
- hashtags: Array of hashtags without the # symbol`,
    response_json_schema: {
      type: 'object',
      properties: {
        captions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              hashtags: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
  });
  return res;
}

/**
 * Feature #2: AI Content Studio — Generate an artwork description
 */
export async function generateDescription({ title, medium, category, notes }) {
  const res = await studioClient.integrations.Core.InvokeLLM({
    prompt: `You are a fine art writer. Write a compelling gallery description for an artwork.

Title: ${title}
Category: ${category}
Medium: ${medium || 'unspecified'}
Additional notes: ${notes || 'none'}

Write a poetic, evocative 2-3 sentence description that captures the mood, technique, and emotional resonance. Return JSON with a "description" field.`,
    response_json_schema: {
      type: 'object',
      properties: { description: { type: 'string' } },
    },
  });
  return res.description;
}

/**
 * Feature #4: AI Business Dashboard — Generate insights from business data
 */
export async function generateBusinessInsights(data) {
  const res = await studioClient.integrations.Core.InvokeLLM({
    prompt: `You are a business analyst for a fine art studio called "Reigns Atelier".
Analyze this data and provide actionable insights in a warm, encouraging tone.

Data:
- Total artworks: ${data.totalArtworks}
- Total shop products: ${data.totalProducts}
- Total videos: ${data.totalVideos}
- Commission requests: ${JSON.stringify(data.commissionStats)}
- Blog posts: ${data.totalBlogPosts}
- Newsletter subscribers: ${data.totalSubscribers}
- Featured artworks: ${data.featuredArtworks}
- Artworks by category: ${JSON.stringify(data.categoryBreakdown)}
- Most liked artwork: ${data.mostLiked || 'none'}
- Recent commission descriptions: ${data.recentCommissionTexts}

Return JSON with:
- summary: A 2-3 sentence executive summary of the studio's current state
- insights: Array of 3-5 specific actionable insights (each with "title" and "detail")
- opportunity: One growth opportunity the artist should pursue next`,
    response_json_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        insights: {
          type: 'array',
          items: {
            type: 'object',
            properties: { title: { type: 'string' }, detail: { type: 'string' } },
          },
        },
        opportunity: { type: 'string' },
      },
    },
  });
  return res;
}

/**
 * Feature #7: Semantic Gallery Search
 * Uses AI to match a natural language query against artwork descriptions.
 */
export async function semanticSearch(query, artworks) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return artworks.map(artwork => artwork.id);
  return artworks
    .map(artwork => {
      const searchable = [artwork.title, artwork.category, artwork.description, artwork.medium, ...(Array.isArray(artwork.tags) ? artwork.tags : [])]
        .filter(Boolean).join(' ').toLowerCase();
      const score = terms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0);
      return { id: artwork.id, score };
    })
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(result => result.id);
}

/**
 * Feature #8: AI "Describe Your Vision" Commission Flow
 * Analyzes a client's plain-language description and suggests artwork details.
 */
export async function analyzeCommissionVision(description, referenceImageUrl) {
  const res = await studioClient.integrations.Core.InvokeLLM({
    prompt: `You are a fine art commission consultant for "Reigns Atelier".
A client described their vision: "${description}"

Analyze and return JSON with:
- artworkType: Best match from: Portrait, Digital Art, Sketch, Pencil Drawing, Anime Art, Realism, Other
- suggestedPackage: One of "Sketch Study" ($80, 5-7 days), "Fine Portrait" ($200, 10-14 days), or "Masterwork" ($450+, 3-5 weeks)
- estimatedPrice: A price range string (e.g. "$180-$250")
- estimatedTimeline: A timeline string (e.g. "10-14 days")
- moodTags: 3-5 mood/style tags
- clarifyingQuestions: 2-3 follow-up questions you'd ask the client to refine the commission
- visionSummary: A 1-sentence summary of what they want`,
    file_urls: referenceImageUrl ? [referenceImageUrl] : undefined,
    response_json_schema: {
      type: 'object',
      properties: {
        artworkType: { type: 'string' },
        suggestedPackage: { type: 'string' },
        estimatedPrice: { type: 'string' },
        estimatedTimeline: { type: 'string' },
        moodTags: { type: 'array', items: { type: 'string' } },
        clarifyingQuestions: { type: 'array', items: { type: 'string' } },
        visionSummary: { type: 'string' },
      },
    },
  });
  return res;
}

/**
 * Feature #9: Smart Commission Pricing
 * Suggests a fair price based on type, dimensions, complexity.
 */
export async function suggestPrice({ artworkType, dimensions, complexity, numSubjects, medium }) {
  const res = await studioClient.integrations.Core.InvokeLLM({
    prompt: `You are a pricing consultant for a fine art studio.
Suggest a fair commission price.

Artwork type: ${artworkType}
Dimensions: ${dimensions || 'standard A3'}
Complexity (1-5): ${complexity || 3}
Number of subjects: ${numSubjects || 1}
Medium: ${medium || 'as appropriate'}

Return JSON with:
- suggestedPrice: A number in USD
- priceRange: A range string (e.g. "$180-$250")
- rationale: 1-2 sentences explaining the pricing
- deposit: The 50% deposit amount (number)`,
    response_json_schema: {
      type: 'object',
      properties: {
        suggestedPrice: { type: 'number' },
        priceRange: { type: 'string' },
        rationale: { type: 'string' },
        deposit: { type: 'number' },
      },
    },
  });
  return res;
}