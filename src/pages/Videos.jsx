import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { Play, X, Eye, Clock } from 'lucide-react';
import ResourceFeedback from '@/components/ResourceFeedback';
import ScrollReveal from '@/components/ScrollReveal';
import SectionLabel from '@/components/SectionLabel';
import PageTransition from '@/components/PageTransition';
import { usePageContent } from '@/hooks/usePageContent';
import { useCollectionResource } from '@/hooks/useCollectionResource';
import { imageSrcSet, imageVariant } from '@/lib/media';

function formatViews(n) {
  if (!n) return 'New';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n;
}

function embedUrl(value) {
  try {
    const url = new URL(value);
    if (url.hostname.includes('youtu.be')) return `https://www.youtube.com/embed/${url.pathname.slice(1)}?autoplay=1`;
    if (url.hostname.includes('youtube.com')) {
      if (url.pathname.startsWith('/embed/')) return `${value}${value.includes('?') ? '&' : '?'}autoplay=1`;
      return `https://www.youtube.com/embed/${url.searchParams.get('v')}?autoplay=1`;
    }
    if (url.hostname.includes('vimeo.com')) return `https://player.vimeo.com/video/${url.pathname.split('/').filter(Boolean).at(-1)}?autoplay=1`;
  } catch {
    return null;
  }
  return null;
}

function VideoPlayer({ video }) {
  const embed = embedUrl(video.videoUrl);
  if (embed) {
    return (
      <iframe
        src={embed}
        className="w-full h-full"
        allowFullScreen
        allow="autoplay; fullscreen"
        title={video.title}
      />
    );
  }
  return (
    <video
      src={video.videoUrl}
      poster={video.thumbnailUrl}
      className="w-full h-full object-contain bg-black"
      controls
      autoPlay
      playsInline
    >
      Your browser does not support this studio film.
    </video>
  );
}

