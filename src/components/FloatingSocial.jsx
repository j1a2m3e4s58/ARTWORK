import { motion } from 'framer-motion';
import { Facebook, Instagram, Linkedin, Music2, Pin, Twitter, Youtube } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';

export default function FloatingSocial() {
  const settings = useSettings();
  const socials = [
    { icon: Instagram, href: settings.instagram_url, label: 'Instagram' },
    { icon: Twitter, href: settings.twitter_url, label: 'Twitter' },
    { icon: Youtube, href: settings.youtube_url, label: 'YouTube' },
    { icon: Music2, href: settings.tiktok_url, label: 'TikTok' },
    { icon: Facebook, href: settings.facebook_url, label: 'Facebook' },
    { icon: Linkedin, href: settings.linkedin_url, label: 'LinkedIn' },
    { icon: Pin, href: settings.pinterest_url, label: 'Pinterest' },
  ].filter(item => item.href);
  if (!socials.length) return null;
  return (
    <motion.div className="fixed left-6 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-center gap-4 lg:flex"
      initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8, duration: 0.8 }}>
      <div className="h-16 w-px bg-brass/20" />
      {socials.map(({ icon: Icon, href, label }) => (
        <a key={label} href={href} target="_blank" rel="noopener noreferrer" title={label}
          className="text-ivory/30 transition-all duration-300 hover:scale-110 hover:text-brass"><Icon size={16} /></a>
      ))}
      <div className="h-16 w-px bg-brass/20" />
    </motion.div>
  );
}
