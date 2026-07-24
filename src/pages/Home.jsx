import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { ArrowRight, Star, ArrowDown } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import ScrollReveal from '@/components/ScrollReveal';
import SectionLabel from '@/components/SectionLabel';
import PageTransition from '@/components/PageTransition';
import { useSettings } from '@/hooks/useSettings';

const HERO_IMAGES_DEFAULT = [
  '/brand/reigns-atelier-logo.jpg',
  '/brand/reigns-atelier-logo.jpg',
  '/brand/reigns-atelier-logo.jpg',
];

const FEATURED_ARTWORKS_FALLBACK = [];

const STATS_FALLBACK = [
  { key: 'stat_artworks', value: '—', label: 'Artworks Created' },
  { key: 'stat_clients', value: '—', label: 'Happy Clients' },
  { key: 'stat_years', value: '—', label: 'Years of Practice' },
  { key: 'stat_awards', value: '—', label: 'Awards Won' },
];

const TESTIMONIALS_PREVIEW = [];

const DEFAULT_QUOTES = [
  { text: 'Art enables us to find ourselves and lose ourselves at the same time.', author: 'Thomas Merton' },
  { text: 'Creativity takes courage.', author: 'Henri Matisse' },
  { text: 'Every artist was first an amateur.', author: 'Ralph Waldo Emerson' },
  { text: 'A picture is a poem without words.', author: 'Horace' },
  { text: 'Art washes away from the soul the dust of everyday life.', author: 'Pablo Picasso' },
  { text: 'The aim of art is to represent not the outward appearance, but inward significance.', author: 'Aristotle' },
  { text: 'Where words end, art begins.', author: 'Anonymous' },
  { text: 'Color is the place where our brain and the universe meet.', author: 'Paul Cézanne' },
  { text: 'An empty canvas is an invitation to become fearless.', author: 'Anonymous' },
  { text: 'Great art does not explain itself; it awakens something within us.', author: 'Anonymous' },
  { text: 'The artist sees possibility where others see only space.', author: 'Anonymous' },
  { text: 'A single line can hold an entire lifetime of feeling.', author: 'Anonymous' },
];

