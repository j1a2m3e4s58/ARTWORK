import { useEffect, useState } from 'react';
import { CheckCircle2, Film, Loader2, Search, Send, XCircle } from 'lucide-react';
import { studioClient } from '@/api/studioClient';

export default function StudioRequestsTab() {
  const [items, setItems] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');

  const load = () => Promise.all([
    studioClient.entities.ArtRequest.list('-created_date', 100),
    studioClient.entities.FilmRequest.list('-created_date', 100),
  ]).then(([art, film]) => setItems([
    ...art.map(item => ({ ...item, kind: 'art' })),
    ...film.map(item => ({ ...item, kind: 'film' })),
  ].sort((a, b) => String(b.created_date).localeCompare(String(a.created_date)))));

  useEffect(() => { load().catch(() => setNotice('Unable to load studio requests.')); }, []);

  const reply = async item => {
    const text = (drafts[item.id] || '').trim();
    if (!text) return;
    const entity = item.kind === 'art' ? 'ArtRequest' : 'FilmRequest';
    setBusyId(item.id);
    setNotice('');
    try {
      await studioClient.entities[entity].update(item.id, {
        status: 'replied',
        replies: [...(item.replies || []), { text, at: new Date().toISOString() }],
      });
      setDrafts(current => ({ ...current, [item.id]: '' }));
      setNotice('Private reply sent.');
      await load();
    } catch (error) {
      setNotice(error.message || 'Unable to send the reply.');
    } finally {
      setBusyId('');
    }
  };

  const updateStatus = async (item, status) => {
    const entity = item.kind === 'art' ? 'ArtRequest' : 'FilmRequest';
    setBusyId(item.id);
    setNotice('');
    try {
      const saved = await studioClient.entities[entity].update(item.id, { status });
      setItems(current => current.map(entry => entry.id === item.id && entry.kind === item.kind ? { ...saved, kind: item.kind } : entry));
      setNotice(status === 'approved'
        ? saved.approvalDelivery?.error
          ? 'Request approved. The customer update is queued for retry.'
          : 'Request approved. Customer message, email, and push update prepared.'
        : 'Request declined.');
    } catch (error) {
      setNotice(error.message || 'Unable to update this request.');
    } finally {
      setBusyId('');
    }
  };

  return <div>
    <p className="text-[10px] uppercase tracking-[.3em] text-brass">Concierge requests</p>
    <h1 className="mt-2 font-display text-4xl text-ivory">Studio Requests</h1>
    <p className="mt-2 text-sm text-ivory/45">Approve or reply to artwork sourcing and film lesson requests. Customers receive an account notification and email.</p>
    {notice && <p className="mt-4 border border-brass/15 bg-carbon px-4 py-3 text-sm text-brass">{notice}</p>}
    <div className="mt-7 space-y-4">
      {items.map(item => <article key={`${item.kind}-${item.id}`} className="border border-brass/15 bg-carbon p-4 sm:p-5">
        <div className="flex items-start gap-3">
          {item.kind === 'art' ? <Search className="shrink-0 text-brass" /> : <Film className="shrink-0 text-brass" />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-2xl text-ivory">{item.title || item.topic}</h2><span className="text-[10px] uppercase tracking-widest text-brass">{item.status || 'received'}</span></div>
            <p className="mt-1 break-all text-xs text-ivory/35">{item.accountEmail} · {item.kind === 'art' ? 'Art Finder' : 'Film request'}</p>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-ivory/60">{item.description || item.details}</p>
            {item.referenceImageUrl && <img src={item.referenceImageUrl} alt="Customer reference" className="mt-4 h-28 w-28 object-cover" />}
            {(item.replies || []).map((entry, index) => <p key={index} className="mt-3 border-l-2 border-brass/40 pl-3 text-sm text-ivory/55">{entry.text}</p>)}
            <div className="mt-4 flex flex-wrap gap-2 border-t border-brass/10 pt-4">
              <button type="button" disabled={busyId === item.id || item.status === 'approved'} onClick={() => updateStatus(item, 'approved')} className="inline-flex min-h-10 items-center gap-2 bg-green-500/15 px-4 text-xs uppercase tracking-wider text-green-300 disabled:opacity-45">
                {busyId === item.id ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Approve
              </button>
              <button type="button" disabled={busyId === item.id || item.status === 'declined'} onClick={() => updateStatus(item, 'declined')} className="inline-flex min-h-10 items-center gap-2 border border-red-400/25 px-4 text-xs uppercase tracking-wider text-red-300 disabled:opacity-45"><XCircle size={15} /> Decline</button>
              {item.approvalDelivery?.deliveredAt && <span className="self-center text-xs text-green-300/70">Approval update delivered.</span>}
              {item.approvalDelivery?.error && <span className="self-center text-xs text-amber-300/70">Delivery will be retried.</span>}
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row"><textarea value={drafts[item.id] || ''} onChange={event => setDrafts(current => ({ ...current, [item.id]: event.target.value }))} rows={2} placeholder="Write a private reply…" className="min-w-0 flex-1 border border-brass/20 bg-obsidian p-3 text-sm text-ivory outline-none" /><button disabled={busyId === item.id} onClick={() => reply(item)} className="flex min-h-11 items-center justify-center gap-2 bg-brass px-4 text-xs text-obsidian disabled:opacity-45"><Send size={14} />Reply</button></div>
          </div>
        </div>
      </article>)}
      {!items.length && <p className="border border-brass/10 p-8 text-center text-sm text-ivory/35">No studio requests yet.</p>}
    </div>
  </div>;
}
