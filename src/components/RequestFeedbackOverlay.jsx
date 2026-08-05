import { AnimatePresence, motion } from 'framer-motion';
import { Check, Mail, MessageCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function RequestFeedbackOverlay() {
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    let timer;
    const show = event => {
      clearTimeout(timer);
      setFeedback(event.detail || {});
      timer = setTimeout(() => setFeedback(null), 5200);
    };
    window.addEventListener('atelier:request-feedback', show);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('atelier:request-feedback', show);
    };
  }, []);

  return (
    <AnimatePresence>
      {feedback && (
        <motion.div
          className="fixed inset-0 z-[250] flex items-center justify-center bg-obsidian/72 p-4 backdrop-blur-md"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={event => event.target === event.currentTarget && setFeedback(null)}
          role="dialog" aria-modal="true" aria-live="polite"
        >
          <motion.section
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="relative w-full max-w-md overflow-hidden border border-brass/35 bg-carbon p-6 shadow-2xl sm:p-8"
          >
            <button type="button" onClick={() => setFeedback(null)} className="absolute right-4 top-4 grid h-10 w-10 place-items-center border border-brass/20 text-ivory/65" aria-label="Close confirmation"><X size={18} /></button>
            <motion.div initial={{ scale: 0.5, rotate: -15 }} animate={{ scale: 1, rotate: 0 }} className="grid h-14 w-14 place-items-center bg-green-400/15 text-green-300">
              <Check size={28} strokeWidth={1.8} />
            </motion.div>
            <p className="mt-6 text-[10px] uppercase tracking-[.28em] text-brass">Studio update</p>
            <h2 className="mt-2 pr-10 font-display text-3xl text-ivory">{feedback.title || 'Update completed'}</h2>
            <p className="mt-3 text-sm leading-6 text-ivory/60">{feedback.message}</p>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <div className="flex items-center gap-3 border border-brass/15 bg-obsidian/55 p-3 text-xs text-ivory/70"><MessageCircle size={17} className="text-brass" /> Message prepared</div>
              <div className="flex items-center gap-3 border border-brass/15 bg-obsidian/55 p-3 text-xs text-ivory/70"><Mail size={17} className="text-brass" /> Email prepared</div>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