export default function Videos() {
  const page = usePageContent('Videos');
  const { data: dbVideos, loading, error, retry } = useCollectionResource('Video');
  const [activeCategory, setActiveCategory] = useState('All');
  const [playing, setPlaying] = useState(null);
  const closeButtonRef = useRef(null);

  const allVideos = dbVideos;
  const categories = ['All', ...new Set(allVideos.map(video => video.category).filter(Boolean))];
  const filtered = activeCategory === 'All' ? allVideos : allVideos.filter(v => v.category === activeCategory);
  const [featured, ...rest] = filtered;

  useEffect(() => {
    if (!playing) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const onKeyDown = event => {
      if (event.key === 'Escape') setPlaying(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [playing]);

  const keyboardOpen = (event, video) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setPlaying(video);
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-obsidian pt-28 pb-24">
        <div className="noise-overlay fixed inset-0 pointer-events-none opacity-30" />

        {/* Header */}
        <div className="max-w-7xl mx-auto px-6 lg:px-12 mb-16">
          <ScrollReveal><SectionLabel>{page.videos_label || 'Video Portal'}</SectionLabel></ScrollReveal>
          <ScrollReveal delay={0.1}>
            <h1 className="font-display text-5xl md:text-7xl text-ivory mt-2">
              {page.videos_title || 'Art in Motion'}
            </h1>
          </ScrollReveal>
          <ScrollReveal delay={0.2}>
            <p className="text-ivory/40 text-lg mt-4 max-w-xl">
              {page.videos_subtitle || 'Process videos, time-lapses, tutorials, and behind-the-scenes glimpses into the atelier.'}
            </p>
          </ScrollReveal>
        </div>

        {/* Category filters */}
        <div className="max-w-7xl mx-auto px-6 lg:px-12 mb-12 flex flex-wrap gap-2">
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`font-tight text-xs uppercase tracking-widest px-5 py-2.5 border transition-all duration-300 ${
                activeCategory === cat ? 'bg-brass text-obsidian border-brass' : 'border-brass/20 text-ivory/50 hover:border-brass/40 hover:text-ivory/80'
              }`}>
              {cat}
            </button>
          ))}
        </div>

        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <ResourceFeedback loading={loading} error={error} onRetry={retry} empty={!featured} emptyMessage="Studio films are being prepared. Please check back soon." />
          {/* Featured */}
          {featured && (
            <ScrollReveal className="mb-10">
              <div
                className="relative group cursor-pointer overflow-hidden aspect-video bg-carbon border border-brass/10 hover:border-brass/30 transition-all duration-300"
                onClick={() => setPlaying(featured)}
                onKeyDown={event => keyboardOpen(event, featured)}
                role="button"
                tabIndex={0}
                aria-label={`Play ${featured.title}`}
              >
                <img src={imageVariant(featured.thumbnailUrl, 1200)} srcSet={imageSrcSet(featured.thumbnailUrl)} sizes="(min-width: 1280px) 1200px, 100vw" alt={featured.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 grayscale-[20%] group-hover:grayscale-0" />
                <div className="absolute inset-0 bg-gradient-to-t from-obsidian/90 via-obsidian/30 to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div
                    className="w-20 h-20 border-2 border-brass/60 rounded-full flex items-center justify-center group-hover:bg-brass/20 transition-all duration-300"
                    whileHover={{ scale: 1.1 }}
                  >
                    <Play size={28} className="text-brass ml-1" fill="#C9A96E" />
                  </motion.div>
                </div>
                {featured.isFeatured && (
                  <div className="absolute top-5 left-5 bg-brass text-obsidian font-tight text-[10px] px-3 py-1 tracking-widest uppercase">Featured</div>
                )}
                <div className="absolute bottom-0 left-0 right-0 p-8">
                  <p className="font-tight text-[10px] uppercase tracking-widest text-brass/70 mb-1">{featured.category}</p>
                  <h2 className="font-display text-3xl text-ivory mb-2">{featured.title}</h2>
                  <p className="text-ivory/50 text-sm line-clamp-2 max-w-2xl">{featured.description}</p>
                  <div className="flex items-center gap-4 mt-3">
                    <span className="flex items-center gap-1 text-ivory/30 font-tight text-xs"><Clock size={12} />{featured.duration}</span>
                    <span className="flex items-center gap-1 text-ivory/30 font-tight text-xs"><Eye size={12} />{formatViews(featured.views)}</span>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          )}

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {rest.map((video, i) => (
              <ScrollReveal key={video.id} delay={i * 0.07}>
                <div
                  className="group cursor-pointer bg-carbon border border-brass/10 hover:border-brass/30 transition-all duration-300 overflow-hidden"
                  onClick={() => setPlaying(video)}
                  onKeyDown={event => keyboardOpen(event, video)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Play ${video.title}`}
                >
                  <div className="relative aspect-video overflow-hidden">
                    <img src={imageVariant(video.thumbnailUrl, 768)} srcSet={imageSrcSet(video.thumbnailUrl, [320, 480, 768])} sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" alt={video.title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 grayscale-[25%] group-hover:grayscale-0" />
                    <div className="absolute inset-0 bg-obsidian/30 group-hover:bg-obsidian/10 transition-colors" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="w-14 h-14 border border-brass/50 rounded-full flex items-center justify-center bg-obsidian/50">
                        <Play size={18} className="text-brass ml-0.5" fill="#C9A96E" />
                      </div>
                    </div>
                    <div className="absolute bottom-2 right-2 bg-obsidian/80 px-2 py-0.5 font-tight text-xs text-ivory/60">{video.duration}</div>
                    <div className="absolute top-2 left-2 bg-obsidian/70 px-2 py-0.5 font-tight text-[10px] uppercase tracking-widest text-brass/70">{video.category}</div>
                  </div>
                  <div className="p-5">
                    <h3 className="font-display text-lg text-ivory mb-2 leading-tight group-hover:text-brass/90 transition-colors">{video.title}</h3>
                    <p className="text-ivory/40 text-xs line-clamp-2 mb-3">{video.description}</p>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-ivory/25 font-tight text-xs"><Eye size={11} />{formatViews(video.views)}</span>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </div>

      {/* Video lightbox */}
      <AnimatePresence>
        {playing && (
          <motion.div
            className="fixed inset-0 z-[9000] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="studio-video-title"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setPlaying(null)}
          >
            <div className="absolute inset-0 bg-obsidian/95 backdrop-blur-2xl" />
            <motion.div
              className="relative z-10 w-full max-w-4xl"
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-tight text-[10px] uppercase tracking-widest text-brass/60">{playing.category}</p>
                  <h3 id="studio-video-title" className="font-display text-2xl text-ivory">{playing.title}</h3>
                </div>
                <button ref={closeButtonRef} onClick={() => setPlaying(null)} aria-label="Close video player" className="flex h-11 w-11 items-center justify-center text-ivory/40 hover:text-brass transition-colors">
                  <X size={22} />
                </button>
              </div>
              <div className="aspect-video bg-obsidian border border-brass/10 overflow-hidden">
                <VideoPlayer video={playing} />
              </div>
              {playing.description && (
                <p className="text-ivory/40 text-sm mt-4 leading-relaxed">{playing.description}</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
