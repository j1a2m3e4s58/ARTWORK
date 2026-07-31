import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { X, Heart, Share2, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import ScrollReveal from '@/components/ScrollReveal';
import SectionLabel from '@/components/SectionLabel';
import PageTransition from '@/components/PageTransition';
import GalleryGuidedSearch from '@/components/GalleryGuidedSearch';
import { usePageContent } from '@/hooks/usePageContent';
import { useAuth } from '@/lib/AuthContext';
import { useCollectionResource } from '@/hooks/useCollectionResource';
import ResourceFeedback from '@/components/ResourceFeedback';
import { imageSrcSet, imageVariant } from '@/lib/media';

export default function Gallery() {
  const location = useLocation();
  const page = usePageContent('Gallery');
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState('All');
  const { data: artworks, setData: setArtworks, loading, error, retry } = useCollectionResource('Artwork', { limit: 100 });
  const [filtered, setFiltered] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const [likedIds, setLikedIds] = useState([]);
  const [aiResults, setAiResults] = useState(null);
  const [shareNotice, setShareNotice] = useState('');
  const categories = ['All', ...new Set(artworks.map(artwork => artwork.category).filter(Boolean))];

  useEffect(() => {
    if (!user) return;
    studioClient.artworks.myLikes().then(setLikedIds).catch(() => {});
  }, [user]);

  useEffect(() => {
    // Guided results are set directly by the search control.
    if (aiResults !== null) return;
    const result = artworks.filter(a => activeCategory === 'All' || a.category === activeCategory);
    setFiltered(result);
  }, [activeCategory, artworks, aiResults]);

  useEffect(() => {
    const artworkId = new URLSearchParams(location.search).get('artwork');
    if (!artworkId || lightbox) return;
    const selected = artworks.find(artwork => artwork.id === artworkId);
    if (selected) setLightbox(selected);
  }, [artworks, lightbox, location.search]);

  useEffect(() => {
    if (!lightbox) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = event => {
      if (event.key === 'Escape') setLightbox(null);
    };
    document.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', close);
    };
  }, [lightbox]);

  const handleGuidedResults = (results) => {
    if (results === null) {
      setAiResults(null);
    } else {
      setAiResults(results);
      setFiltered(results);
    }
  };

  const toggleLike = (id) => {
    if (!user) {
      window.location.assign('/login?redirect=/gallery');
      return;
    }
    studioClient.artworks.toggleLike(id).then(result => {
      setLikedIds(current => result.liked ? [...new Set([...current, id])] : current.filter(item => item !== id));
      setArtworks(current => current.map(artwork => artwork.id === id ? { ...artwork, likes: result.likes } : artwork));
    }).catch(() => {});
  };

  const shareArtwork = async artwork => {
    const url = `${window.location.origin}/gallery?artwork=${encodeURIComponent(artwork.id)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: artwork.title, text: artwork.description || `View ${artwork.title}`, url });
        setShareNotice('Artwork shared.');
      } else {
        await navigator.clipboard.writeText(url);
        setShareNotice('Artwork link copied.');
      }
    } catch (error) {
      if (error.name !== 'AbortError') setShareNotice('Sharing is unavailable. Copy the page address from your browser.');
    }
    window.setTimeout(() => setShareNotice(''), 3000);
  };

  const moveLightbox = direction => {
    const currentIndex = filtered.findIndex(item => item.id === lightbox?.id);
    if (currentIndex < 0 || !filtered.length) return;
    setLightbox(filtered[(currentIndex + direction + filtered.length) % filtered.length]);
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-obsidian pt-28 pb-24">
        <div className="noise-overlay fixed inset-0 pointer-events-none opacity-30" />

        {/* Header */}
        <div className="mx-auto mb-10 max-w-7xl px-5 sm:px-6 md:mb-16 lg:px-12">
          <ScrollReveal><SectionLabel>{page.gallery_label || 'The Vault'}</SectionLabel></ScrollReveal>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mt-2">
            <ScrollReveal delay={0.1}>
              <h1 className="font-display text-4xl text-ivory sm:text-5xl md:text-7xl">
                {page.gallery_title || 'Gallery Portfolio'}
              </h1>
            </ScrollReveal>
            {/* Guided catalogue search */}
            <ScrollReveal delay={0.2} direction="left" className="w-full md:w-auto">
              <GalleryGuidedSearch artworks={artworks} onResults={handleGuidedResults} />
            </ScrollReveal>
          </div>
        </div>

        {/* Category filters */}
        <div className="mx-auto mb-8 max-w-7xl px-5 sm:px-6 md:mb-12 lg:px-12">
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`font-tight text-xs uppercase tracking-widest px-5 py-2.5 border transition-all duration-300 ${
                  activeCategory === cat
                    ? 'bg-brass text-obsidian border-brass'
                    : 'border-brass/20 text-ivory/50 hover:border-brass/40 hover:text-ivory/80'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Masonry grid */}
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <ResourceFeedback loading={loading} error={error} onRetry={retry} empty={!filtered.length} emptyMessage="The portfolio is being curated. Please check back soon." />
          <div className="masonry-grid">
            <AnimatePresence>
              {filtered.map((art, i) => (
                <motion.div
                  key={art.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                  className="masonry-item"
                >
                  <div className="group relative overflow-hidden">
                    <img
                      src={imageVariant(art.imageUrl, 768)}
                      srcSet={imageSrcSet(art.imageUrl, [320, 480, 768, 1024])}
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      alt={art.title}
                      className="w-full object-cover transition-transform duration-700 group-hover:scale-105 grayscale-[15%] group-hover:grayscale-0"
                      loading="lazy"
                    />
                    {/* Overlay */}
                    <button
                      type="button"
                      onClick={() => setLightbox(art)}
                      aria-label={`View ${art.title}`}
                      className="absolute inset-0 bg-gradient-to-t from-obsidian/90 via-obsidian/20 to-transparent text-left opacity-100 transition-all duration-400 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                    >
                      <div className="absolute bottom-0 left-0 right-0 p-5">
                        <p className="font-tight text-[10px] uppercase tracking-widest text-brass/80 mb-1">{art.category}</p>
                        <p className="font-display text-xl text-ivory">{art.title}</p>
                        <p className="font-tight text-xs text-ivory/50 mt-1">{art.medium}</p>
                      </div>
                      <span className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center border border-ivory/20 bg-obsidian/70 text-ivory/90 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                        <Maximize2 size={15} />
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleLike(art.id)}
                      aria-label={`${likedIds.includes(art.id) ? 'Unlike' : 'Like'} ${art.title}`}
                      className={`absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center border opacity-0 transition-all duration-200 group-hover:opacity-100 focus:opacity-100 ${
                        likedIds.includes(art.id) ? 'border-brass bg-obsidian/85 text-brass' : 'border-ivory/20 bg-obsidian/75 text-ivory/70 hover:border-brass/40'
                      }`}
                    >
                      <Heart size={15} className={likedIds.includes(art.id) ? 'fill-brass' : ''} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

        </div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            className="fixed inset-0 z-[9000] flex items-center justify-center p-0 sm:p-5"
            role="dialog"
            aria-modal="true"
            aria-label={`${lightbox.title} artwork details`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={() => setLightbox(null)}
          >
            <div className="absolute inset-0 bg-obsidian/95 backdrop-blur-2xl" />
            <motion.div
              className="relative z-10 flex h-[100dvh] w-full flex-col overflow-y-auto border-y border-brass/20 bg-carbon sm:h-auto sm:max-h-[92dvh] sm:max-w-5xl sm:flex-row sm:overflow-hidden sm:border"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              onClick={e => e.stopPropagation()}
            >
              {/* The phone viewer keeps the entire artwork visible rather than cropping it. */}
              <div className="relative flex min-h-[44dvh] flex-1 items-center justify-center bg-black sm:min-h-0">
                <img
                  src={imageVariant(lightbox.imageUrl, 1600)}
                  srcSet={imageSrcSet(lightbox.imageUrl)}
                  sizes="(min-width: 1024px) 70vw, 100vw"
                  alt={lightbox.title}
                  className="h-[52dvh] w-full object-contain sm:h-[70vh] lg:h-[80vh]"
                />
                {filtered.length > 1 && (
                  <>
                    <button type="button" onClick={() => moveLightbox(-1)} aria-label="Previous artwork" className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center border border-ivory/20 bg-obsidian/70 text-ivory backdrop-blur transition-colors hover:border-brass hover:text-brass sm:left-5">
                      <ChevronLeft size={20} />
                    </button>
                    <button type="button" onClick={() => moveLightbox(1)} aria-label="Next artwork" className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center border border-ivory/20 bg-obsidian/70 text-ivory backdrop-blur transition-colors hover:border-brass hover:text-brass sm:right-5">
                      <ChevronRight size={20} />
                    </button>
                    <span className="absolute bottom-3 rounded-full border border-ivory/15 bg-obsidian/70 px-3 py-1 font-tight text-[10px] tracking-widest text-ivory/75 sm:hidden">
                      {filtered.findIndex(item => item.id === lightbox.id) + 1} / {filtered.length}
                    </span>
                  </>
                )}
              </div>
              {/* Info */}
              <div className="flex shrink-0 flex-col justify-between border-t border-brass/10 bg-carbon p-5 sm:w-80 sm:p-7 lg:border-l lg:border-t-0">
                <div>
                  <button onClick={() => setLightbox(null)} aria-label="Close artwork viewer" className="absolute right-3 top-3 z-20 flex h-11 w-11 items-center justify-center border border-ivory/20 bg-obsidian/70 text-ivory/75 backdrop-blur transition-colors hover:border-brass hover:text-brass sm:static sm:mb-6 sm:h-auto sm:w-auto sm:border-0 sm:bg-transparent sm:p-0 sm:text-ivory/40">
                    <X size={18} />
                  </button>
                  <p className="font-tight text-[10px] uppercase tracking-[0.3em] text-brass/60 mb-2">{lightbox.category}</p>
                  <h3 className="font-display text-3xl text-ivory mb-4">{lightbox.title}</h3>
                  {lightbox.description && <p className="mb-6 text-sm leading-relaxed text-ivory/55 sm:mb-8">{lightbox.description}</p>}
                  {lightbox.sourceName && lightbox.contentStatus !== 'original' && (
                    <p className="mb-6 border-l border-brass/30 pl-3 text-xs leading-relaxed text-ivory/35">
                      Licensed reference media from {lightbox.sourceName}. Original Reigns Atelier works are identified separately.
                    </p>
                  )}
                  <div className="space-y-3 border-t border-brass/10 pt-6">
                    {[['Medium', lightbox.medium], ['Dimensions', lightbox.dimensions], ['Year', lightbox.year]].map(([label, val]) => (
                      val && <div key={label} className="flex justify-between">
                        <span className="font-tight text-xs uppercase tracking-widest text-ivory/30">{label}</span>
                        <span className="font-tight text-sm text-ivory/70">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-6 flex gap-3 sm:mt-8">
                  <button
                    onClick={() => toggleLike(lightbox.id)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 border text-sm font-tight tracking-wide transition-all ${
                      likedIds.includes(lightbox.id) ? 'border-brass bg-brass/10 text-brass' : 'border-brass/20 text-ivory/50 hover:border-brass/40'
                    }`}
                  >
                    <Heart size={14} className={likedIds.includes(lightbox.id) ? 'fill-brass' : ''} />
                    {artworks.find(item => item.id === lightbox.id)?.likes || 0}
                  </button>
                  <button onClick={() => shareArtwork(lightbox)} className="flex-1 flex items-center justify-center gap-2 py-3 border border-brass/20 text-ivory/50 hover:border-brass/40 text-sm font-tight tracking-wide transition-all">
                    <Share2 size={14} /> Share
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {shareNotice && <div role="status" className="fixed bottom-24 left-1/2 z-[9100] -translate-x-1/2 border border-brass/25 bg-carbon/95 px-4 py-2 text-sm text-ivory shadow-xl">{shareNotice}</div>}
    </PageTransition>
  );
}
