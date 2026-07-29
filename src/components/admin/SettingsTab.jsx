import { useState, useEffect } from 'react';
import { Check, Pencil, Plus, Phone, Mail, Instagram, Twitter, Youtube, Globe, MessageCircle } from 'lucide-react';
import { studioClient } from '@/api/studioClient';

const SETTING_DEFAULTS = [
  { key: 'site_name', label: 'Company / Studio Name', value: 'Reigns Atelier', group: 'Branding', icon: 'globe' },
  { key: 'site_logo_primary', label: 'Logo Primary Word', value: 'Reigns', group: 'Branding', icon: 'globe' },
  { key: 'site_logo_secondary', label: 'Logo Secondary Word', value: 'Atelier', group: 'Branding', icon: 'globe' },
  { key: 'seo_title', label: 'Browser & SEO Title', value: 'Reigns Atelier — Fine Art Studio', group: 'SEO & App', icon: 'globe' },
  { key: 'seo_description', label: 'SEO Description', value: 'Bespoke fine art portraits, digital masterpieces, and commissioned artwork crafted with devotion.', group: 'SEO & App', icon: 'globe' },
  { key: 'site_url', label: 'Production Website URL', value: '', group: 'SEO & App', icon: 'globe', hint: 'Your final HTTPS domain, without a trailing slash.' },
  { key: 'business_hours', label: 'Business Hours', value: 'Monday–Friday, 9:00–17:00', group: 'Business', icon: 'globe' },
  { key: 'response_time', label: 'Typical Response Time', value: 'Within 24–48 hours', group: 'Business', icon: 'globe' },
  { key: 'currency', label: 'Default Currency', value: 'GHS', group: 'Business', icon: 'globe' },
  { key: 'locale', label: 'Default Locale', value: 'en', group: 'Business', icon: 'globe' },
  { key: 'commission_open', label: 'Commission Availability', value: 'Open for commissions', group: 'Business', icon: 'message' },
  { key: 'quote_interval_seconds', label: 'Quote Rotation (seconds)', value: '8', group: 'SEO & App', icon: 'globe' },
  { key: 'show_gallery', label: 'Show Gallery Navigation', value: 'true', group: 'Navigation', icon: 'globe' },
  { key: 'show_shop', label: 'Show Shop Navigation', value: 'false', group: 'Navigation', icon: 'globe', hint: 'Enable after at least one product is published and ordering has been rehearsed.' },
  { key: 'show_videos', label: 'Show Videos Navigation', value: 'true', group: 'Navigation', icon: 'globe' },
  { key: 'show_internships', label: 'Show Internships Navigation', value: 'false', group: 'Navigation', icon: 'globe', hint: 'Enable when the internship programme is accepting applications.' },
  { key: 'show_blog', label: 'Show Blog Navigation', value: 'false', group: 'Navigation', icon: 'globe' },
  { key: 'show_testimonials', label: 'Enable Testimonials Page', value: 'false', group: 'Navigation', icon: 'globe' },
  { key: 'show_contact', label: 'Show Contact Navigation', value: 'true', group: 'Navigation', icon: 'globe' },
  { key: 'whatsapp_number', label: 'WhatsApp Number', value: '', group: 'Contact', icon: 'phone', hint: 'Include country code e.g. +233...' },
  { key: 'contact_email', label: 'Contact Email', value: '', group: 'Contact', icon: 'mail' },
  { key: 'show_contact_map', label: 'Show Contact Map', value: 'false', group: 'Contact', icon: 'globe' },
  { key: 'whatsapp_message', label: 'WhatsApp Default Message', value: "Hello, I'm interested in a commission from Reigns Atelier", group: 'Contact', icon: 'message' },
  { key: 'instagram_url', label: 'Instagram URL', value: '', group: 'Social', icon: 'instagram' },
  { key: 'twitter_url', label: 'Twitter / X URL', value: '', group: 'Social', icon: 'twitter' },
  { key: 'youtube_url', label: 'YouTube URL', value: '', group: 'Social', icon: 'youtube' },
  { key: 'footer_copyright', label: 'Footer Copyright Text', value: '© 2026 Reigns Atelier. All artworks are the intellectual property of the artist.', group: 'Branding', icon: 'globe' },
  { key: 'site_tagline', label: 'Site Tagline', value: 'Where imagination bleeds onto canvas.', group: 'Branding', icon: 'globe' },
  { key: 'artist_photo', label: 'Artist Photo URL', value: '/brand/reigns-atelier-logo.jpg', group: 'Branding', icon: 'globe', hint: 'Upload or paste URL for the About page artist photo' },
  { key: 'hero_slide_seconds', label: 'Seconds Between Home Banners', value: '7', group: 'Banners', icon: 'globe', hint: 'Use the Home Banners tab to add, edit, arrange or remove slides.' },
  { key: 'max_hero_slides', label: 'Maximum Active Home Banners', value: '6', group: 'Banners', icon: 'globe', hint: 'Keep this between 4 and 6 for a focused home experience.' },
  { key: 'newsletter_heading', label: 'Newsletter Section Heading', value: 'Newsletter', group: 'Newsletter & Offers', icon: 'mail' },
  { key: 'newsletter_body', label: 'Newsletter Description Text', value: 'Stay inspired — new works, process videos, and exclusive offers.', group: 'Newsletter & Offers', icon: 'mail' },
  { key: 'newsletter_button', label: 'Subscribe Button Label', value: 'Subscribe', group: 'Newsletter & Offers', icon: 'mail' },
  { key: 'newsletter_success', label: 'Success Message (after subscribing)', value: 'Thank you for subscribing ✦', group: 'Newsletter & Offers', icon: 'mail' },
  { key: 'promo_banner_text', label: 'Promo Banner Text (leave blank to hide)', value: '', group: 'Newsletter & Offers', icon: 'globe', hint: 'Example: "10% off all prints this week — use code ART10". Leave empty to hide the banner.' },
  { key: 'promo_banner_link', label: 'Promo Banner Link (optional)', value: '/shop', group: 'Newsletter & Offers', icon: 'globe', hint: 'Where the banner links to, e.g. /shop or /commission' },
];

