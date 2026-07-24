import { useEffect, useState } from 'react';
import { ChevronUp, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettings } from '@/hooks/useSettings';

export default function FloatingActions() {
  const settings = useSettings();
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const update = () => setShowTop(window.scrollY > 500);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  const cleanNumber = String(settings.whatsapp_number || '').replace(/[^\d]/g, '');
  const message = settings.whatsapp_message || "Hello, I'm interested in a commission from Reigns Atelier";
  return (
    <div className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-4 z-30 flex flex-col items-end gap-2 md:bottom-8 md:right-8">
      <AnimatePresence>
        {showTop && (
          <motion.button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-brass/30 bg-obsidian/90 text-brass shadow-lg backdrop-blur-md hover:bg-brass hover:text-obsidian"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            aria-label="Back to top">
            <ChevronUp size={18} />
          </motion.button>
        )}
      </AnimatePresence>
      {cleanNumber && (
        <a href={`https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#25D366] px-3 text-white shadow-lg hover:bg-[#20BA5A]"
          aria-label="Contact Reigns Atelier on WhatsApp">
          <MessageCircle size={19} /><span className="hidden text-xs font-medium md:inline">WhatsApp</span>
        </a>
      )}
    </div>
  );
}