export default function Home() {
  const settings = useSettings();
  const HERO_IMAGES = [
    settings.hero_image_1 || HERO_IMAGES_DEFAULT[0],
    settings.hero_image_2 || HERO_IMAGES_DEFAULT[1],
    settings.hero_image_3 || HERO_IMAGES_DEFAULT[2],
  ];
  const [heroIndex, setHeroIndex] = useState(0);
  const [testimonials, setTestimonials] = useState(() => TESTIMONIALS_PREVIEW.filter(() => false));
  const [featuredArtworks, setFeaturedArtworks] = useState(() => FEATURED_ARTWORKS_FALLBACK.filter(() => false));
  const [quotes, setQuotes] = useState(DEFAULT_QUOTES);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const heroRef = useRef(null);

  useEffect(() => {
    studioClient.entities.Testimonial.filter({ isFeatured: true }).then(data => {
      if (data.length > 0) setTestimonials(data.slice(0, 3).map(t => ({ name: t.clientName, rating: t.rating, text: t.review, type: t.artworkType })));
    }).catch(() => {});
    studioClient.entities.Artwork.filter({ isFeatured: true }).then(data => {
      if (data.length > 0) setFeaturedArtworks(data.slice(0, 5));
    }).catch(() => {});
    studioClient.entities.Quote.list('created_date').then(async data => {
      if (data.length) {
        setQuotes(data.filter(quote => quote.active !== false));
      } else {
        const seeded = await Promise.all(DEFAULT_QUOTES.map(quote => studioClient.entities.Quote.create({ ...quote, active: true })));
        setQuotes(seeded);
      }
    });
  }, []);

  useEffect(() => {
    const seconds = Math.max(4, Number(settings.quote_interval_seconds) || 8);
    const timer = setInterval(() => setQuoteIndex(index => (index + 1) % quotes.length), seconds * 1000);
    return () => clearInterval(timer);
  }, [quotes.length, settings.quote_interval_seconds]);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  useEffect(() => {
    const t = setInterval(() => setHeroIndex(i => (i + 1) % HERO_IMAGES.length), 6000);
    return () => clearInterval(t);
  }, []);

  return (
    <PageTransition>
      {/* -- HERO -- */}
      <section ref={heroRef} className="relative h-screen min-h-[700px] flex items-center overflow-hidden">
        {/* Background images */}
        <AnimatePresence mode="wait">
          <motion.div
            key={heroIndex}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
            style={{ y: heroY }}
          >
            <img
              src={HERO_IMAGES[heroIndex]}
              alt=""
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-obsidian via-obsidian/70 to-obsidian/20" />
            <div className="absolute inset-0 bg-gradient-to-t from-obsidian/80 via-transparent to-obsidian/30" />
          </motion.div>
        </AnimatePresence>

        {/* Noise */}
        <div className="noise-overlay absolute inset-0 opacity-40" />

        {/* Violet glow */}
        <div className="absolute bottom-0 left-1/4 w-96 h-96 rounded-full opacity-20 blur-3xl pointer-events-none"
          style={{ background: '#3D2B52' }} />

        <motion.div
          className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 pt-24"
          style={{ opacity: heroOpacity }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-px bg-brass" />
              <span className="font-tight text-xs uppercase tracking-[0.35em] text-brass/70">Fine Art Studio</span>
            </div>
          </motion.div>

          <div className="overflow-hidden mb-2">
            <motion.h1
              className="font-display text-6xl md:text-8xl lg:text-[112px] leading-[0.9] text-ivory"
              initial={{ y: 120, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 1, ease: [0.16, 1, 0.3, 1] }}
            >
              Reigns
            </motion.h1>
          </div>
          <div className="overflow-hidden mb-8">
            <motion.h1
              className="font-display text-6xl md:text-8xl lg:text-[112px] leading-[0.9] italic text-brass"
              initial={{ y: 120, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.65, duration: 1, ease: [0.16, 1, 0.3, 1] }}
            >
              Atelier
            </motion.h1>
          </div>

          <motion.p
            className="text-ivory/50 text-lg md:text-xl max-w-lg leading-relaxed mb-10 font-light"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.8 }}
          >
            {settings.hero_subtitle || 'Where imagination bleeds onto canvas. Fine art portraits, digital masterpieces, and bespoke commissions crafted with devotion.'}
          </motion.p>

          <motion.div
            className="flex flex-wrap gap-4"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 0.8 }}
          >
            <Link to="/gallery"
              className="flex items-center gap-2 bg-brass text-obsidian px-8 py-4 font-tight text-sm tracking-widest uppercase hover:bg-brass-light transition-all duration-300 group"
            >
              View Gallery
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link to="/commission"
              className="flex items-center gap-2 border border-ivory/20 text-ivory/80 px-8 py-4 font-tight text-sm tracking-widest uppercase hover:border-brass/40 hover:text-brass transition-all duration-300"
            >
              Request Commission
            </Link>
          </motion.div>
        </motion.div>

        {/* Hero dots */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {HERO_IMAGES.map((_, i) => (
            <button key={i} onClick={() => setHeroIndex(i)}
              className={`w-6 h-px transition-all duration-300 ${i === heroIndex ? 'bg-brass' : 'bg-ivory/20'}`}
            />
          ))}
        </div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-10 right-12 flex flex-col items-center gap-2 z-10"
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
        >
          <span className="font-tight text-[10px] uppercase tracking-[0.3em] text-ivory/30 -rotate-90 mb-4">Scroll</span>
          <ArrowDown size={14} className="text-ivory/30" />
        </motion.div>
      </section>

      {/* -- FEATURED ARTWORKS -- */}
      <section className="py-32 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="flex items-end justify-between mb-16">
            <div>
              <ScrollReveal><SectionLabel>Featured Works</SectionLabel></ScrollReveal>
              <ScrollReveal delay={0.1}>
                <h2 className="font-display text-4xl md:text-5xl text-ivory">Selected <em>Masterpieces</em></h2>
              </ScrollReveal>
            </div>
            <ScrollReveal delay={0.2} direction="left">
              <Link to="/gallery" className="hidden md:flex items-center gap-2 text-brass font-tight text-sm tracking-wide hover:gap-4 transition-all duration-300">
                View All <ArrowRight size={16} />
              </Link>
            </ScrollReveal>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-4 -mx-6 px-6 lg:mx-0 lg:px-0 lg:grid lg:grid-cols-5 scrollbar-hide">
            {featuredArtworks.map((art, i) => (
              <ScrollReveal key={art.title || art.id} delay={i * 0.1} className="flex-shrink-0 w-64 lg:w-auto">
                <Link to="/gallery" className="group block">
                  <div className="relative overflow-hidden aspect-[3/4]">
                    <img
                      src={art.imageUrl}
                      alt={art.title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 group-hover:grayscale-0 grayscale-[20%]"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-obsidian/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                      <div>
                        <p className="font-tight text-[10px] uppercase tracking-widest text-brass/80">{art.category}</p>
                        <p className="font-display text-lg text-ivory">{art.title}</p>
                      </div>
                    </div>
                  </div>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* -- ARTIST QUOTE -- */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 50%, #3D2B52 0%, transparent 60%)' }} />
        <div className="noise-overlay absolute inset-0" />
        <div className="max-w-4xl mx-auto px-6 lg:px-12 text-center relative">
          <ScrollReveal>
            <span className="font-display text-8xl text-brass/10 block mb-4">"</span>
            <AnimatePresence mode="wait">
              <motion.blockquote key={quotes[quoteIndex]?.id || quoteIndex}
                initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -14, filter: 'blur(4px)' }}
                transition={{ duration: 0.7 }}
                className="font-display text-2xl md:text-4xl text-ivory/90 leading-relaxed italic mb-8">
                {quotes[quoteIndex]?.text}
              </motion.blockquote>
            </AnimatePresence>
            <div className="flex items-center justify-center gap-3">
              <div className="w-8 h-px bg-brass/40" />
              <span className="font-tight text-xs uppercase tracking-[0.3em] text-brass/60">{quotes[quoteIndex]?.author || 'Anonymous'}</span>
              <div className="w-8 h-px bg-brass/40" />
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* -- STATS -- */}
      <section className="py-24 border-y border-brass/10 relative">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {STATS_FALLBACK.map((stat, i) => (
              <ScrollReveal key={stat.label} delay={i * 0.1} className="text-center">
                <div className="font-display text-5xl md:text-6xl text-brass mb-2">{settings[stat.key] || stat.value}</div>
                <div className="font-tight text-xs uppercase tracking-[0.25em] text-ivory/40">{stat.label}</div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* -- TESTIMONIALS PREVIEW -- */}
      <section className="py-32 bg-carbon relative overflow-hidden">
        <div className="noise-overlay absolute inset-0" />
        <div className="max-w-7xl mx-auto px-6 lg:px-12 relative">
          <div className="text-center mb-16">
            <ScrollReveal><SectionLabel>Client Words</SectionLabel></ScrollReveal>
            <ScrollReveal delay={0.1}>
              <h2 className="font-display text-4xl md:text-5xl text-ivory mt-2">What Collectors <em>Say</em></h2>
            </ScrollReveal>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <ScrollReveal key={t.name} delay={i * 0.15}>
                <div className="glass-panel p-8 h-full flex flex-col">
                  <div className="flex gap-1 mb-4">
                    {Array(t.rating).fill(0).map((_, j) => (
                      <Star key={j} size={14} className="fill-brass text-brass" />
                    ))}
                  </div>
                  <p className="text-ivory/60 text-sm leading-relaxed mb-6 flex-1 italic">"{t.text}"</p>
                  <div>
                    <p className="text-ivory/90 font-tight text-sm">{t.name}</p>
                    <p className="text-brass/60 font-tight text-xs tracking-wide">{t.type}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>

          <ScrollReveal delay={0.4} className="text-center mt-12">
            <Link to="/testimonials" className="inline-flex items-center gap-2 text-brass font-tight text-sm tracking-wide border-b border-brass/30 hover:border-brass pb-1 transition-colors">
              Read All Reviews <ArrowRight size={14} />
            </Link>
          </ScrollReveal>
        </div>
      </section>

      {/* -- CTA -- */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-obsidian via-violet/20 to-obsidian" />
        <div className="noise-overlay absolute inset-0" />
        <div className="max-w-4xl mx-auto px-6 lg:px-12 text-center relative">
          <ScrollReveal>
            <SectionLabel>Let's Create Together</SectionLabel>
            <h2 className="font-display text-4xl md:text-6xl text-ivory mt-4 mb-6 leading-tight">
              Your Vision,<br /><em className="text-brass">Immortalized</em>
            </h2>
            <p className="text-ivory/50 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
              Commission a one-of-a-kind artwork that captures the essence of what you love most. Each piece is crafted with intention, skill, and soul.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link to="/commission"
                className="flex items-center gap-2 bg-brass text-obsidian px-10 py-4 font-tight text-sm tracking-widest uppercase hover:bg-brass-light transition-all duration-300 group"
              >
                Start Commission <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link to="/shop"
                className="flex items-center gap-2 border border-brass/20 text-ivory/70 px-10 py-4 font-tight text-sm tracking-widest uppercase hover:border-brass/40 hover:text-brass transition-all duration-300"
              >
                Browse Shop
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </PageTransition>
  );
}
