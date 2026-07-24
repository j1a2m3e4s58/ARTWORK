import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Heart, Share2, ZoomIn } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ScrollReveal from '@/components/ScrollReveal';
import SectionLabel from '@/components/SectionLabel';
import PageTransition from '@/components/PageTransition';
import GalleryAISearch from '@/components/GalleryAISearch';

const CATEGORIES = ['All', 'Portraits', 'Sketches', 'Digital Art', 'Pencil Drawings', 'Anime Art', 'Realism'];

const DEMO_ARTWORKS = [
  { id: '1', title: 'Whispers of Ivory', category: 'Portraits', imageUrl: 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=800&q=85', medium: 'Charcoal on Paper', dimensions: '50×70cm', year: '2025', description: 'A study in light and shadow, capturing the quiet dignity of the human gaze.', likes: 234, span: '1x2' },
  { id: '2', title: 'Urban Reverie', category: 'Sketches', imageUrl: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=600&q=85', medium: 'Graphite', dimensions: '30×40cm', year: '2025', description: 'The city breathes in strokes of graphite.', likes: 145, span: '1x1' },
  { id: '3', title: 'Neon Soul', category: 'Digital Art', imageUrl: 'https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=800&q=85', medium: 'Digital', dimensions: '4K Resolution', year: '2025', description: 'Digital illustration exploring identity in a neon-lit world.', likes: 389, span: '2x1' },
  { id: '4', title: 'Graphite Dreams', category: 'Pencil Drawings', imageUrl: 'https://images.unsplash.com/photo-1519764622345-23439dd774f7?w=600&q=85', medium: 'Pencil', dimensions: '21×29cm', year: '2024', description: 'Dreams drawn in the quiet hour before dawn.', likes: 198, span: '1x1' },
  { id: '5', title: 'Sakura Mind', category: 'Anime Art', imageUrl: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800&q=85', medium: 'Digital & Ink', dimensions: '4K Resolution', year: '2025', description: 'Blossoms and shadows — an anime-inspired portrait study.', likes: 567, span: '1x2' },
  { id: '6', title: 'Silent Symmetry', category: 'Realism', imageUrl: 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=600&q=85', medium: 'Oil on Canvas', dimensions: '60×80cm', year: '2024', description: 'Hyperrealist exploration of everyday moments.', likes: 312, span: '1x1' },
  { id: '7', title: 'The Wanderer', category: 'Portraits', imageUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&q=85', medium: 'Charcoal & Pastel', dimensions: '40×50cm', year: '2025', description: 'A soul caught between worlds.', likes: 421, span: '1x1' },
  { id: '8', title: 'Ink & Smoke', category: 'Sketches', imageUrl: 'https://images.unsplash.com/photo-1580331451062-99ff652288d7?w=800&q=85', medium: 'India Ink', dimensions: '25×35cm', year: '2024', description: 'Ink flows like thought — unrestrained and free.', likes: 267, span: '2x1' },
  { id: '9', title: 'Cyber Bloom', category: 'Digital Art', imageUrl: 'https://images.unsplash.com/photo-1516339901601-2e1b62dc0c45?w=600&q=85', medium: 'Digital', dimensions: '4K Resolution', year: '2025', description: 'When technology meets nature.', likes: 489, span: '1x1' },
  { id: '10', title: 'Old Paper', category: 'Pencil Drawings', imageUrl: 'https://images.unsplash.com/photo-1594736797933-d0501ba2fe65?w=600&q=85', medium: 'Pencil on Aged Paper', dimensions: '15×20cm', year: '2023', description: 'The patina of time rendered in graphite.', likes: 178, span: '1x1' },
  { id: '11', title: 'Spirit Fox', category: 'Anime Art', imageUrl: 'https://images.unsplash.com/photo-1591181520189-abcb0735c65d?w=600&q=85', medium: 'Digital', dimensions: '4K Resolution', year: '2024', description: 'A mythological creature in modern anime style.', likes: 623, span: '1x1' },
  { id: '12', title: 'Still Life in Noir', category: 'Realism', imageUrl: 'https://images.unsplash.com/photo-1570158268183-d296b2892211?w=600&q=85', medium: 'Acrylic', dimensions: '35×45cm', year: '2024', description: 'Classical still life with a cinematic dark palette.', likes: 201, span: '1x1' },
];

export default function Gallery() {
  const [activeCategory, setActiveCategory] = useState('All');
  const [artworks, setArtworks] = useState(DEMO_ARTWORKS);
  const [filtered, setFiltered] = useState(DEMO_ARTWORKS);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [likedIds, setLikedIds] = useState([]);
  const [aiResults, setAiResults] = useState(null);

  useEffect(() => {
    base44.entities.Artwork.list('-created_date', 100).then(data => {
      if (data.length > 0) { setArtworks(data); setDbLoaded(true); }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    // If AI results are active, they're set directly via handleAIResults
    if (aiResults !== null) return;
    const result = artworks.filter(a => activeCategory === 'All' || a.category === activeCategory);
    setFiltered(result);
  }, [activeCategory, artworks, aiResults]);

  const handleAIResults = (results) => {
    if (results === null) {
      setAiResults(null);
    } else {
      setAiResults(results);
      setFiltered(results);
    }
  };

  const toggleLike = (id) => {
    const isLiked = likedIds.includes(id);
    setLikedIds(prev => isLiked ? prev.filter(x => x !== id) : [...prev, id]);
    // Persist to DB for real artworks (not demo)
    const artwork = artworks.find(a => a.id === id);
    if (artwork && dbLoaded) {
      const newLikes = (artwork.likes || 0) + (isLiked ? -1 : 1);
      base44.entities.Artwork.update(id, { likes: newLikes }).catch(() => {});
      setArtworks(prev => prev.map(a => a.id === id ? { ...a, likes: newLikes } : a));
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-obsidian pt-28 pb-24">
        <div className="noise-overlay fixed inset-0 pointer-events-none opacity-30" />

        {/* Header */}
        <div className="max-w-7xl mx-auto px-6 lg:px-12 mb-16">
          <ScrollReveal><SectionLabel>The Vault</SectionLabel></ScrollReveal>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mt-2">
            <ScrollReveal delay={0.1}>
              <h1 className="font-display text-5xl md:text-7xl text-ivory">
                Gallery<br /><em className="text-brass">Portfolio</em>
              </h1>
            </ScrollReveal>
            {/* AI + Text Search */}
            <ScrollReveal delay={0.2} direction="left">
              <GalleryAISearch artworks={artworks} onResults={handleAIResults} activeCategory={activeCategory} />
            </ScrollReveal>
          </div>
        </div>

        {/* Category filters */}
        <div className="max-w-7xl mx-auto px-6 lg:px-12 mb-12">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
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
                  <div
                    className="group relative overflow-hidden cursor-pointer"
                    onClick={() => setLightbox(art)}
                  >
                    <img
                      src={art.imageUrl}
                      alt={art.title}
                      className="w-full object-cover transition-transform duration-700 group-hover:scale-105 grayscale-[15%] group-hover:grayscale-0"
                      loading="lazy"
                    />
                    {/* Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-obsidian/90 via-obsidian/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-400">
                      <div className="absolute bottom-0 left-0 right-0 p-5">
                        <p className="font-tight text-[10px] uppercase tracking-widest text-brass/80 mb-1">{art.category}</p>
                        <p className="font-display text-xl text-ivory">{art.title}</p>
                        <p className="font-tight text-xs text-ivory/50 mt-1">{art.medium}</p>
                      </div>
                      <div className="absolute top-4 right-4 flex gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleLike(art.id); }}
                          className={`w-9 h-9 flex items-center justify-center border transition-colors duration-200 ${
                            likedIds.includes(art.id) ? 'border-brass bg-brass/20 text-brass' : 'border-ivory/20 text-ivory/60 hover:border-brass/40'
                          }`}
                        >
                          <Heart size={14} className={likedIds.includes(art.id) ? 'fill-brass' : ''} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setLightbox(art); }}
                          className="w-9 h-9 flex items-center justify-center border border-ivory/20 text-ivory/60 hover:border-brass/40 transition-colors duration-200"
                        >
                          <ZoomIn size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-24">
              <p className="text-ivory/30 font-tight tracking-wide">No artworks found.</p>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            className="fixed inset-0 z-[9000] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={() => setLightbox(null)}
          >
            <div className="absolute inset-0 bg-obsidian/95 backdrop-blur-2xl" />
            <motion.div
              className="relative z-10 flex flex-col lg:flex-row gap-0 max-w-5xl w-full mx-6 overflow-hidden"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              onClick={e => e.stopPropagation()}
            >
              {/* Image */}
              <div className="flex-1 relative">
                <img
                  src={lightbox.imageUrl}
                  alt={lightbox.title}
                  className="w-full h-[70vh] lg:h-[80vh] object-cover"
                />
              </div>
              {/* Info */}
              <div className="lg:w-72 bg-carbon border-t lg:border-t-0 lg:border-l border-brass/10 p-8 flex flex-col justify-between">
                <div>
                  <button onClick={() => setLightbox(null)} className="text-ivory/40 hover:text-brass transition-colors mb-8">
                    <X size={18} />
                  </button>
                  <p className="font-tight text-[10px] uppercase tracking-[0.3em] text-brass/60 mb-2">{lightbox.category}</p>
                  <h3 className="font-display text-3xl text-ivory mb-4">{lightbox.title}</h3>
                  <p className="text-ivory/50 text-sm leading-relaxed mb-8">{lightbox.description}</p>
                  <div className="space-y-3 border-t border-brass/10 pt-6">
                    {[['Medium', lightbox.medium], ['Dimensions', lightbox.dimensions], ['Year', lightbox.year]].map(([label, val]) => (
                      val && <div key={label} className="flex justify-between">
                        <span className="font-tight text-xs uppercase tracking-widest text-ivory/30">{label}</span>
                        <span className="font-tight text-sm text-ivory/70">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 mt-8">
                  <button
                    onClick={() => toggleLike(lightbox.id)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 border text-sm font-tight tracking-wide transition-all ${
                      likedIds.includes(lightbox.id) ? 'border-brass bg-brass/10 text-brass' : 'border-brass/20 text-ivory/50 hover:border-brass/40'
                    }`}
                  >
                    <Heart size={14} className={likedIds.includes(lightbox.id) ? 'fill-brass' : ''} />
                    {lightbox.likes + (likedIds.includes(lightbox.id) ? 1 : 0)}
                  </button>
                  <button className="flex-1 flex items-center justify-center gap-2 py-3 border border-brass/20 text-ivory/50 hover:border-brass/40 text-sm font-tight tracking-wide transition-all">
                    <Share2 size={14} /> Share
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}