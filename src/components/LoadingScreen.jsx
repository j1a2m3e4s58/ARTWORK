import { useEffect } from 'react';
import { motion } from 'framer-motion';

export default function LoadingScreen({ onComplete }) {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, 650);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div className="fixed inset-0 z-[99999] flex items-center justify-center bg-obsidian"
      initial={{ opacity: 1 }} exit={{ opacity: 0 }} aria-label="Loading Reigns Atelier">
      <div className="text-center">
        <img src="/brand/reigns-app-icon-192.png" alt="" className="mx-auto h-20 w-20 rounded-full border border-brass/25 object-cover" />
        <p className="mt-5 font-tight text-xs uppercase tracking-[0.35em] text-brass/70">Reigns Atelier</p>
      </div>
    </motion.div>
  );
}
