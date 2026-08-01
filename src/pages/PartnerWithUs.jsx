import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Handshake, ShieldCheck, Store } from 'lucide-react';
import PageTransition from '@/components/PageTransition';
import { studioClient } from '@/api/studioClient';
import { useAuth } from '@/lib/AuthContext';

const initialForm = { fullName: '', phone: '', shopName: '', category: '', description: '', portfolioUrl: '', agreementAccepted: false };

export default function PartnerWithUs() {
  const { user } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const update = key => event => setForm(current => ({ ...current, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  const submit = async event => {
    event.preventDefault(); setError(''); setStatus('');
    if (!form.agreementAccepted) return setError('Please accept the marketplace review and commission terms before applying.');
    try {
      await studioClient.entities.PartnerApplication.create({ ...form, fullName: form.fullName || user.full_name || '', email: user.email });
      setStatus('Application received. The studio will review your work and contact you with the next step.');
      setForm(initialForm);
    } catch (submitError) { setError(submitError.message); }
  };

  if (!user) return <PageTransition><main className="min-h-screen bg-obsidian px-5 pb-28 pt-32"><section className="mx-auto max-w-xl border border-brass/20 bg-carbon p-7 text-center sm:p-10"><Handshake className="mx-auto text-brass" size={32} /><h1 className="mt-5 font-display text-4xl text-ivory">Partner with the studio</h1><p className="mt-4 leading-7 text-ivory/55">Create an account first so your application, product reviews, and payout records remain private and easy to manage.</p><Link to="/login?redirect=/partner-with-us" className="mt-7 inline-flex min-h-12 items-center bg-brass px-6 text-xs uppercase tracking-widest text-obsidian">Sign in to apply</Link></section></main></PageTransition>;

  return <PageTransition><main className="min-h-screen bg-obsidian px-5 pb-28 pt-28"><div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[.8fr_1.2fr]"><aside className="border border-brass/15 bg-carbon p-6 sm:p-8"><p className="text-xs uppercase tracking-[.28em] text-brass">Curated marketplace</p><h1 className="mt-3 font-display text-5xl text-ivory">Sell with Reigns Atelier</h1><p className="mt-5 leading-7 text-ivory/55">Bring your original art, prints, materials, or carefully selected creative products to a studio-led audience.</p><div className="mt-8 space-y-5 text-sm text-ivory/65"><p className="flex gap-3"><Store className="shrink-0 text-brass" size={18} />You submit listings; the studio reviews every item before it is visible.</p><p className="flex gap-3"><Handshake className="shrink-0 text-brass" size={18} />Your agreed commission rate and payout records are kept in your private partner workspace.</p><p className="flex gap-3"><ShieldCheck className="shrink-0 text-brass" size={18} />The studio may ask for a signed contract before publishing your products.</p></div></aside><form onSubmit={submit} className="border border-brass/15 bg-carbon p-5 sm:p-8"><p className="text-xs uppercase tracking-[.28em] text-brass">Application</p><h2 className="mt-2 font-display text-3xl text-ivory">Tell us about your work</h2><div className="mt-7 grid gap-4 sm:grid-cols-2"><Field label="Your name" value={form.fullName} onChange={update('fullName')} placeholder={user.full_name || 'Full name'} /><Field label="Phone" value={form.phone} onChange={update('phone')} placeholder="+233…" /><Field label="Shop or brand name" value={form.shopName} onChange={update('shopName')} placeholder="Your creative shop" /><Field label="Product category" value={form.category} onChange={update('category')} placeholder="e.g. Original paintings" /></div><Field label="Portfolio or social link" value={form.portfolioUrl} onChange={update('portfolioUrl')} placeholder="https://…" type="url" className="mt-4" /><label className="mt-4 block text-xs uppercase tracking-wider text-ivory/45">What would you like to sell?<textarea required value={form.description} onChange={update('description')} rows={6} className="mt-2 w-full border border-brass/20 bg-obsidian p-3 text-sm leading-6 text-ivory outline-none focus:border-brass" placeholder="Describe your work, your audience, and why it belongs in the studio marketplace." /></label><label className="mt-5 flex gap-3 border border-brass/15 bg-obsidian/50 p-4 text-sm leading-6 text-ivory/65"><input required type="checkbox" checked={form.agreementAccepted} onChange={update('agreementAccepted')} className="mt-1 h-4 w-4 accent-[#c9a65b]" />I understand that items are reviewed before publication and that commission/payout terms are agreed with the studio before sales begin.</label>{error && <p className="mt-4 border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}{status && <p className="mt-4 border border-green-400/30 bg-green-400/10 p-3 text-sm text-green-200">{status}</p>}<button className="mt-5 min-h-12 w-full bg-brass px-5 text-xs uppercase tracking-widest text-obsidian">Send partner application</button></form></div></main></PageTransition>;
}

function Field({ label, className = '', ...props }) { return <label className={`block text-xs uppercase tracking-wider text-ivory/45 ${className}`}>{label}<input required={!['Phone', 'Product category', 'Portfolio or social link'].includes(label)} {...props} className="mt-2 min-h-11 w-full border border-brass/20 bg-obsidian px-3 text-sm normal-case tracking-normal text-ivory outline-none focus:border-brass" /></label>; }
