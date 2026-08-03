import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { Play, X, Eye, Clock, Clapperboard, Send } from 'lucide-react';
import ResourceFeedback from '@/components/ResourceFeedback';
import ScrollReveal from '@/components/ScrollReveal';
import SectionLabel from '@/components/SectionLabel';
import PageTransition from '@/components/PageTransition';
import { usePageContent } from '@/hooks/usePageContent';
import { useCollectionResource } from '@/hooks/useCollectionResource';
import { imageSrcSet, imageVariant } from '@/lib/media';
import { useAuth } from '@/lib/AuthContext';
import { Link } from 'react-router-dom';
import { studioClient } from '@/api/studioClient';

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
    if (url.hostname.includes('tiktok.com')) {
      const id = url.pathname.match(/\/video\/(\d+)/)?.[1];
      return id ? `https://www.tiktok.com/player/v1/${id}?autoplay=1` : null;
    }
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

function FilmCover({ video, className = '' }) {
  if (video.thumbnailUrl) {
    return (
      <img
        src={imageVariant(video.thumbnailUrl, 1200)}
        srcSet={imageSrcSet(video.thumbnailUrl)}
        sizes="(min-width: 1280px) 1200px, 100vw"
        alt={video.title}
        className={className}
      />
    );
  }
  return (
    <div className={`flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(201,169,110,0.16),transparent_42%),linear-gradient(135deg,#191817,#080808)] ${className}`} aria-hidden="true">
      <div className="text-center">
        <Play size={34} className="mx-auto text-brass/60" />
        <span className="mt-3 block text-[10px] uppercase tracking-[0.3em] text-brass/45">Reigns Atelier Film</span>
      </div>
    </div>
  );
}

export default function Videos() {
  const page = usePageContent('Videos');
  const { user } = useAuth();
  const { data: dbVideos, loading, error, retry } = useCollectionResource('Video');
  const [activeCategory, setActiveCategory] = useState('All');
  const [playing, setPlaying] = useState(null);
  const [requestOpen, setRequestOpen] = useState(false);
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
          <ScrollReveal><SectionLabel>{page.videos_label || 'Atelier Film Archive'}</SectionLabel></ScrollReveal>
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
          <div className="mt-7 flex flex-wrap gap-3"><button onClick={()=>setRequestOpen(true)} className="inline-flex min-h-12 items-center gap-2 bg-brass px-5 text-xs uppercase tracking-widest text-obsidian"><Clapperboard size={16}/> Request a Studio Lesson</button>{page.videos_youtube_url&&<a href={page.videos_youtube_url} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center border border-brass/30 px-5 text-xs uppercase tracking-widest text-brass">YouTube channel</a>}{page.videos_tiktok_url&&<a href={page.videos_tiktok_url} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center border border-brass/30 px-5 text-xs uppercase tracking-widest text-brass">TikTok studio</a>}</div>
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
          {!loading && !error && !featured && ['admin', 'editor'].includes(user?.role) && (
            <div className="-mt-8 mb-10 text-center">
              <Link to="/admin?section=videos" className="inline-flex border border-brass/30 px-4 py-2 text-xs uppercase tracking-widest text-brass hover:bg-brass/10">Add a studio film in Admin</Link>
            </div>
          )}
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
                <FilmCover video={featured} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105 grayscale-[20%] group-hover:grayscale-0" />
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
                    <FilmCover video={video} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105 grayscale-[25%] group-hover:grayscale-0" />
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
              <div className="mt-4 border border-brass/20 bg-carbon p-4"><p className="font-display text-xl text-ivory">{page.videos_follow_title || 'Continue the creative journey'}</p><p className="mt-1 text-sm text-ivory/50">{page.videos_follow_body || 'Follow Reigns Atelier on YouTube and TikTok for new studio films, drawing lessons, and process stories.'}</p><div className="mt-3 flex flex-wrap gap-2">{page.videos_youtube_url&&<a href={page.videos_youtube_url} target="_blank" rel="noreferrer" className="bg-brass px-4 py-2 text-xs text-obsidian">Subscribe on YouTube</a>}{page.videos_tiktok_url&&<a href={page.videos_tiktok_url} target="_blank" rel="noreferrer" className="border border-brass/30 px-4 py-2 text-xs text-brass">Follow on TikTok</a>}</div></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {requestOpen&&<FilmRequestModal user={user} onClose={()=>setRequestOpen(false)}/>}
    </PageTransition>
  );
}

function FilmRequestModal({user,onClose}){const [form,setForm]=useState({topic:'',details:'',skillLevel:'Beginner',preferredFormat:'Short lesson'});const [notice,setNotice]=useState('');const submit=async e=>{e.preventDefault();try{await studioClient.entities.FilmRequest.create(form);setNotice('Your lesson idea is with the artist. Follow the private reply in My Account.')}catch(error){setNotice(error.message)}};return <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3"><button className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose}/><section className="relative w-full max-w-xl border border-brass/25 bg-carbon p-5 sm:p-8"><button onClick={onClose} className="absolute right-3 top-3 h-11 w-11 text-ivory/50"><X/></button><p className="text-[10px] uppercase tracking-[.3em] text-brass">Made for your practice</p><h2 className="mt-2 font-display text-4xl text-ivory">Request a Studio Lesson</h2><p className="mt-3 text-sm leading-6 text-ivory/50">Ask for a focused film on shading, anatomy, materials, colour, or another art technique.</p>{!user?<Link to="/login?redirect=/videos" className="mt-6 inline-flex bg-brass px-5 py-3 text-xs text-obsidian">Sign in to request</Link>:<form onSubmit={submit} className="mt-6 space-y-4"><Field label="Lesson topic" value={form.topic} onChange={e=>setForm({...form,topic:e.target.value})}/><label className="block text-xs uppercase tracking-wider text-ivory/45">What should the artist demonstrate?<textarea required minLength={10} rows={5} value={form.details} onChange={e=>setForm({...form,details:e.target.value})} className="mt-2 w-full border border-brass/20 bg-obsidian p-3 text-sm text-ivory"/></label><div className="grid gap-4 sm:grid-cols-2"><Field label="Your skill level" value={form.skillLevel} onChange={e=>setForm({...form,skillLevel:e.target.value})}/><Field label="Preferred format" value={form.preferredFormat} onChange={e=>setForm({...form,preferredFormat:e.target.value})}/></div><button className="flex min-h-12 w-full items-center justify-center gap-2 bg-brass text-xs uppercase tracking-widest text-obsidian"><Send size={15}/>Send lesson request</button>{notice&&<p className="border border-brass/20 p-3 text-sm text-ivory/60">{notice}</p>}</form>}</section></div>}
function Field({label,...props}){return <label className="block text-xs uppercase tracking-wider text-ivory/45">{label}<input required {...props} className="mt-2 min-h-11 w-full border border-brass/20 bg-obsidian px-3 text-sm normal-case text-ivory"/></label>}
