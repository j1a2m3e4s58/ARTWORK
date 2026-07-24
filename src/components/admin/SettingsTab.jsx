import { useState, useEffect } from 'react';
import { Check, Plus, Phone, Mail, Instagram, Twitter, Youtube, Globe, MessageCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const SETTING_DEFAULTS = [
  { key: 'whatsapp_number', label: 'WhatsApp Number', value: '+1234567890', group: 'Contact', icon: 'phone', hint: 'Include country code e.g. +1234567890' },
  { key: 'contact_email', label: 'Contact Email', value: 'hello@reignsatelier.com', group: 'Contact', icon: 'mail' },
  { key: 'whatsapp_message', label: 'WhatsApp Default Message', value: "Hello, I'm interested in a commission from Reigns Atelier", group: 'Contact', icon: 'message' },
  { key: 'instagram_url', label: 'Instagram URL', value: 'https://instagram.com/reignsatelier', group: 'Social', icon: 'instagram' },
  { key: 'twitter_url', label: 'Twitter / X URL', value: 'https://twitter.com/reignsatelier', group: 'Social', icon: 'twitter' },
  { key: 'youtube_url', label: 'YouTube URL', value: 'https://youtube.com/@reignsatelier', group: 'Social', icon: 'youtube' },
  { key: 'footer_copyright', label: 'Footer Copyright Text', value: '© 2026 Reigns Atelier. All artworks are the intellectual property of the artist.', group: 'Branding', icon: 'globe' },
  { key: 'site_tagline', label: 'Site Tagline', value: 'Where imagination bleeds onto canvas.', group: 'Branding', icon: 'globe' },
  { key: 'artist_photo', label: 'Artist Photo URL', value: 'https://images.unsplash.com/photo-1580894732444-8ecded7900cd?w=800&q=85', group: 'Branding', icon: 'globe', hint: 'Upload or paste URL for the About page artist photo' },
  { key: 'about_bio', label: 'About Bio', value: "I'm Reigns — a self-taught fine artist and digital illustrator obsessed with the space between a blank page and a completed masterpiece.", group: 'Branding', icon: 'globe' },
  { key: 'stat_artworks', label: 'Stat: Artworks Created', value: '350+', group: 'Stats', icon: 'globe' },
  { key: 'stat_clients', label: 'Stat: Happy Clients', value: '180+', group: 'Stats', icon: 'globe' },
  { key: 'stat_years', label: 'Stat: Years of Practice', value: '8', group: 'Stats', icon: 'globe' },
  { key: 'stat_awards', label: 'Stat: Awards Won', value: '12', group: 'Stats', icon: 'globe' },
  { key: 'hero_image_1', label: 'Hero Image 1 URL', value: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=1800&q=90', group: 'Hero Images', icon: 'globe' },
  { key: 'hero_image_2', label: 'Hero Image 2 URL', value: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=1800&q=90', group: 'Hero Images', icon: 'globe' },
  { key: 'hero_image_3', label: 'Hero Image 3 URL', value: 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=1800&q=90', group: 'Hero Images', icon: 'globe' },
  { key: 'newsletter_heading', label: 'Newsletter Section Heading', value: 'Newsletter', group: 'Newsletter & Offers', icon: 'mail' },
  { key: 'newsletter_body', label: 'Newsletter Description Text', value: 'Stay inspired — new works, process videos, and exclusive offers.', group: 'Newsletter & Offers', icon: 'mail' },
  { key: 'newsletter_button', label: 'Subscribe Button Label', value: 'Subscribe', group: 'Newsletter & Offers', icon: 'mail' },
  { key: 'newsletter_success', label: 'Success Message (after subscribing)', value: 'Thank you for subscribing ✦', group: 'Newsletter & Offers', icon: 'mail' },
  { key: 'promo_banner_text', label: 'Promo Banner Text (leave blank to hide)', value: '', group: 'Newsletter & Offers', icon: 'globe', hint: 'E.g. "🎨 10% off all prints this week — use code ART10". Leave empty to hide the banner.' },
  { key: 'promo_banner_link', label: 'Promo Banner Link (optional)', value: '/shop', group: 'Newsletter & Offers', icon: 'globe', hint: 'Where the banner links to, e.g. /shop or /commission' },
];

const ICON_MAP = { phone: Phone, mail: Mail, instagram: Instagram, twitter: Twitter, youtube: Youtube, globe: Globe, message: MessageCircle };

const GROUP_ORDER = ['Contact', 'Social', 'Branding', 'Stats', 'Hero Images', 'Newsletter & Offers'];

function SettingRow({ setting, onSave }) {
  const [val, setVal] = useState(setting.value);
  const [editing, setEditing] = useState(false);
  const Icon = ICON_MAP[setting.icon] || Globe;
  const changed = val !== setting.value;

  return (
    <div className="bg-carbon border border-brass/10 p-4 flex items-start gap-4">
      <div className="w-8 h-8 flex items-center justify-center bg-brass/10 flex-shrink-0 mt-0.5">
        <Icon size={14} className="text-brass/60" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-ivory/50 font-tight text-xs uppercase tracking-widest mb-0.5">{setting.label}</p>
        {setting.hint && <p className="text-ivory/25 text-xs mb-2">{setting.hint}</p>}
        {editing ? (
          <div className="flex gap-2 mt-1">
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
            <p className="text-ivory/70 text-sm truncate">{val || <span className="text-ivory/25 italic">Not set</span>}</p>
            <button onClick={() => setEditing(true)} className="text-ivory/30 hover:text-brass text-xs font-tight transition-colors flex-shrink-0">Edit</button>
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
    base44.entities.SiteContent.filter({ page: 'Settings' }).then(records => {
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
        const rec = await base44.entities.SiteContent.create({ key: def.key, label: def.label, value: def.value, page: 'Settings' });
        created[def.key] = rec;
      }
    }
    setSettings(prev => ({ ...prev, ...created }));
    setInitializing(false);
  };

  const handleSave = async (key, value) => {
    if (settings[key]) {
      await base44.entities.SiteContent.update(settings[key].id, { value });
      setSettings(prev => ({ ...prev, [key]: { ...prev[key], value } }));
    } else {
      const def = SETTING_DEFAULTS.find(d => d.key === key);
      const rec = await base44.entities.SiteContent.create({ key, label: def?.label || key, value, page: 'Settings' });
      setSettings(prev => ({ ...prev, [key]: rec }));
    }
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