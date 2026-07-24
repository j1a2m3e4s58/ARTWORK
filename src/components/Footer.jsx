import { Link } from 'react-router-dom';
import { Instagram, Twitter, Youtube, Mail, ArrowUpRight, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { studioClient } from '@/api/studioClient';
import { useSettings } from '@/hooks/useSettings';
import { useAuth } from '@/lib/AuthContext';

const FALLBACK_GALLERY = [
  'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=200&q=80',
  'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=200&q=80',
  'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=200&q=80',
  'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=200&q=80',
  'https://images.unsplash.com/photo-1519764622345-23439dd774f7?w=200&q=80',
  'https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=200&q=80',
];

export default function Footer() {
  const settings = useSettings();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [galleryPreviews, setGalleryPreviews] = useState(FALLBACK_GALLERY);

  useEffect(() => {
    studioClient.entities.Artwork.list('-created_date', 6).then(data => {
      const imgs = data.filter(a => a.imageUrl).map(a => a.imageUrl);
      if (imgs.length >= 3) setGalleryPreviews(imgs.slice(0, 6));
    }).catch(() => {});
  }, []);
  const promoBanner = settings.promo_banner_text;

  const handleSubscribe = async (e) => {
    e.preventDefault();
    if (!user) {
      window.location.assign('/login');
      return;
    }
    if (!email) return;
    await studioClient.entities.NewsletterSubscriber.create({ email, subscribedDate: new Date().toISOString().split('T')[0] });
    setSubscribed(true);
    setEmail('');
  };

  return (
    <>
      {/* Promo Banner */}
      {promoBanner && !bannerDismissed && (
        <div className="bg-brass text-obsidian px-4 py-2.5 flex items-center justify-center gap-3 relative">
          {settings.promo_banner_link ? (
            <Link to={settings.promo_banner_link} className="font-tight text-sm tracking-wide hover:underline flex-1 text-center">
              {promoBanner}
            </Link>
          ) : (
            <span className="font-tight text-sm tracking-wide flex-1 text-center">{promoBanner}</span>
          )}
          <button onClick={() => setBannerDismissed(true)} className="absolute right-4 top-1/2 -translate-y-1/2 hover:opacity-70 transition-opacity">
            <X size={14} />
          </button>
        </div>
      )}
    <footer className="bg-carbon border-t border-brass/10 pt-20 pb-8 relative overflow-hidden">
      <div className="noise-overlay absolute inset-0" />
      <div className="max-w-7xl mx-auto px-6 lg:px-12 relative">

        {/* Mini gallery strip */}
        <div className="flex gap-2 mb-16 overflow-hidden">
          {galleryPreviews.map((img, i) => (
            <Link key={i} to="/gallery" className="flex-1 min-w-0">
              <div className="aspect-square overflow-hidden group">
                <img
                  src={img}
                  alt=""
                  className="w-full h-full object-cover opacity-40 group-hover:opacity-80 transition-opacity duration-500 scale-105 group-hover:scale-100"
                />
              </div>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          {/* Brand */}
          <div className="md:col-span-1">
            <img src="/brand/reigns-atelier-logo.jpg" alt="Reigns Atelier" className="mb-5 w-36 border border-brass/10 opacity-90" loading="lazy" />
            <h3 className="font-display text-2xl text-ivory mb-2">{settings.site_logo_primary || 'Reigns'}</h3>
            <p className="font-tight text-[10px] uppercase tracking-[0.4em] text-brass/60 mb-4">{settings.site_logo_secondary || 'Atelier'}</p>
            <p className="text-ivory/40 text-sm leading-relaxed">Where imagination meets the canvas. Premium fine art commissions and original works.</p>
            <div className="flex gap-4 mt-6">
              <a href={settings.instagram_url || 'https://instagram.com'} target="_blank" rel="noopener noreferrer" className="text-ivory/30 hover:text-brass transition-colors"><Instagram size={18} /></a>
              <a href={settings.twitter_url || 'https://twitter.com'} target="_blank" rel="noopener noreferrer" className="text-ivory/30 hover:text-brass transition-colors"><Twitter size={18} /></a>
              <a href={settings.youtube_url || 'https://youtube.com'} target="_blank" rel="noopener noreferrer" className="text-ivory/30 hover:text-brass transition-colors"><Youtube size={18} /></a>
              <a href={`mailto:${settings.contact_email || 'hello@reignsatelier.com'}`} className="text-ivory/30 hover:text-brass transition-colors"><Mail size={18} /></a>
            </div>
          </div>

          {/* Quick links */}
          <div>
            <h4 className="font-tight text-xs uppercase tracking-[0.25em] text-brass/60 mb-6">Navigate</h4>
            <div className="flex flex-col gap-3">
              {[['Gallery', '/gallery'], ['Commission', '/commission'], ['Shop', '/shop'], ['About', '/about']].map(([label, path]) => (
                <Link key={path} to={path} className="text-ivory/40 hover:text-ivory text-sm transition-colors flex items-center gap-1 group">
                  {label}
                  <ArrowUpRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          </div>

          {/* Services */}
          <div>
            <h4 className="font-tight text-xs uppercase tracking-[0.25em] text-brass/60 mb-6">Services</h4>
            <div className="flex flex-col gap-3">
              {['Portraits', 'Digital Art', 'Sketches', 'Pencil Drawings', 'Anime Art', 'Fine Art Prints'].map((item) => (
                <span key={item} className="text-ivory/40 text-sm">{item}</span>
              ))}
            </div>
          </div>

          {/* Newsletter */}
          <div>
            <h4 className="font-tight text-xs uppercase tracking-[0.25em] text-brass/60 mb-6">
              {settings.newsletter_heading || 'Newsletter'}
            </h4>
            <p className="text-ivory/40 text-sm mb-4">
              {settings.newsletter_body || 'Stay inspired — new works, process videos, and exclusive offers.'}
            </p>
            {subscribed ? (
              <p className="text-brass text-sm font-tight">{settings.newsletter_success || 'Thank you for subscribing ✦'}</p>
            ) : (
              <form onSubmit={handleSubscribe} className="flex flex-col gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="bg-obsidian border border-brass/20 text-ivory/80 text-sm px-4 py-2.5 placeholder:text-ivory/25 focus:outline-none focus:border-brass/50 transition-colors"
                />
                <button type="submit" className="bg-brass text-obsidian text-sm font-tight tracking-wide py-2.5 hover:bg-brass-light transition-colors">
                  {settings.newsletter_button || 'Subscribe'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-brass/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-ivory/25 text-xs font-tight tracking-wide">
            {settings.footer_copyright || '© 2026 Reigns Atelier. All artworks are the intellectual property of the artist. Unauthorized reproduction is prohibited.'}
          </p>
          <div className="flex gap-6">
            <Link to="/privacy" className="text-ivory/25 text-xs font-tight tracking-wide hover:text-brass">Privacy Policy</Link>
            <Link to="/terms" className="text-ivory/25 text-xs font-tight tracking-wide hover:text-brass">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
    </>
  );
}
