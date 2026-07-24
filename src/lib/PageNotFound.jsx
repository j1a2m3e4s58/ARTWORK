import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

export default function PageNotFound() {
  return (
    <div className="min-h-screen bg-obsidian flex items-center justify-center px-6 relative">
      <div className="noise-overlay absolute inset-0 opacity-30 pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 40%, #3D2B52 0%, transparent 60%)' }} />

      <motion.div
        className="text-center relative z-10"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-8 h-px bg-brass" />
          <span className="font-tight text-xs uppercase tracking-[0.35em] text-brass/70">404</span>
          <div className="w-8 h-px bg-brass" />
        </div>

        <h1 className="font-display text-7xl md:text-9xl text-ivory/10 leading-none mb-4">Lost</h1>
        <p className="font-display text-2xl md:text-3xl text-ivory italic mb-4">
          This canvas is <em className="text-brass">empty</em>
        </p>
        <p className="text-ivory/40 font-tight text-sm max-w-sm mx-auto mb-10 leading-relaxed">
          The page you're looking for doesn't exist — but there's plenty of art waiting to be discovered.
        </p>

        <Link
          to="/"
          className="inline-flex items-center gap-2 bg-brass text-obsidian px-8 py-4 font-tight text-sm tracking-widest uppercase hover:bg-brass-light transition-all duration-300 group"
        >
          Return Home
          <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
        </Link>

        <div className="mt-12 flex justify-center gap-6">
          <Link to="/gallery" className="text-ivory/30 hover:text-brass font-tight text-xs uppercase tracking-widest transition-colors">Gallery</Link>
          <Link to="/commission" className="text-ivory/30 hover:text-brass font-tight text-xs uppercase tracking-widest transition-colors">Commission</Link>
          <Link to="/shop" className="text-ivory/30 hover:text-brass font-tight text-xs uppercase tracking-widest transition-colors">Shop</Link>
        </div>
      </motion.div>
    </div>
  );
}