import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Tag, Share2 } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import ReactMarkdown from 'react-markdown';
import ScrollReveal from '@/components/ScrollReveal';
import PageTransition from '@/components/PageTransition';




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
          else setPost(null);
        });
      }
    }).catch(() => {
      setPost(null);
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
