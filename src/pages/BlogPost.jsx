import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Tag, Share2 } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import ReactMarkdown from 'react-markdown';
import ScrollReveal from '@/components/ScrollReveal';
import PageTransition from '@/components/PageTransition';

// Hardcoded fallback posts for demo slugs
const FALLBACK_POSTS = {
  'the-art-of-chiaroscuro': {
    title: 'The Art of Chiaroscuro: Drawing with Light and Shadow',
    coverImageUrl: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=1400&q=90',
    tags: ['Technique', 'Charcoal', 'Portrait'], publishedDate: 'December 1, 2025', readTime: 8, author: 'Reigns',
    content: `Chiaroscuro — from the Italian *chiaro* (light) and *scuro* (dark) — is one of the oldest and most powerful techniques in the visual arts.\n\n## What Is Chiaroscuro?\n\nAt its core, chiaroscuro is the studied manipulation of light and shadow to give two-dimensional images a three-dimensional quality.\n\n## The Five Values\n\nEvery successful chiaroscuro drawing relies on mastering five tonal values:\n\n- **Highlight** — the lightest point, where light hits directly\n- **Light** — the general illuminated area\n- **Halftone** — the transition zone between light and shadow\n- **Core Shadow** — the darkest part of the shadow\n- **Reflected Light** — subtle light bouncing back from surrounding surfaces\n\n## Practical Application\n\nWhen I begin a portrait, I squint at my reference. Squinting eliminates detail and reduces everything to core light and shadow masses. This is your roadmap.`
  },
  'my-digital-art-setup': {
    title: 'My Digital Art Setup: The Tools Behind the Work',
    coverImageUrl: 'https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=1400&q=90',
    tags: ['Digital Art', 'Tools', 'Workflow'], publishedDate: 'November 15, 2025', readTime: 6, author: 'Reigns',
    content: `After years of refining my digital workflow, here's exactly what I use to create my work.\n\n## Hardware\n\n**Wacom Cintiq Pro 16** — The display tablet that changed my life.\n\n**MacBook Pro M3 Max** — The processing power handles large Photoshop files effortlessly.\n\n## Software\n\n**Procreate on iPad Pro** — For sketching on the go.\n\n**Adobe Photoshop** — Primary tool for finished digital paintings.\n\n**Clip Studio Paint** — For anime-style work and line art.`
  },
  'from-sketch-to-masterpiece': {
    title: 'From Sketch to Masterpiece: A Commission Breakdown',
    coverImageUrl: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=1400&q=90',
    tags: ['Process', 'Commission', 'Portrait'], publishedDate: 'October 22, 2025', readTime: 12, author: 'Reigns',
    content: `Every commission starts with a conversation. The client shares references, mood boards, and their vision. My job is to listen between the lines.\n\n## Stage 1: Reference & Composition\n\nI study all provided references and sketch three thumbnail compositions. The client picks the direction that resonates most.\n\n## Stage 2: Underdrawing\n\nA detailed pencil sketch establishes proportions, values, and the key focal points. This is the blueprint.\n\n## Stage 3: Building Values\n\nWorking from dark to light, I establish the full tonal range before adding any detail.\n\n## Stage 4: Final Detail & Refinement\n\nThe final 20% of time produces 80% of the visual impact — hair strands, catch lights, texture.`
  },
  'pencil-drawing-fundamentals': {
    title: "Pencil Drawing Fundamentals I Wish I'd Known Earlier",
    coverImageUrl: 'https://images.unsplash.com/photo-1519764622345-23439dd774f7?w=1400&q=90',
    tags: ['Tutorial', 'Pencil', 'Fundamentals'], publishedDate: 'September 10, 2025', readTime: 10, author: 'Reigns',
    content: `Eight years in, I still return to fundamentals daily. Here are the lessons that changed everything.\n\n## 1. Observe More, Draw Less\n\nSpend 70% of your time looking, 30% drawing. Most mistakes happen because we're drawing what we *think* something looks like, not what it actually looks like.\n\n## 2. Grip and Pressure Control\n\nHold your pencil like a conductor holds a baton — loosely, with control. Vary your pressure constantly.\n\n## 3. Build Layers, Don't Press Hard\n\nMultiple light passes create richer darks than one heavy pass. You maintain control and can erase easily.`
  },
  'anime-vs-realism': {
    title: 'Anime vs Realism: Two Worlds, One Artist',
    coverImageUrl: 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=1400&q=90',
    tags: ['Anime Art', 'Realism', 'Philosophy'], publishedDate: 'August 5, 2025', readTime: 7, author: 'Reigns',
    content: `People are often surprised that I work in both hyperrealism and anime-inspired illustration. They seem like opposite poles — but they share the same core.\n\n## The Common Ground\n\nBoth styles demand mastery of proportion, value, and composition. An anime character with wrong proportions feels just as off as a realistic portrait with incorrect anatomy.\n\n## What Realism Teaches Anime\n\nStudying light on real faces taught me where to place the anime "glow" — the simplified but emotionally resonant lighting that makes anime characters feel alive.\n\n## What Anime Teaches Realism\n\nAnime forced me to distill — to find the *essential* lines that communicate an emotion. That economy of line made my realistic work sharper.`
  }
};



