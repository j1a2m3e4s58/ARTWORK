import { Link } from 'react-router-dom';
import { ArrowRight, Clock, Tag } from 'lucide-react';
import ResourceFeedback from '@/components/ResourceFeedback';
import ScrollReveal from '@/components/ScrollReveal';
import SectionLabel from '@/components/SectionLabel';
import PageTransition from '@/components/PageTransition';
import { usePageContent } from '@/hooks/usePageContent';
import { useCollectionResource } from '@/hooks/useCollectionResource';


export default function Blog() {
  const page = usePageContent('Blog');
  const { data: posts, loading, error, retry } = useCollectionResource('BlogPost');

  const [featured, ...rest] = posts;

  if (loading || error || !featured) return (
    <PageTransition>
      <div className="min-h-screen bg-obsidian px-6 pt-40">
        <div className="mx-auto max-w-4xl">
          <ResourceFeedback loading={loading} error={error} onRetry={retry} empty={!featured} emptyMessage="No studio journal posts have been published yet." />
        </div>
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
          <ScrollReveal><SectionLabel>{page.blog_label || 'Art Journal'}</SectionLabel></ScrollReveal>
          <ScrollReveal delay={0.1}>
            <h1 className="font-display text-5xl md:text-7xl text-ivory mt-2">{page.blog_title || 'Stories & Process'}</h1>
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
