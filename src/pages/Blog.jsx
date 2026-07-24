import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock, Tag } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import ScrollReveal from '@/components/ScrollReveal';
import SectionLabel from '@/components/SectionLabel';
import PageTransition from '@/components/PageTransition';

const DEMO_POSTS = [
  { id: 'd1', slug: 'the-art-of-chiaroscuro', title: 'The Art of Chiaroscuro: Drawing with Light and Shadow', excerpt: "Understanding the dramatic interplay between light and shadow is perhaps the most powerful tool in a portrait artist's arsenal.", coverImageUrl: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&q=85', tags: ['Technique', 'Charcoal', 'Portrait'], publishedDate: '2025-12-01', readTime: 8, author: 'Reigns' },
  { id: 'd2', slug: 'my-digital-art-setup', title: 'My Digital Art Setup: The Tools Behind the Work', excerpt: 'From Wacom tablets to Procreate brushes — a full breakdown of the tools and workflow that power my digital illustration process.', coverImageUrl: 'https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=800&q=85', tags: ['Digital Art', 'Tools', 'Workflow'], publishedDate: '2025-11-15', readTime: 6, author: 'Reigns' },
  { id: 'd3', slug: 'from-sketch-to-masterpiece', title: 'From Sketch to Masterpiece: A Commission Breakdown', excerpt: "Follow the complete journey of a client's portrait commission — from the first reference photo to the final framed piece.", coverImageUrl: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800&q=85', tags: ['Process', 'Commission', 'Portrait'], publishedDate: '2025-10-22', readTime: 12, author: 'Reigns' },
  { id: 'd4', slug: 'pencil-drawing-fundamentals', title: "Pencil Drawing Fundamentals I Wish I'd Known Earlier", excerpt: 'After 8 years of drawing, these are the foundational skills and mindset shifts that would have accelerated my growth by years.', coverImageUrl: 'https://images.unsplash.com/photo-1519764622345-23439dd774f7?w=800&q=85', tags: ['Tutorial', 'Pencil', 'Fundamentals'], publishedDate: '2025-09-10', readTime: 10, author: 'Reigns' },
  { id: 'd5', slug: 'anime-vs-realism', title: 'Anime vs Realism: Two Worlds, One Artist', excerpt: 'How do you balance mastery of hyperrealistic portraiture with the fluid, expressive language of anime illustration?', coverImageUrl: 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=800&q=85', tags: ['Anime Art', 'Realism', 'Philosophy'], publishedDate: '2025-08-05', readTime: 7, author: 'Reigns' },
];

export default function Blog() {
  const [posts, setPosts] = useState(DEMO_POSTS);

  useEffect(() => {
    studioClient.entities.BlogPost.list('-created_date', 50).then(data => {
      if (data.length > 0) setPosts(data);
    }).catch(() => {});
  }, []);

  const [featured, ...rest] = posts;

  if (!featured) return (
    <PageTransition>
      <div className="min-h-screen bg-obsidian pt-28 flex items-center justify-center">
        <p className="text-ivory/30 font-tight">No posts yet.</p>
      </div>
    </PageTransition>
  );

  const getSlug = (post) => post.slug || post.id;
  const getTags = (post) => Array.isArray(post.tags) ? post.tags : (post.tags ? post.tags.split(',').map(t => t.trim()) : []);

  return (
    <PageTransition>
      <div className="min-h-screen bg-obsidian pt-28 pb-24">
        <div className="noise-overlay fixed inset-0 pointer-events-none opacity-30" />

        {/* Header */}
        <div className="max-w-7xl mx-auto px-6 lg:px-12 mb-16">
          <ScrollReveal><SectionLabel>Art Journal</SectionLabel></ScrollReveal>
          <ScrollReveal delay={0.1}>
            <h1 className="font-display text-5xl md:text-7xl text-ivory mt-2">Stories &<br /><em className="text-brass">Process</em></h1>
          </ScrollReveal>
          <ScrollReveal delay={0.2}>
            <p className="text-ivory/40 text-lg mt-4 max-w-xl">Behind the art: tutorials, process breakdowns, studio notes, and thoughts on the creative life.</p>
          </ScrollReveal>
        </div>

        {/* Featured post */}
        <div className="max-w-7xl mx-auto px-6 lg:px-12 mb-16">
          <ScrollReveal>
            <Link to={`/blog/${getSlug(featured)}`} className="group grid grid-cols-1 lg:grid-cols-2 gap-0 bg-carbon border border-brass/10 hover:border-brass/25 transition-all duration-300 overflow-hidden">
              {featured.coverImageUrl && (
                <div className="aspect-[16/9] lg:aspect-auto overflow-hidden">
                  <img src={featured.coverImageUrl} alt={featured.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 grayscale-[15%] group-hover:grayscale-0" />
                </div>
              )}
              <div className="p-10 flex flex-col justify-center">
                <div className="flex gap-2 mb-4">
                  <span className="bg-brass text-obsidian font-tight text-[10px] px-3 py-1 tracking-widest uppercase">Featured</span>
                  {getTags(featured)[0] && <span className="border border-brass/20 text-brass/60 font-tight text-[10px] px-3 py-1 tracking-widest uppercase">{getTags(featured)[0]}</span>}
                </div>
                <h2 className="font-display text-3xl md:text-4xl text-ivory mb-4 leading-tight group-hover:text-brass/90 transition-colors">{featured.title}</h2>
                <p className="text-ivory/50 text-sm leading-relaxed mb-6 line-clamp-3">{featured.excerpt}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="font-tight text-xs text-ivory/30">{featured.author || 'Reigns'}</span>
                    {featured.readTime && <span className="flex items-center gap-1 font-tight text-xs text-ivory/30"><Clock size={12} /> {featured.readTime} min read</span>}
                  </div>
                  <span className="flex items-center gap-1 text-brass font-tight text-sm group-hover:gap-3 transition-all">Read <ArrowRight size={14} /></span>
                </div>
              </div>
            </Link>
          </ScrollReveal>
        </div>

        {/* Post grid */}
        {rest.length > 0 && (
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {rest.map((post, i) => (
                <ScrollReveal key={post.id || post.slug} delay={i * 0.1}>
                  <Link to={`/blog/${getSlug(post)}`} className="group flex flex-col bg-carbon border border-brass/10 hover:border-brass/25 transition-all duration-300 overflow-hidden h-full">
                    {post.coverImageUrl && (
                      <div className="aspect-[16/9] overflow-hidden">
                        <img src={post.coverImageUrl} alt={post.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 grayscale-[20%] group-hover:grayscale-0" />
                      </div>
                    )}
                    <div className="p-7 flex flex-col flex-1">
                      <div className="flex flex-wrap gap-2 mb-3">
                        {getTags(post).slice(0, 2).map(tag => (
                          <span key={tag} className="flex items-center gap-1 font-tight text-[10px] uppercase tracking-widest text-brass/50"><Tag size={9} />{tag}</span>
                        ))}
                      </div>
                      <h3 className="font-display text-2xl text-ivory mb-3 leading-tight group-hover:text-brass/90 transition-colors flex-1">{post.title}</h3>
                      <p className="text-ivory/40 text-sm leading-relaxed mb-5 line-clamp-2">{post.excerpt}</p>
                      <div className="flex items-center justify-between mt-auto">
                        {post.readTime && <span className="flex items-center gap-1 font-tight text-xs text-ivory/25"><Clock size={11} /> {post.readTime} min read</span>}
                        <span className="flex items-center gap-1 text-brass font-tight text-xs group-hover:gap-2 transition-all">Read more <ArrowRight size={12} /></span>
                      </div>
                    </div>
                  </Link>
                </ScrollReveal>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}