import { motion } from 'framer-motion';
import { Instagram, Twitter, Youtube } from 'lucide-react';

const socials = [
  { icon: Instagram, href: 'https://instagram.com', label: 'Instagram' },
  { icon: Twitter, href: 'https://twitter.com', label: 'Twitter' },
  { icon: Youtube, href: 'https://youtube.com', label: 'YouTube' },
];

export default function FloatingSocial() {
  return (
    <motion.div
      className="fixed left-6 top-1/2 -translate-y-1/2 z-30 hidden lg:flex flex-col items-center gap-4"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 2, duration: 0.8 }}
    >
      <div className="w-px h-16 bg-brass/20" />
      {socials.map(({ icon: Icon, href, label }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={label}
          className="text-ivory/30 hover:text-brass transition-all duration-300 hover:scale-110"
        >
          <Icon size={16} />
        </a>
      ))}
      <div className="w-px h-16 bg-brass/20" />
    </motion.div>
  );
}