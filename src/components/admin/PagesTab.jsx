import { useState, useEffect } from 'react';
import { Check, Plus, Globe, MessageCircle, User } from 'lucide-react';
import { studioClient } from '@/api/studioClient';

const PAGE_CONTENT_DEFAULTS = [
  // Commission page
  { key: 'commission_tagline', label: 'Commission Page Tagline', value: 'Commission a bespoke artwork crafted entirely for you. From intimate pencil portraits to large-scale digital masterpieces.', group: 'Commission Page', page: 'Commission' },
  { key: 'commission_pkg1_name', label: 'Package 1 — Name', value: 'Sketch Study', group: 'Commission Packages', page: 'Commission' },
  { key: 'commission_pkg1_price', label: 'Package 1 — Price', value: 'GH₵ 800', group: 'Commission Packages', page: 'Commission' },
  { key: 'commission_pkg1_duration', label: 'Package 1 — Duration', value: '5-7 days', group: 'Commission Packages', page: 'Commission' },
  { key: 'commission_pkg1_features', label: 'Package 1 — Features (comma-separated)', value: 'One subject,Pencil / Charcoal,Digital delivery,1 revision,A4 size', group: 'Commission Packages', page: 'Commission' },
  { key: 'commission_pkg2_name', label: 'Package 2 — Name', value: 'Fine Portrait', group: 'Commission Packages', page: 'Commission' },
  { key: 'commission_pkg2_price', label: 'Package 2 — Price', value: 'GH₵ 2,000', group: 'Commission Packages', page: 'Commission' },
  { key: 'commission_pkg2_duration', label: 'Package 2 — Duration', value: '10-14 days', group: 'Commission Packages', page: 'Commission' },
  { key: 'commission_pkg2_features', label: 'Package 2 — Features (comma-separated)', value: 'One subject,Choice of medium,High-res digital + print,3 revisions,A3 size,Certificate of authenticity', group: 'Commission Packages', page: 'Commission' },
  { key: 'commission_pkg3_name', label: 'Package 3 — Name', value: 'Masterwork', group: 'Commission Packages', page: 'Commission' },
  { key: 'commission_pkg3_price', label: 'Package 3 — Price', value: 'GH₵ 4,500+', group: 'Commission Packages', page: 'Commission' },
  { key: 'commission_pkg3_duration', label: 'Package 3 — Duration', value: '3-5 weeks', group: 'Commission Packages', page: 'Commission' },
  { key: 'commission_pkg3_features', label: 'Package 3 — Features (comma-separated)', value: 'Multiple subjects,Premium medium,Original shipped worldwide,Unlimited revisions,Custom size,Certificate + framing', group: 'Commission Packages', page: 'Commission' },
  { key: 'commission_faq1_q', label: 'FAQ 1 — Question', value: 'How does the commission process work?', group: 'Commission FAQs', page: 'Commission' },
  { key: 'commission_faq1_a', label: 'FAQ 1 — Answer', value: 'You submit your request, I review it within 24 hours, and if accepted, we discuss details. You get progress previews and final delivery once satisfied.', group: 'Commission FAQs', page: 'Commission' },
  { key: 'commission_faq2_q', label: 'FAQ 2 — Question', value: 'What reference images do you need?', group: 'Commission FAQs', page: 'Commission' },
  { key: 'commission_faq2_a', label: 'FAQ 2 — Answer', value: 'Clear, well-lit photos work best. The more reference angles you provide, the more accurate and detailed the final artwork will be.', group: 'Commission FAQs', page: 'Commission' },
  { key: 'commission_faq3_q', label: 'FAQ 3 — Question', value: 'Do you offer revisions?', group: 'Commission FAQs', page: 'Commission' },
  { key: 'commission_faq3_a', label: 'FAQ 3 — Answer', value: 'Yes — revisions are included based on your package. The Fine Portrait and Masterwork packages include multiple rounds of feedback.', group: 'Commission FAQs', page: 'Commission' },
  { key: 'commission_faq4_q', label: 'FAQ 4 — Question', value: 'How do I pay?', group: 'Commission FAQs', page: 'Commission' },
  { key: 'commission_faq4_a', label: 'FAQ 4 — Answer', value: 'A 50% deposit is required to begin. The remaining 50% is due upon your approval of the final artwork before delivery.', group: 'Commission FAQs', page: 'Commission' },
  // About page
  { key: 'about_bio', label: 'Bio (Main)', value: "I'm Reigns — a self-taught fine artist and digital illustrator obsessed with the space between a blank page and a completed masterpiece. Every stroke is intentional. Every shadow, earned.", group: 'About Page', page: 'About' },
  { key: 'about_bio2', label: 'Bio (Second Paragraph)', value: 'Born from a deep love of portraiture and the classical masters, my work sits at the intersection of tradition and contemporary expression. I believe art should feel something — it should pull at you, even in silence.', group: 'About Page', page: 'About' },
  { key: 'about_mission', label: 'Mission Text', value: 'Art has the power to preserve memory, honor beauty, and give the intangible a home. I create to bridge the gap between what we feel and what we can say — to make the invisible visible through the patient work of the hand and heart.', group: 'About Page', page: 'About' },
  { key: 'about_inspiration', label: 'Inspiration Text', value: "The quiet drama of the human face. The way light falls across a sleeping figure. The tension in a pencil line that almost breaks. I am endlessly inspired by the masters — Rembrandt's chiaroscuro, Sargent's fluency, Moebius's precision — and by everyday life in all its gorgeous complexity.", group: 'About Page', page: 'About' },
  { key: 'about_timeline', label: 'Verified Timeline Events (format: year|event, one per line)', value: '', group: 'About Page', page: 'About' },
  { key: 'about_skills', label: 'Verified Skills (format: name|level%, one per line)', value: '', group: 'About Page', page: 'About' },
  // Contact page
  { key: 'contact_eyebrow', label: 'Section Label', value: 'Get in Touch', group: 'Contact Page', page: 'Contact' },
  { key: 'contact_title', label: 'Page Title', value: "Let's Connect", group: 'Contact Page', page: 'Contact' },
  { key: 'contact_form_title', label: 'Form Heading', value: 'Send a Message', group: 'Contact Page', page: 'Contact' },
  { key: 'contact_details_title', label: 'Contact Details Heading', value: 'Contact Details', group: 'Contact Page', page: 'Contact' },
  { key: 'contact_social_title', label: 'Social Links Heading', value: 'Follow the Journey', group: 'Contact Page', page: 'Contact' },
  { key: 'contact_success_title', label: 'Success Message Title', value: 'Message Sent', group: 'Contact Page', page: 'Contact' },
  { key: 'contact_success_body', label: 'Success Message Body', value: 'Thank you for reaching out. I will respond within 24–48 hours.', group: 'Contact Page', page: 'Contact' },
  { key: 'contact_studio_location', label: 'Studio Location Text', value: '', group: 'Contact Page', page: 'Contact' },
  { key: 'contact_instagram_handle', label: 'Instagram Display Handle', value: '@reignsatelier', group: 'Contact Page', page: 'Contact' },
  { key: 'gallery_label', label: 'Section Label', value: 'The Vault', group: 'Gallery Page', page: 'Gallery' },
  { key: 'gallery_title', label: 'Page Title', value: 'Gallery Portfolio', group: 'Gallery Page', page: 'Gallery' },
  { key: 'shop_label', label: 'Section Label', value: 'The Boutique', group: 'Shop Page', page: 'Shop' },
  { key: 'shop_title', label: 'Page Title', value: 'Art Shop', group: 'Shop Page', page: 'Shop' },
  { key: 'videos_label', label: 'Section Label', value: 'Video Portal', group: 'Videos Page', page: 'Videos' },
  { key: 'videos_title', label: 'Page Title', value: 'Art in Motion', group: 'Videos Page', page: 'Videos' },
  { key: 'videos_subtitle', label: 'Page Subtitle', value: 'Process videos, time-lapses, tutorials, and behind-the-scenes glimpses into the atelier.', group: 'Videos Page', page: 'Videos' },
  { key: 'blog_label', label: 'Section Label', value: 'Art Journal', group: 'Blog Page', page: 'Blog' },
  { key: 'blog_title', label: 'Page Title', value: 'Stories & Process', group: 'Blog Page', page: 'Blog' },
  { key: 'testimonials_label', label: 'Section Label', value: 'Client Words', group: 'Testimonials Page', page: 'Testimonials' },
  { key: 'testimonials_title', label: 'Page Title', value: 'Voices of Trust', group: 'Testimonials Page', page: 'Testimonials' },
  { key: 'privacy_title', label: 'Privacy Page Title', value: 'Privacy Policy', group: 'Legal Pages', page: 'Legal' },
  { key: 'privacy_body', label: 'Privacy Policy Text', value: 'We collect account, message, and commission information only to provide studio services. We do not sell personal information.', group: 'Legal Pages', page: 'Legal' },
  { key: 'terms_title', label: 'Terms Page Title', value: 'Terms of Service', group: 'Legal Pages', page: 'Legal' },
  { key: 'terms_body', label: 'Terms of Service Text', value: 'By using Reigns Atelier, you agree to provide accurate information and respect the artist’s intellectual property and commission terms.', group: 'Legal Pages', page: 'Legal' },
  // Home page
  { key: 'hero_title', label: 'Hero Title', value: 'Reigns Atelier', group: 'Home Page', page: 'Home' },
  { key: 'hero_subtitle', label: 'Hero Subtitle', value: 'Where imagination bleeds onto canvas. Fine art portraits, digital masterpieces, and bespoke commissions crafted with devotion.', group: 'Home Page', page: 'Home' },
  { key: 'stat_artworks', label: 'Stat: Artworks Created', value: '—', group: 'Home Page', page: 'Home' },
  { key: 'stat_clients', label: 'Stat: Happy Clients', value: '—', group: 'Home Page', page: 'Home' },
  { key: 'stat_years', label: 'Stat: Years of Practice', value: '—', group: 'Home Page', page: 'Home' },
  { key: 'stat_awards', label: 'Stat: Awards Won', value: '—', group: 'Home Page', page: 'Home' },
];

