import { useState } from 'react';
import { ImagePlus, Search, X } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import FileUploadField from '@/components/admin/FileUploadField';
import { useAuth } from '@/lib/AuthContext';
import { Link } from 'react-router-dom';

export default function ArtFinderRequest({ open, onClose }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ title: '', category: '', description: '', budget: '', preferredDate: '', referenceImageUrl: '' });
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const submit = async event => {
    event.preventDefault(); setBusy(true); setNotice('');
    try { await studioClient.entities.ArtRequest.create(form); setNotice('Your request is with the studio. You can follow the reply in My Account.'); setForm({ title: '', category: '', description: '', budget: '', preferredDate: '', referenceImageUrl: '' }); }
    catch (error) { setNotice(error.message); } finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-6"><button className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={onClose} aria-label="Close"/><section role="dialog" aria-modal="true" className="relative max-h-[92dvh] w-full max-w-2xl overflow-y-auto border border-brass/25 bg-carbon p-5 shadow-2xl sm:p-8"><button onClick={onClose} className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center text-ivory/55"><X/></button><Search className="text-brass"/><p className="mt-4 text-[10px] uppercase tracking-[.3em] text-brass">Personal sourcing</p><h2 className="mt-2 font-display text-4xl text-ivory">Studio Art Finder</h2><p className="mt-3 max-w-xl text-sm leading-6 text-ivory/50">Tell the atelier what you hoped to find. The team can source it, suggest an alternative, or prepare a private quote.</p>{!user ? <div className="mt-7 border border-brass/15 p-5 text-center text-sm text-ivory/60"><p>Sign in so the studio can reply privately.</p><Link to="/login?redirect=/shop" className="mt-4 inline-flex bg-brass px-5 py-3 text-xs uppercase tracking-widest text-obsidian">Sign in</Link></div> : <form onSubmit={submit} className="mt-7 space-y-4"><Field label="What are you looking for?" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required/><div className="grid gap-4 sm:grid-cols-2"><Field label="Category" value={form.category} onChange={e=>setForm({...form,category:e.target.value})} placeholder="Painting, brushes, print…"/><Field label="Working budget" value={form.budget} onChange={e=>setForm({...form,budget:e.target.value})} placeholder="e.g. GH₵ 500–900"/></div><label className="block text-xs uppercase tracking-wider text-ivory/45">Describe it<textarea required minLength={10} rows={5} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="mt-2 w-full border border-brass/20 bg-obsidian p-3 text-sm text-ivory outline-none focus:border-brass"/></label><Field label="Preferred date (optional)" type="date" value={form.preferredDate} onChange={e=>setForm({...form,preferredDate:e.target.value})}/><FileUploadField label="Reference image (optional)" value={form.referenceImageUrl} onChange={referenceImageUrl=>setForm({...form,referenceImageUrl})} accept="image/*"/><button disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 bg-brass text-xs uppercase tracking-widest text-obsidian disabled:opacity-50"><ImagePlus size={16}/>{busy?'Sending…':'Ask the studio to find it'}</button>{notice&&<p className="border border-brass/20 p-3 text-sm text-ivory/65">{notice}</p>}</form>}</section></div>;
}
function Field({label,...props}){return <label className="block text-xs uppercase tracking-wider text-ivory/45">{label}<input {...props} className="mt-2 min-h-11 w-full border border-brass/20 bg-obsidian px-3 text-sm normal-case tracking-normal text-ivory outline-none focus:border-brass"/></label>}
