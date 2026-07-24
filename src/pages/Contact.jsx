import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone, MapPin, Instagram, Twitter, Youtube, ArrowRight, Send, Loader2 } from 'lucide-react';
import ScrollReveal from '@/components/ScrollReveal';
import SectionLabel from '@/components/SectionLabel';
import PageTransition from '@/components/PageTransition';
import { useSettings } from '@/hooks/useSettings';
import { usePageContent } from '@/hooks/usePageContent';
import { studioClient } from '@/api/studioClient';
import { useAuth } from '@/lib/AuthContext';

const INSTAGRAM_PREVIEWS = [
  'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=300&q=80',
  'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=300&q=80',
  'https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=300&q=80',
  'https://images.unsplash.com/photo-1519764622345-23439dd774f7?w=300&q=80',
  'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=300&q=80',
  'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=300&q=80',
];

export default function Contact() {
  const settings = useSettings();
  const { user } = useAuth();
  const page = usePageContent('Contact');
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      window.location.assign('/login?redirect=/contact');
      return;
    }
    setSending(true);
    setError('');
    try {
      await studioClient.entities.Message.create({
        ...form,
        email: user.email,
        userId: user.id,
        status: 'unread',
      });
      setSent(true);
    } catch (submitError) {
      setError(submitError.message || 'Your message could not be sent. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-obsidian pt-28 pb-24">
        <div className="noise-overlay fixed inset-0 pointer-events-none opacity-30" />

        {/* Header */}
        <div className="max-w-7xl mx-auto px-6 lg:px-12 mb-20">
          <ScrollReveal><SectionLabel>{page.contact_eyebrow || 'Get in Touch'}</SectionLabel></ScrollReveal>
          <ScrollReveal delay={0.1}>
            <h1 className="font-display text-5xl md:text-7xl text-ivory mt-2">
              Let's <em className="text-brass">Connect</em>
            </h1>
          </ScrollReveal>
        </div>

        {/* Main grid */}
        <div className="max-w-7xl mx-auto px-6 lg:px-12 mb-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">

            {/* Contact form */}
            <ScrollReveal>
              {sent ? (
                <motion.div
                  className="flex flex-col items-start justify-center h-full gap-4 py-16"
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                >
                  <div className="w-16 h-16 border border-brass/30 flex items-center justify-center mb-4">
                    <Send className="text-brass" size={28} />
                  </div>
                  <h2 className="font-display text-3xl text-ivory">Message Sent</h2>
                  <p className="text-ivory/50">Thank you for reaching out. {page.contact_response_time || "I'll respond within 24–48 hours."}</p>
                  <button onClick={() => { setSent(false); setForm({ name: '', email: '', subject: '', message: '' }); }}
                    className="text-brass font-tight text-sm border-b border-brass/30 hover:border-brass transition-colors mt-4">
                    Send another message
                  </button>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <h2 className="font-display text-3xl text-ivory mb-8">{page.contact_form_title || 'Send a Message'}</h2>
                  {error && <p role="alert" className="border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <input placeholder="Your name" value={form.name} onChange={e => set('name', e.target.value)}
                      className="min-w-0 w-full bg-carbon border border-brass/15 text-ivory/80 px-5 py-3.5 placeholder:text-ivory/25 focus:outline-none focus:border-brass/40 transition-colors text-sm" required />
                    <input type="email" placeholder="Email address" value={form.email} onChange={e => set('email', e.target.value)}
                      className="min-w-0 w-full bg-carbon border border-brass/15 text-ivory/80 px-5 py-3.5 placeholder:text-ivory/25 focus:outline-none focus:border-brass/40 transition-colors text-sm" required />
                  </div>
                  <input placeholder="Subject" value={form.subject} onChange={e => set('subject', e.target.value)}
                    className="w-full bg-carbon border border-brass/15 text-ivory/80 px-5 py-3.5 placeholder:text-ivory/25 focus:outline-none focus:border-brass/40 transition-colors text-sm" />
                  <textarea placeholder="Your message..." value={form.message} onChange={e => set('message', e.target.value)} rows={6}
                    className="w-full bg-carbon border border-brass/15 text-ivory/80 px-5 py-3.5 placeholder:text-ivory/25 focus:outline-none focus:border-brass/40 transition-colors text-sm resize-none" required />
                  <button type="submit" disabled={sending}
                    className="flex items-center gap-2 bg-brass text-obsidian px-8 py-4 font-tight text-sm tracking-widest uppercase hover:bg-brass-light transition-all group disabled:opacity-50">
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />}
                    {sending ? 'Sending...' : 'Send Message'}
                  </button>
                </form>
              )}
            </ScrollReveal>

            {/* Info */}
            <div className="space-y-12">
              <ScrollReveal delay={0.15}>
                <div>
                  <h2 className="font-display text-3xl text-ivory mb-8">{page.contact_details_title || 'Contact Details'}</h2>
                  <div className="space-y-6">
                    {[
                      { icon: Mail, label: 'Email', value: settings.contact_email || 'hello@reignsatelier.com', href: `mailto:${settings.contact_email || 'hello@reignsatelier.com'}` },
                      { icon: Phone, label: 'WhatsApp', value: settings.whatsapp_number || '+1 (234) 567-890', href: `https://wa.me/${(settings.whatsapp_number || '1234567890').replace(/[^+\d]/g, '')}` },
                      { icon: MapPin, label: 'Studio', value: page.contact_studio_location || 'Nairobi, Kenya (Remote worldwide)', href: null },
                    ].map(({ icon: Icon, label, value, href }) => (
                      <div key={label} className="flex items-start gap-4">
                        <div className="w-10 h-10 border border-brass/20 flex items-center justify-center flex-shrink-0">
                          <Icon size={16} className="text-brass/70" />
                        </div>
                        <div>
                          <p className="font-tight text-xs uppercase tracking-widest text-ivory/30 mb-0.5">{label}</p>
                          {href ? <a href={href} className="text-ivory/70 hover:text-brass transition-colors text-sm">{value}</a>
                            : <span className="text-ivory/70 text-sm">{value}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollReveal>

              <ScrollReveal delay={0.25}>
                <div>
                  <h3 className="font-tight text-xs uppercase tracking-widest text-ivory/30 mb-5">{page.contact_social_title || 'Follow the Journey'}</h3>
                  <div className="flex flex-wrap gap-4">
                    {[
                      { icon: Instagram, href: settings.instagram_url || 'https://instagram.com', label: 'Instagram' },
                      { icon: Twitter, href: settings.twitter_url || 'https://twitter.com', label: 'Twitter' },
                      { icon: Youtube, href: settings.youtube_url || 'https://youtube.com', label: 'YouTube' },
                    ].map(({ icon: Icon, href, label }) => (
                      <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 border border-brass/15 text-ivory/50 px-4 py-2.5 hover:border-brass/40 hover:text-brass transition-all text-sm font-tight">
                        <Icon size={16} /> {label}
                      </a>
                    ))}
                  </div>
                </div>
              </ScrollReveal>

              {/* Map placeholder */}
              <ScrollReveal delay={0.3}>
                <div className="h-48 bg-carbon border border-brass/10 flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 80%, #3D2B52 0%, transparent 60%)' }} />
                  <div className="text-center relative">
                    <MapPin size={24} className="text-brass/40 mx-auto mb-2" />
                    <p className="font-tight text-xs uppercase tracking-widest text-ivory/30">{page.contact_studio_map_label || 'Nairobi, Kenya'}</p>
                    <p className="text-ivory/20 text-xs mt-1">{page.contact_studio_map_sublabel || 'Remote commissions worldwide'}</p>
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </div>

        {/* Instagram preview */}
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <ScrollReveal>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Instagram size={18} className="text-brass" />
                <span className="font-tight text-sm text-ivory/60">{page.contact_instagram_handle || '@reignsatelier'}</span>
              </div>
              <a href={settings.instagram_url || 'https://instagram.com'} target="_blank" rel="noopener noreferrer"
                className="text-brass font-tight text-xs tracking-wide hover:text-brass-light transition-colors flex items-center gap-1">
                Follow <ArrowRight size={12} />
              </a>
            </div>
          </ScrollReveal>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {INSTAGRAM_PREVIEWS.map((img, i) => (
              <ScrollReveal key={i} delay={i * 0.05}>
                <a href={settings.instagram_url || 'https://instagram.com'} target="_blank" rel="noopener noreferrer" className="block aspect-square overflow-hidden group">
                  <img src={img} alt="" className="w-full h-full object-cover grayscale-[40%] group-hover:grayscale-0 transition-all duration-500 scale-105 group-hover:scale-100" loading="lazy" />
                </a>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