export default function BlogPost() {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try to find by slug in DB first, then by id, then fallback
    studioClient.entities.BlogPost.filter({ slug }).then(results => {
      if (results.length > 0) {
        setPost(results[0]);
      } else {
        // Try by id (if slug is actually an id)
        return studioClient.entities.BlogPost.filter({ id: slug }).then(byId => {
          if (byId.length > 0) setPost(byId[0]);
          else setPost(FALLBACK_POSTS[slug] || null);
        });
      }
    }).catch(() => {
      setPost(FALLBACK_POSTS[slug] || null);
    }).finally(() => setLoading(false));
  }, [slug]);

  if (loading) return (
    <div className="min-h-screen bg-obsidian flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-brass/20 border-t-brass rounded-full animate-spin" />
    </div>
  );

  if (!post) return (
    <div className="min-h-screen bg-obsidian flex items-center justify-center">
      <div className="text-center">
        <p className="text-ivory/30 text-xl mb-4">Post not found</p>
        <Link to="/blog" className="text-brass font-tight text-sm">← Back to Blog</Link>
      </div>
    </div>
  );

  const tags = Array.isArray(post.tags) ? post.tags : (post.tags ? post.tags.split(',').map(t => t.trim()) : []);

  return (
    <PageTransition>
      <div className="min-h-screen bg-obsidian pt-28 pb-24">
        <div className="noise-overlay fixed inset-0 pointer-events-none opacity-30" />

        {/* Cover */}
        {post.coverImageUrl && (
          <div className="relative h-[50vh] min-h-[400px] mb-16 overflow-hidden">
            <img src={post.coverImageUrl} alt={post.title} className="w-full h-full object-cover grayscale-[20%]" />
            <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/50 to-obsidian/20" />
            <div className="absolute bottom-12 w-full max-w-4xl px-6" style={{ left: '50%', transform: 'translateX(-50%)' }}>
              <div className="flex flex-wrap gap-2 mb-4">
                {tags.map(tag => (
                  <span key={tag} className="flex items-center gap-1 bg-brass/10 border border-brass/20 text-brass font-tight text-[10px] px-3 py-1 tracking-widest uppercase">
                    <Tag size={9} />{tag}
                  </span>
                ))}
              </div>
              <h1 className="font-display text-4xl md:text-5xl text-ivory leading-tight">{post.title}</h1>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="max-w-3xl mx-auto px-6">
          <ScrollReveal>
            <div className="flex items-center justify-between mb-12 pb-6 border-b border-brass/10">
              <div className="flex items-center gap-6">
                <div className="w-10 h-10 bg-brass/10 border border-brass/20 flex items-center justify-center">
                  <span className="font-display text-brass text-sm">R</span>
                </div>
                <div>
                  <p className="font-tight text-sm text-ivory/80">{post.author || 'Reigns'}</p>
                  <p className="font-tight text-xs text-ivory/30">{post.publishedDate}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {post.readTime && <span className="flex items-center gap-1 font-tight text-xs text-ivory/30"><Clock size={12} /> {post.readTime} min read</span>}
                <button className="flex items-center gap-1 font-tight text-xs text-ivory/40 hover:text-brass transition-colors"><Share2 size={13} /> Share</button>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.1}>
            <ReactMarkdown
              className="prose prose-invert max-w-none"
              components={{
                h1: ({ children }) => <h1 className="font-display text-3xl text-ivory mt-10 mb-4">{children}</h1>,
                h2: ({ children }) => <h2 className="font-display text-2xl text-ivory mt-10 mb-4">{children}</h2>,
                h3: ({ children }) => <h3 className="font-display text-xl text-ivory mt-8 mb-3">{children}</h3>,
                p: ({ children }) => <p className="text-ivory/60 leading-relaxed mb-4">{children}</p>,
                strong: ({ children }) => <strong className="text-ivory/90 font-semibold">{children}</strong>,
                em: ({ children }) => <em className="text-brass not-italic">{children}</em>,
                li: ({ children }) => <li className="text-ivory/60 ml-4 list-disc mb-1">{children}</li>,
                ul: ({ children }) => <ul className="mb-4">{children}</ul>,
                ol: ({ children }) => <ol className="mb-4 list-decimal ml-4">{children}</ol>,
                blockquote: ({ children }) => <blockquote className="border-l-2 border-brass/40 pl-4 italic text-ivory/50 my-6">{children}</blockquote>,
                code: ({ children }) => <code className="bg-carbon text-brass px-1.5 py-0.5 text-sm font-mono">{children}</code>,
                a: ({ children, href }) => <a href={href} className="text-brass underline underline-offset-2 hover:text-brass-light transition-colors">{children}</a>,
              }}
            >
              {post.content}
            </ReactMarkdown>
          </ScrollReveal>

          <ScrollReveal delay={0.2} className="mt-16 pt-10 border-t border-brass/10">
            <Link to="/blog" className="flex items-center gap-2 text-ivory/40 hover:text-brass transition-colors font-tight text-sm">
              <ArrowLeft size={16} /> Back to Journal
            </Link>
          </ScrollReveal>
        </div>
      </div>
    </PageTransition>
  );
}