const ICON_MAP = { phone: Phone, mail: Mail, instagram: Instagram, twitter: Twitter, youtube: Youtube, globe: Globe, message: MessageCircle };

const GROUP_ORDER = ['Contact', 'Social', 'Branding', 'Navigation', 'Business', 'SEO & App', 'Banners', 'Newsletter & Offers'];

function SettingRow({ setting, onSave }) {
  const [val, setVal] = useState(setting.value);
  const [editing, setEditing] = useState(false);
  const Icon = ICON_MAP[setting.icon] || Globe;
  const changed = val !== setting.value;

  return (
    <div className="flex min-w-0 items-start gap-3 border border-brass/10 bg-carbon p-3 sm:gap-4 sm:p-4">
      <div className="w-8 h-8 flex items-center justify-center bg-brass/10 flex-shrink-0 mt-0.5">
        <Icon size={14} className="text-brass/60" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-ivory/50 font-tight text-xs uppercase tracking-widest mb-0.5">{setting.label}</p>
        {setting.hint && <p className="text-ivory/25 text-xs mb-2">{setting.hint}</p>}
        {editing ? (
          <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <input value={val} onChange={e => setVal(e.target.value)}
              className="flex-1 bg-obsidian border border-brass/30 text-ivory/80 px-3 py-2 text-sm focus:outline-none focus:border-brass/50 transition-colors" />
            <button onClick={() => { onSave(val); setEditing(false); }}
              className="flex items-center gap-1 bg-brass text-obsidian px-3 py-2 text-xs font-tight tracking-wide hover:bg-brass-light transition-all flex-shrink-0">
              <Check size={11} /> Save
            </button>
            <button onClick={() => { setVal(setting.value); setEditing(false); }}
              className="border border-brass/20 text-ivory/50 px-3 py-2 text-xs font-tight hover:border-brass/40 transition-colors flex-shrink-0">
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 break-words text-sm text-ivory/70">{val || <span className="text-ivory/25 italic">Not set</span>}</p>
            <button onClick={() => setEditing(true)} className="flex min-h-10 shrink-0 items-center gap-1 border border-brass/20 px-3 text-xs font-tight text-brass transition-colors hover:bg-brass/10"><Pencil size={12} /> Edit</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsTab() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);

  useEffect(() => {
    studioClient.entities.SiteContent.filter({ page: 'Settings' }).then(records => {
      const map = {};
      records.forEach(r => { map[r.key] = r; });
      setSettings(map);
      setLoading(false);
    });
  }, []);

  const initializeDefaults = async () => {
    setInitializing(true);
    const created = {};
    for (const def of SETTING_DEFAULTS) {
      if (!settings[def.key]) {
        const rec = await studioClient.entities.SiteContent.create({ key: def.key, label: def.label, value: def.value, page: 'Settings' });
        created[def.key] = rec;
      }
    }
    setSettings(prev => ({ ...prev, ...created }));
    setInitializing(false);
  };

  const handleSave = async (key, value) => {
    if (settings[key]) {
      await studioClient.entities.SiteContent.update(settings[key].id, { value });
      setSettings(prev => ({ ...prev, [key]: { ...prev[key], value } }));
    } else {
      const def = SETTING_DEFAULTS.find(d => d.key === key);
      const rec = await studioClient.entities.SiteContent.create({ key, label: def?.label || key, value, page: 'Settings' });
      setSettings(prev => ({ ...prev, [key]: rec }));
    }
    window.dispatchEvent(new Event('atelier:content-updated'));
  };

  const allInitialized = SETTING_DEFAULTS.every(d => settings[d.key]);

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-6 h-6 border-2 border-brass/20 border-t-brass rounded-full animate-spin" /></div>;

  return (
    <div>
      <h1 className="font-display text-4xl text-ivory mb-2">Site Settings</h1>
      <p className="text-ivory/40 text-sm mb-8">Configure contact info, social links, and global site content. Changes apply site-wide immediately.</p>

      {!allInitialized && (
        <div className="bg-carbon border border-brass/10 p-5 mb-6 flex items-center justify-between gap-4">
          <p className="text-ivory/40 text-sm">Some settings haven't been configured yet.</p>
          <button onClick={initializeDefaults} disabled={initializing}
            className="flex items-center gap-2 bg-brass text-obsidian px-4 py-2 font-tight text-sm tracking-wide hover:bg-brass-light transition-all disabled:opacity-50 flex-shrink-0">
            {initializing ? 'Initializing...' : <><Plus size={13} /> Initialize Defaults</>}
          </button>
        </div>
      )}

      {GROUP_ORDER.map(group => {
        const groupDefs = SETTING_DEFAULTS.filter(d => d.group === group);
        return (
          <div key={group} className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-6 h-px bg-brass/40" />
              <h2 className="font-tight text-xs uppercase tracking-[0.3em] text-brass/60">{group}</h2>
            </div>
            <div className="space-y-2">
              {groupDefs.map(def => {
                const record = settings[def.key];
                const merged = { ...def, value: record?.value ?? def.value };
                return <SettingRow key={def.key} setting={merged} onSave={val => handleSave(def.key, val)} />;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
