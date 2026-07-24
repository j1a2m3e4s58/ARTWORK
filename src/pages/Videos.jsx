import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, X, Eye, Clock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ScrollReveal from '@/components/ScrollReveal';
import SectionLabel from '@/components/SectionLabel';
import PageTransition from '@/components/PageTransition';

const CATEGORIES = ['All', 'Process', 'Time-lapse', 'Tutorial', 'Behind the Scenes', 'Commission Reveal'];

const DEMO_VIDEOS = [
  {
    id: 'd1', title: 'Portrait Commission — Full Process', category: 'Process',
    thumbnailUrl: 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=800&q=85',
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    duration: '18:42', views: 12400, isFeatured: true,
    description: 'Watch the complete journey of a charcoal portrait from blank page to finished masterpiece.',
  },
  {
    id: 'd2', title: 'Digital Art Time-lapse — Neon Soul', category: 'Time-lapse',
    thumbnailUrl: 'https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=800&q=85',
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    duration: '4:10', views: 8900, isFeatured: true,
    description: 'A 3-hour digital painting compressed into 4 minutes. Procreate time-lapse.',
  },
  {
    id: 'd3', title: 'How I Draw Realistic Eyes', category: 'Tutorial',
    thumbnailUrl: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&q=85',
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    duration: '22:05', views: 31000, isFeatured: false,
    description: 'Step-by-step tutorial on rendering hyper-realistic eyes in graphite pencil.',
  },
  {
    id: 'd4', title: 'Studio Tour — The Atelier', category: 'Behind the Scenes',
    thumbnailUrl: 'https://images.unsplash.com/photo-1580894732444-8ecded7900cd?w=800&q=85',
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    duration: '9:33', views: 5600, isFeatured: false,
    description: 'A full walkthrough of my studio — tools, setup, and the creative environment.',
  },
  {
    id: 'd5', title: 'Commission Reveal — Wedding Portrait', category: 'Commission Reveal',
    thumbnailUrl: 'https://images.unsplash.com/photo-1519764622345-23439dd774f7?w=800&q=85',
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    duration: '6:18', views: 9800, isFeatured: false,
    description: 'The emotional reveal of a custom wedding portrait commission.',
  },
  {
    id: 'd6', title: 'Anime Illustration — Sakura Mind', category: 'Time-lapse',
    thumbnailUrl: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800&q=85',
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    duration: '5:55', views: 22000, isFeatured: false,
    description: 'Anime character illustration process in full time-lapse.',
  },
];

function formatViews(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n;
}

export default function Videos() {
  const [dbVideos, setDbVideos] = useState([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [playing, setPlaying] = useState(null);

  useEffect(() => {
    base44.entities.Video.list('-created_date', 50).then(setDbVideos);
  }, []);

  const allVideos = dbVideos.length > 0 ? dbVideos : DEMO_VIDEOS;
  const filtered = activeCategory === 'All' ? allVideos : allVideos.filter(v => v.category === activeCategory);
  const [featured, ...rest] = filtered;

  return (
    <PageTransition>
      <div className="min-h-screen bg-obsidian pt-28 pb-24">
        <div className="noise-overlay fixed inset-0 pointer-events-none opacity-30" />

        {/* Header */}
        <div className="max-w-7xl mx-auto px-6 lg:px-12 mb-16">
          <ScrollReveal><SectionLabel>Video Portal</SectionLabel></ScrollReveal>
          <ScrollReveal delay={0.1}>
            <h1 className="font-display text-5xl md:text-7xl text-ivory mt-2">
              Art in <em className="text-brass">Motion</em>
            </h1>
          </ScrollReveal>
          <ScrollReveal delay={0.2}>
            <p className="text-ivory/40 text-lg mt-4 max-w-xl">
              Process videos, time-lapses, tutorials, and behind-the-scenes glimpses into the atelier.
            </p>
          </ScrollReveal>
        </div>

        {/* Category filters */}
        <div className="max-w-7xl mx-auto px-6 lg:px-12 mb-12 flex flex-wrap gap-2">
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`font-tight text-xs uppercase tracking-widest px-5 py-2.5 border transition-all duration-300 ${
                activeCategory === cat ? 'bg-brass text-obsidian border-brass' : 'border-brass/20 text-ivory/50 hover:border-brass/40 hover:text-ivory/80'
              }`}>
              {cat}
            </button>
          ))}
        </div>

        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          {/* Featured */}
          {featured && (
            <ScrollReveal className="mb-10">
              <div
                className="relative group cursor-pointer overflow-hidden aspect-video bg-carbon border border-brass/10 hover:border-brass/30 transition-all duration-300"
                onClick={() => setPlaying(featured)}
              >
                <img src={featured.thumbnailUrl} alt={featured.title}
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
                >
                  <div className="relative aspect-video overflow-hidden">
                    <img src={video.thumbnailUrl} alt={video.title}
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
                  <h3 className="font-display text-2xl text-ivory">{playing.title}</h3>
                </div>
                <button onClick={() => setPlaying(null)} className="text-ivory/40 hover:text-brass transition-colors">
                  <X size={22} />
                </button>
              </div>
              <div className="aspect-video bg-obsidian border border-brass/10 overflow-hidden">
                <iframe
                  src={playing.videoUrl + '?autoplay=1'}
                  className="w-full h-full"
                  allowFullScreen
                  allow="autoplay; fullscreen"
                  title={playing.title}
                />
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