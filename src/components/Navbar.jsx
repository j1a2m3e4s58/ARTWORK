import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ArrowUpRight, UserRound, ShieldCheck } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import InstallAppButton from './InstallAppButton';
import { useAuth } from '@/lib/AuthContext';

const navLinks = [
  { label: 'Home', path: '/' },
  { label: 'Gallery', path: '/gallery' },
  { label: 'Commission', path: '/commission' },
  { label: 'Available Works', path: '/shop', settingKey: 'show_shop' },
  { label: 'About', path: '/about' },
  { label: 'Contact', path: '/contact' },
];
const secondaryLinks = [
  { label: 'Videos', path: '/videos', settingKey: 'show_videos' },
  { label: 'Journal', path: '/blog', settingKey: 'show_blog' },
];

export default function Navbar() {
  const settings = useSettings();
  const { user, logout } = useAuth();
  const isVisible = link => {
    const key = link.settingKey || `show_${link.label.toLowerCase()}`;
    if (['show_videos', 'show_blog'].includes(key)) return settings[key] === 'true';
    return settings[key] !== 'false';
  };
  const visiblePrimaryLinks = navLinks.filter(isVisible);
  const visibleSecondaryLinks = secondaryLinks.filter(isVisible);
  const visibleLinks = [...visiblePrimaryLinks, ...visibleSecondaryLinks];
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const menuButtonRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => setMenuOpen(false), [location]);
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  return (
    <>
      <motion.nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled ? 'glass-dark border-b border-brass/10' : 'bg-transparent'
        }`}
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-12 flex items-center justify-between h-20">
          <div className="flex flex-col leading-none group select-none">
            <Link
              to="/"
              className="flex items-center gap-3"
              aria-label="Reigns Atelier home"
            >
              <img src="/brand/reigns-app-icon-192.png" alt="" draggable="false" className="h-11 w-11 rounded-full border border-brass/20 object-cover" />
              <span>
                <span className="font-display text-xl text-ivory tracking-wide group-hover:text-brass transition-colors duration-300 block">{settings.site_logo_primary || 'Reigns'}</span>
                <span className="font-tight text-[10px] uppercase tracking-[0.35em] text-brass/70 block">{settings.site_logo_secondary || 'Atelier'}</span>
              </span>
            </Link>
          </div>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-5 xl:gap-7">
            {visiblePrimaryLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`font-tight text-sm tracking-wide transition-all duration-300 relative group ${
                  location.pathname === link.path ? 'text-brass' : 'text-ivory/60 hover:text-ivory'
                }`}
              >
                {link.label}
                <span className={`absolute -bottom-1 left-0 h-px bg-brass transition-all duration-300 ${
                  location.pathname === link.path ? 'w-full' : 'w-0 group-hover:w-full'
                }`} />
              </Link>
            ))}
            {visibleSecondaryLinks.length > 0 && (
              <details className="group relative">
                <summary className="cursor-pointer list-none font-tight text-sm tracking-wide text-ivory/60 hover:text-ivory">Explore</summary>
                <div className="absolute left-1/2 top-8 min-w-40 -translate-x-1/2 border border-brass/15 bg-carbon/95 p-2 shadow-2xl backdrop-blur-xl">
                  {visibleSecondaryLinks.map(link => <Link key={link.path} to={link.path} className="block px-3 py-2 text-sm text-ivory/55 hover:bg-brass/10 hover:text-brass">{link.label}</Link>)}
                </div>
              </details>
            )}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-4">
            {!user ? (
              <div className="hidden lg:flex items-center gap-3">
                <Link to="/login" className="font-tight text-xs text-ivory/55 hover:text-brass">Log in</Link>
                <Link to="/register" className="font-tight text-xs border border-brass/30 px-3 py-2 text-brass hover:bg-brass/10">Sign up</Link>
              </div>
            ) : (
              <div className="hidden items-center gap-3 lg:flex">
                {['admin', 'editor', 'support'].includes(user.role) && <Link to="/admin" className="flex items-center gap-1.5 font-tight text-xs text-brass/80 hover:text-brass"><ShieldCheck size={15} /> Admin</Link>}
                <Link to="/account" className="flex items-center gap-1.5 font-tight text-xs text-ivory/55 hover:text-brass"><UserRound size={15} /> Account</Link>
                <button onClick={() => logout()} className="font-tight text-xs text-ivory/45 hover:text-brass">Sign out</button>
              </div>
            )}
            <Link
              to="/commission"
              className="hidden xl:block font-tight text-sm px-5 py-2 border border-brass/40 text-brass hover:bg-brass hover:text-obsidian transition-all duration-300 tracking-wide"
            >
              Commission
            </Link>
            {/* Hamburger */}
            <button
              ref={menuButtonRef}
              className="flex h-11 w-11 items-center justify-center text-ivory/70 hover:text-brass transition-colors lg:hidden"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
              aria-controls="mobile-site-menu"
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </motion.nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id="mobile-site-menu"
            className="fixed inset-0 z-[60] overflow-y-auto bg-black/55 px-4 pb-24 pt-24 backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setMenuOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Site navigation"
              className="relative mx-auto max-h-[calc(100dvh-7rem)] max-w-md overflow-y-auto rounded-2xl border border-brass/15 bg-carbon/95 p-5 shadow-2xl shadow-black/60"
              initial={{ opacity: 0, y: -18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              onClick={e => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between border-b border-ivory/10 pb-4">
                <div>
                  <p className="font-tight text-[10px] uppercase tracking-[0.28em] text-brass/70">Explore</p>
                  <p className="mt-1 font-display text-xl text-ivory">{settings.site_name || 'Reigns Atelier'}</p>
                </div>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-ivory/10 text-ivory/60 transition-colors hover:border-brass/40 hover:text-brass"
                  aria-label="Close menu"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2">
                {visibleLinks.map((link, i) => (
                  <motion.div
                    key={link.path}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.035 + 0.05 }}
                  >
                    <Link
                      to={link.path}
                      className={`flex min-h-14 items-center justify-between rounded-xl border px-4 font-tight text-sm tracking-wide transition-all ${
                        location.pathname === link.path
                          ? 'border-brass/30 bg-brass/10 text-brass'
                          : 'border-ivory/[0.06] bg-ivory/[0.025] text-ivory/65 hover:border-brass/20 hover:text-ivory'
                      }`}
                    >
                      {link.label}
                      <ArrowUpRight size={14} className="opacity-45" />
                    </Link>
                  </motion.div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-center gap-6 border-t border-ivory/10 pt-4">
                {settings.instagram_url && <a href={settings.instagram_url} target="_blank" rel="noopener noreferrer" className="font-tight text-[10px] uppercase tracking-widest text-ivory/35 hover:text-brass">Instagram</a>}
                {settings.twitter_url && <a href={settings.twitter_url} target="_blank" rel="noopener noreferrer" className="font-tight text-[10px] uppercase tracking-widest text-ivory/35 hover:text-brass">Twitter</a>}
                {settings.youtube_url && <a href={settings.youtube_url} target="_blank" rel="noopener noreferrer" className="font-tight text-[10px] uppercase tracking-widest text-ivory/35 hover:text-brass">YouTube</a>}
              </div>
              <div className="mt-4">
                <InstallAppButton />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {!user ? (
                  <>
                    <Link to="/login" className="rounded-xl border border-ivory/10 px-3 py-2 text-center text-xs text-ivory/60">Log in</Link>
                    <Link to="/register" className="rounded-xl bg-brass px-3 py-2 text-center text-xs text-obsidian">Sign up</Link>
                  </>
                ) : (
                  <>
                    <Link to="/account" className="rounded-xl border border-brass/20 px-3 py-2 text-center text-xs text-brass">My account</Link>
                    <button onClick={() => logout()} className="rounded-xl border border-ivory/10 px-3 py-2 text-xs text-ivory/60">Sign out</button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
