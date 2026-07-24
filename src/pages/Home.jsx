import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { ArrowRight, Star, ArrowDown, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import ScrollReveal from '@/components/ScrollReveal';
import SectionLabel from '@/components/SectionLabel';
import PageTransition from '@/components/PageTransition';
import { useSettings } from '@/hooks/useSettings';

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
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroSlides, setHeroSlides] = useState([]);
  const [studioVideos, setStudioVideos] = useState([]);
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
    studioClient.entities.HeroSlide.list('sortOrder', 50).then(data => {
      setHeroSlides(data.filter(slide => slide.active !== false));
    }).catch(() => {});
    studioClient.entities.Video.list('-created_date', 3).then(setStudioVideos).catch(() => {});
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

  const fallbackSlide = {
    id: 'fallback',
    eyebrow: 'Fine Art Studio',
    title: 'Reigns',
    accentTitle: 'Atelier',
    subtitle: settings.hero_subtitle || 'Where imagination bleeds onto canvas. Fine art portraits, digital masterpieces, and bespoke commissions crafted with devotion.',
    imageUrl: settings.hero_image_1 || '/brand/reigns-atelier-logo.jpg',
    primaryLabel: 'View Gallery',
    primaryLink: '/gallery',
    secondaryLabel: 'Request Commission',
    secondaryLink: '/commission',
  };
  const slides = heroSlides.length ? heroSlides : [fallbackSlide];
  const activeSlide = slides[heroIndex % slides.length] || fallbackSlide;

  useEffect(() => {
    const seconds = Math.max(4, Number(settings.hero_slide_seconds) || 7);
    const t = setInterval(() => setHeroIndex(i => (i + 1) % slides.length), seconds * 1000);
    return () => clearInterval(t);
  }, [slides.length, settings.hero_slide_seconds]);

  return (
    <PageTransition>
      {/* -- HERO -- */}
      <section ref={heroRef} className="relative h-screen min-h-[700px] flex items-center overflow-hidden">
        {/* Background images */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSlide.id || heroIndex}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
            style={{ y: heroY }}
          >
            <img
              src={activeSlide.imageUrl}
              alt={activeSlide.title}
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
              <span className="font-tight text-xs uppercase tracking-[0.35em] text-brass/70">{activeSlide.eyebrow || 'Fine Art Studio'}</span>
            </div>
          </motion.div>

          <div className="overflow-hidden mb-2">
            <motion.h1
              key={`${activeSlide.id}-title`}
              className="font-display text-6xl md:text-8xl lg:text-[112px] leading-[0.9] text-ivory"
              initial={{ y: 120, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 1, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeSlide.title}
            </motion.h1>
          </div>
          <div className="overflow-hidden mb-8">
            <motion.h1
              key={`${activeSlide.id}-accent`}
              className="font-display text-6xl md:text-8xl lg:text-[112px] leading-[0.9] italic text-brass"
              initial={{ y: 120, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.65, duration: 1, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeSlide.accentTitle}
            </motion.h1>
          </div>

          <motion.p
            key={`${activeSlide.id}-subtitle`}
            className="text-ivory/50 text-lg md:text-xl max-w-lg leading-relaxed mb-10 font-light"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.8 }}
          >
            {activeSlide.subtitle}
          </motion.p>

          <motion.div
            className="flex flex-wrap gap-4"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 0.8 }}
          >
            <Link to={activeSlide.primaryLink || '/gallery'}
              className="flex items-center gap-2 bg-brass text-obsidian px-8 py-4 font-tight text-sm tracking-widest uppercase hover:bg-brass-light transition-all duration-300 group"
            >
              {activeSlide.primaryLabel || 'View Gallery'}
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link to={activeSlide.secondaryLink || '/commission'}
              className="flex items-center gap-2 border border-ivory/20 text-ivory/80 px-8 py-4 font-tight text-sm tracking-widest uppercase hover:border-brass/40 hover:text-brass transition-all duration-300"
            >
              {activeSlide.secondaryLabel || 'Request Commission'}
            </Link>
          </motion.div>
        </motion.div>

        {/* Hero dots */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {slides.map((slide, i) => (
            <button key={slide.id || i} onClick={() => setHeroIndex(i)}
              aria-label={`Show banner ${i + 1}: ${slide.title}`}
              className={`h-1 transition-all duration-500 ${i === heroIndex % slides.length ? 'w-12 bg-brass' : 'w-6 bg-ivory/25 hover:bg-ivory/50'}`}
            />
          ))}
        </div>

        {slides.length > 1 && (
          <div className="absolute bottom-8 left-6 lg:left-12 z-20 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHeroIndex(index => (index - 1 + slides.length) % slides.length)}
              className="w-11 h-11 border border-ivory/20 bg-obsidian/30 backdrop-blur-sm text-ivory/70 hover:text-brass hover:border-brass/50 transition-colors flex items-center justify-center"
              aria-label="Previous banner"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => setHeroIndex(index => (index + 1) % slides.length)}
              className="w-11 h-11 border border-ivory/20 bg-obsidian/30 backdrop-blur-sm text-ivory/70 hover:text-brass hover:border-brass/50 transition-colors flex items-center justify-center"
              aria-label="Next banner"
            >
              <ChevronRight size={18} />
            </button>
            <span className="ml-2 font-tight text-[10px] tracking-[0.25em] text-ivory/45">
              {String((heroIndex % slides.length) + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
            </span>
          </div>
        )}

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

      <section className="border-y border-brass/10 bg-carbon/60 overflow-hidden py-4" aria-label="Studio disciplines">
        <motion.div
          className="flex w-max items-center gap-8 whitespace-nowrap font-tight text-[10px] md:text-xs uppercase tracking-[0.35em] text-brass/60"
          animate={{ x: ['0%', '-50%'] }}
          transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
        >
          {[...Array(2)].flatMap((_, copy) => [
            'Portraiture', 'Graphite Studies', 'Fine Art', 'Sketchbook Stories',
            'Commissioned Work', 'Studio Films', 'Original Art',
          ].map(item => (
            <span key={`${copy}-${item}`} className="flex items-center gap-8">
              {item}<span className="w-1 h-1 rounded-full bg-brass/60" />
            </span>
          )))}
        </motion.div>
      </section>

      {studioVideos.length > 0 && (
        <section className="py-28 relative overflow-hidden bg-carbon/30">
          <motion.div
            className="absolute -right-32 top-12 w-96 h-96 border border-brass/10 rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 45, repeat: Infinity, ease: 'linear' }}
          />
          <div className="max-w-7xl mx-auto px-6 lg:px-12 relative">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-12">
              <div>
                <ScrollReveal><SectionLabel>Inside the Atelier</SectionLabel></ScrollReveal>
                <ScrollReveal delay={0.1}>
                  <h2 className="font-display text-4xl md:text-6xl text-ivory mt-2">Watch the work <em className="text-brass">take shape</em></h2>
                </ScrollReveal>
              </div>
              <Link to="/videos" className="inline-flex items-center gap-2 text-brass font-tight text-sm tracking-wide hover:gap-4 transition-all">
                View All Films <ArrowRight size={16} />
              </Link>
            </div>

            <div className="grid md:grid-cols-12 gap-5">
              {studioVideos.map((video, index) => (
                <ScrollReveal
                  key={video.id}
                  delay={index * 0.12}
                  className={index === 0 ? 'md:col-span-7' : 'md:col-span-5'}
                >
                  <Link to="/videos" className="group relative block overflow-hidden border border-brass/10 bg-obsidian aspect-video">
                    <img
                      src={video.thumbnailUrl}
                      alt={video.title}
                      className="w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0 group-hover:scale-105 transition-all duration-700"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/20 to-transparent" />
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center"
                      whileHover={{ scale: 1.08 }}
                    >
                      <span className="w-16 h-16 rounded-full border border-brass/60 bg-obsidian/50 backdrop-blur flex items-center justify-center shadow-[0_0_40px_rgba(201,169,110,0.15)]">
                        <Play size={22} className="text-brass ml-1" fill="currentColor" />
                      </span>
                    </motion.div>
                    <div className="absolute left-5 right-5 bottom-5">
                      <p className="text-[10px] uppercase tracking-[0.25em] text-brass/80 mb-1">{video.category}</p>
                      <h3 className="font-display text-xl md:text-2xl text-ivory">{video.title}</h3>
                    </div>
                  </Link>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      )}

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
