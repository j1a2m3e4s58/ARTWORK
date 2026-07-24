import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Shield, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AdminGate({ open, onClose }) {
  const navigate = useNavigate();
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-obsidian/90 backdrop-blur-xl" onClick={onClose} />
          <motion.div className="relative z-10 w-full max-w-sm glass-panel border border-brass/20 p-8"
            initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }}>
            <button onClick={onClose} className="absolute right-5 top-5 text-ivory/35 hover:text-brass" aria-label="Close"><X size={17} /></button>
            <div className="mb-6 flex h-12 w-12 items-center justify-center border border-brass/30"><Shield className="text-brass" size={20} /></div>
            <h2 className="font-display text-2xl text-ivory">Administrator sign in</h2>
            <p className="my-4 text-sm leading-relaxed text-ivory/45">Admin access now uses the secure account system and server-side role verification.</p>
            <button onClick={() => { onClose(); navigate('/login?redirect=/admin'); }}
              className="flex w-full items-center justify-center gap-2 bg-brass py-3 text-sm uppercase tracking-wider text-obsidian">
              Continue <ArrowRight size={15} />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
