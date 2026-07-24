import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ShoppingBag, ArrowUpRight, UserRound } from 'lucide-react';
import AdminGate from './AdminGate';
import { useSettings } from '@/hooks/useSettings';
import InstallAppButton from './InstallAppButton';
import { useAuth } from '@/lib/AuthContext';

const navLinks = [
  { label: 'Home', path: '/' },
  { label: 'Gallery', path: '/gallery' },
  { label: 'Commission', path: '/commission' },
  { label: 'Shop', path: '/shop' },
  { label: 'Videos', path: '/videos' },
  { label: 'About', path: '/about' },
  { label: 'Blog', path: '/blog' },
  { label: 'Contact', path: '/contact' },
];

export default function Navbar() {
  const settings = useSettings();
  const { user, logout } = useAuth();
  const visibleLinks = navLinks.filter(link => {
    const key = `show_${link.label.toLowerCase()}`;
    if (['Videos', 'Blog'].includes(link.label)) return settings[key] === 'true';
    return settings[key] !== 'false';
  });
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminGateOpen, setAdminGateOpen] = useState(false);
  const location = useLocation();
  const longPressTimer = useRef(null);

  const handleLogoPointerDown = () => {
    longPressTimer.current = setTimeout(() => setAdminGateOpen(true), 1200);
  };
  const handleLogoPointerUp = () => {
    clearTimeout(longPressTimer.current);
  };

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => setMenuOpen(false), [location]);

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
          {/* Logo — long-press to open admin gate */}
          <div
            className="flex flex-col leading-none group cursor-pointer select-none"
            onPointerDown={handleLogoPointerDown}
            onPointerUp={handleLogoPointerUp}
            onPointerLeave={handleLogoPointerUp}
            onContextMenu={e => e.preventDefault()}
          >
            <Link to="/" onClick={e => e.stopPropagation()} className="flex items-center gap-3">
              <img src="/brand/reigns-app-icon-192.png" alt="" className="h-11 w-11 rounded-full border border-brass/20 object-cover" />
              <span>
                <span className="font-display text-xl text-ivory tracking-wide group-hover:text-brass transition-colors duration-300 block">{settings.site_logo_primary || 'Reigns'}</span>
                <span className="font-tight text-[10px] uppercase tracking-[0.35em] text-brass/70 block">{settings.site_logo_secondary || 'Atelier'}</span>
              </span>
            </Link>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            {visibleLinks.map((link) => (
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
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-4">
            {!user ? (
              <div className="hidden md:flex items-center gap-3">
                <Link to="/login" className="font-tight text-xs text-ivory/55 hover:text-brass">Log in</Link>
                <Link to="/register" className="font-tight text-xs border border-brass/30 px-3 py-2 text-brass hover:bg-brass/10">Sign up</Link>
              </div>
            ) : (
              <div className="hidden items-center gap-3 md:flex">
                <Link to={user.role === 'admin' ? '/admin' : '/account'} className="flex items-center gap-1.5 font-tight text-xs text-ivory/55 hover:text-brass"><UserRound size={15} /> Account</Link>
                <button onClick={() => logout()} className="font-tight text-xs text-ivory/45 hover:text-brass">Sign out</button>
              </div>
            )}
            <Link to="/shop" className="hidden md:flex items-center gap-2 text-ivory/60 hover:text-brass transition-colors duration-300">
              <ShoppingBag size={18} />
            </Link>
            <Link
              to="/commission"
              className="hidden md:block font-tight text-sm px-5 py-2 border border-brass/40 text-brass hover:bg-brass hover:text-obsidian transition-all duration-300 tracking-wide"
            >
              Commission
            </Link>
            {/* Hamburger */}
            <button
              className="md:hidden text-ivory/70 hover:text-brass transition-colors"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </motion.nav>

      {/* Admin Gate */}
      <AdminGate open={adminGateOpen} onClose={() => setAdminGateOpen(false)} />

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="fixed inset-0 z-40 bg-black/55 px-4 pt-24 backdrop-blur-sm md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setMenuOpen(false)}
          >
            <motion.div
              className="relative mx-auto max-w-md overflow-hidden rounded-2xl border border-brass/15 bg-carbon/95 p-5 shadow-2xl shadow-black/60"
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

              <div className="grid grid-cols-2 gap-2">
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
                    <Link to={user.role === 'admin' ? '/admin' : '/account'} className="rounded-xl border border-brass/20 px-3 py-2 text-center text-xs text-brass">My account</Link>
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
