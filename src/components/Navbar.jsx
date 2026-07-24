import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ShoppingBag } from 'lucide-react';
import AdminGate from './AdminGate';
import { useSettings } from '@/hooks/useSettings';

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
            <Link to="/" onClick={e => e.stopPropagation()}>
              <span className="font-display text-xl text-ivory tracking-wide group-hover:text-brass transition-colors duration-300 block">Reigns</span>
              <span className="font-tight text-[10px] uppercase tracking-[0.35em] text-brass/70 block">Atelier</span>
            </Link>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
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
            className="fixed inset-0 z-40 glass-dark flex flex-col items-center justify-center"
            initial={{ opacity: 0, clipPath: 'circle(0% at top right)' }}
            animate={{ opacity: 1, clipPath: 'circle(150% at top right)' }}
            exit={{ opacity: 0, clipPath: 'circle(0% at top right)' }}
            transition={{ duration: 0.5, ease: [0.76, 0, 0.24, 1] }}
          >
            <div className="noise-overlay absolute inset-0" />
            <div className="flex flex-col items-center gap-8">
              {navLinks.map((link, i) => (
                <motion.div
                  key={link.path}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 + 0.2 }}
                >
                  <Link
                    to={link.path}
                    className={`font-display text-3xl transition-colors duration-300 ${
                      location.pathname === link.path ? 'text-brass' : 'text-ivory/80 hover:text-brass'
                    }`}
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
            </div>
            <motion.div
              className="absolute bottom-12 flex gap-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              <a href={settings.instagram_url || 'https://instagram.com'} target="_blank" rel="noopener noreferrer" className="text-ivory/40 hover:text-brass transition-colors font-tight text-xs tracking-widest uppercase">Instagram</a>
              <a href={settings.twitter_url || 'https://twitter.com'} target="_blank" rel="noopener noreferrer" className="text-ivory/40 hover:text-brass transition-colors font-tight text-xs tracking-widest uppercase">Twitter</a>
              <a href={settings.youtube_url || 'https://youtube.com'} target="_blank" rel="noopener noreferrer" className="text-ivory/40 hover:text-brass transition-colors font-tight text-xs tracking-widest uppercase">YouTube</a>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}