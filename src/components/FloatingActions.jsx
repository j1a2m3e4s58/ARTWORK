import { useEffect, useState } from 'react';
import { ChevronUp } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa6';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useSettings } from '@/hooks/useSettings';

export default function FloatingActions() {
  const settings = useSettings();
  const location = useLocation();
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const update = () => setShowTop(window.scrollY > 500);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  const cleanNumber = String(settings.whatsapp_number || '').replace(/[^\d]/g, '');
  const message = settings.whatsapp_message || "Hello, I'm interested in a commission from Reigns Atelier";
  const whatsappHref = cleanNumber
    ? `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`
    : '/contact';
  return (
    <div className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-4 z-30 flex flex-col items-end gap-2 md:bottom-8 md:right-8">
      <AnimatePresence>
        {showTop && location.pathname !== '/commission' && (
          <motion.button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-brass/30 bg-obsidian/90 text-brass shadow-lg backdrop-blur-md hover:bg-brass hover:text-obsidian"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            aria-label="Back to top">
            <ChevronUp size={18} />
          </motion.button>
        )}
      </AnimatePresence>
      <a
        href={whatsappHref}
        target={cleanNumber ? '_blank' : undefined}
        rel={cleanNumber ? 'noopener noreferrer' : undefined}
        className="flex h-12 min-w-12 items-center justify-center gap-2 rounded-full bg-[#25D366] px-3 text-white shadow-lg transition-transform hover:scale-105 hover:bg-[#20BA5A] focus-visible:ring-2 focus-visible:ring-white md:w-28"
        aria-label={cleanNumber ? 'Contact Reigns Atelier on WhatsApp' : 'Open the contact page'}
        title={cleanNumber ? 'WhatsApp' : 'Contact Reigns Atelier'}
      >
        <FaWhatsapp className="h-[22px] w-[22px] shrink-0" aria-hidden="true" />
        <span className="hidden text-xs font-medium md:inline">WhatsApp</span>
      </a>
    </div>
  );
}