const GROUP_ORDER = ['Home Page', 'Gallery Page', 'Shop Page', 'Videos Page', 'Blog Page', 'Testimonials Page', 'Commission Page', 'Commission Packages', 'Commission FAQs', 'About Page', 'Contact Page', 'Legal Pages'];
const GROUP_ICONS = { 'Home Page': Globe, 'Gallery Page': Globe, 'Shop Page': Globe, 'Videos Page': Globe, 'Blog Page': Globe, 'Testimonials Page': Globe, 'Commission Page': MessageCircle, 'Commission Packages': MessageCircle, 'Commission FAQs': MessageCircle, 'About Page': User, 'Contact Page': Globe, 'Legal Pages': Globe };

function FieldRow({ def, record, onSave }) {
  const [val, setVal] = useState(record?.value ?? def.value);
  const [editing, setEditing] = useState(false);
  const isLong = def.label.includes('features') || def.label.includes('Timeline') || def.label.includes('Skills') || def.label.includes('Text') || def.label.includes('Answer') || def.label.includes('Bio') || def.label.includes('Subtitle') || def.label.includes('Quote');

  return (
    <div className="bg-carbon border border-brass/10 p-4">
      <p className="text-ivory/40 font-tight text-xs uppercase tracking-widest mb-1">{def.label}</p>
      {editing ? (
        <div className="mt-2 space-y-2">
          {isLong ? (
            <textarea value={val} onChange={e => setVal(e.target.value)} rows={4}
              className="w-full bg-obsidian border border-brass/30 text-ivory/80 px-3 py-2 text-sm focus:outline-none focus:border-brass/50 resize-y transition-colors" />
          ) : (
            <input value={val} onChange={e => setVal(e.target.value)}
              className="w-full bg-obsidian border border-brass/30 text-ivory/80 px-3 py-2 text-sm focus:outline-none focus:border-brass/50 transition-colors" />
          )}
          <div className="flex gap-2">
            <button onClick={() => { onSave(val); setEditing(false); }}
              className="flex items-center gap-1 bg-brass text-obsidian px-3 py-1.5 text-xs font-tight hover:bg-brass-light transition-all">
              <Check size={11} /> Save
            </button>
            <button onClick={() => { setVal(record?.value ?? def.value); setEditing(false); }}
              className="border border-brass/20 text-ivory/50 px-3 py-1.5 text-xs font-tight hover:border-brass/40 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3 mt-1">
          <p className="text-ivory/60 text-sm leading-relaxed line-clamp-2 flex-1">{val || <span className="text-ivory/25 italic">Not set</span>}</p>
          <button onClick={() => setEditing(true)} className="text-ivory/30 hover:text-brass text-xs font-tight transition-colors flex-shrink-0">Edit</button>
        </div>
      )}
    </div>
  );
}

export default function PagesTab() {
  const [records, setRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);

  const pages = ['Home', 'Gallery', 'Shop', 'Videos', 'Blog', 'Testimonials', 'Commission', 'About', 'Contact', 'Legal'];

  useEffect(() => {
    Promise.all(pages.map(p => studioClient.entities.SiteContent.filter({ page: p }))).then(results => {
      const map = {};
      results.flat().forEach(r => { map[r.key] = r; });
      setRecords(map);
      setLoading(false);
    });
  }, []);

  const allInitialized = PAGE_CONTENT_DEFAULTS.every(d => records[d.key]);

  const initializeDefaults = async () => {
    setInitializing(true);
    const created = {};
    for (const def of PAGE_CONTENT_DEFAULTS) {
      if (!records[def.key]) {
        const rec = await studioClient.entities.SiteContent.create({ key: def.key, label: def.label, value: def.value, page: def.page });
        created[def.key] = rec;
      }
    }
    setRecords(prev => ({ ...prev, ...created }));
    setInitializing(false);
  };

  const handleSave = async (key, value) => {
    const def = PAGE_CONTENT_DEFAULTS.find(d => d.key === key);
    if (records[key]) {
      await studioClient.entities.SiteContent.update(records[key].id, { value });
      setRecords(prev => ({ ...prev, [key]: { ...prev[key], value } }));
    } else {
      const rec = await studioClient.entities.SiteContent.create({ key, label: def?.label || key, value, page: def?.page || 'Home' });
      setRecords(prev => ({ ...prev, [key]: rec }));
    }
    window.dispatchEvent(new Event('atelier:content-updated'));
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-6 h-6 border-2 border-brass/20 border-t-brass rounded-full animate-spin" />
    </div>
  );

  return (
    <div>
      <h1 className="font-display text-4xl text-ivory mb-2">Page Content</h1>
      <p className="text-ivory/40 text-sm mb-8">Edit all text content across every page — packages, FAQs, bios, stats, and more.</p>

      {!allInitialized && (
        <div className="bg-carbon border border-brass/10 p-5 mb-6 flex items-center justify-between gap-4">
          <p className="text-ivory/40 text-sm">Some page content hasn't been initialized yet.</p>
          <button onClick={initializeDefaults} disabled={initializing}
            className="flex items-center gap-2 bg-brass text-obsidian px-4 py-2 font-tight text-sm tracking-wide hover:bg-brass-light transition-all disabled:opacity-50 flex-shrink-0">
            {initializing ? 'Initializing...' : <><Plus size={13} /> Initialize All</>}
          </button>
        </div>
      )}

      {GROUP_ORDER.map(group => {
        const groupDefs = PAGE_CONTENT_DEFAULTS.filter(d => d.group === group);
        const Icon = GROUP_ICONS[group] || Globe;
        return (
          <div key={group} className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Icon size={13} className="text-brass/50" />
              <h2 className="font-tight text-xs uppercase tracking-[0.3em] text-brass/60">{group}</h2>
            </div>
            <div className="space-y-2">
              {groupDefs.map(def => (
                <FieldRow key={def.key} def={def} record={records[def.key]} onSave={val => handleSave(def.key, val)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
