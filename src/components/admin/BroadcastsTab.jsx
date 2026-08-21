import { useEffect, useState } from 'react';
import { BellRing, CalendarClock, CheckCircle2, FileText, Image as ImageIcon, Loader2, Send } from 'lucide-react';
import FileUploadField from '@/components/admin/FileUploadField';
import { studioClient } from '@/api/studioClient';

const EMPTY_BROADCAST = {
  title: '',
  body: '',
  audience: 'customers',
  scheduledAt: '',
  mediaType: '',
  mediaTitle: '',
  mediaUrl: '',
};

export default function BroadcastsTab() {
  const [form, setForm] = useState(EMPTY_BROADCAST);
  const [updates, setUpdates] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadUpdates = async () => {
    try {
      setUpdates(await studioClient.chat.announcements());
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUpdates(); }, []);

  const publish = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.body.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const mediaIsImage = form.mediaType === 'image';
      const update = await studioClient.chat.announce({
        title: form.title.trim(),
        body: form.body.trim(),
        audience: form.audience,
        scheduledAt: form.scheduledAt || null,
        richMedia: form.mediaType && form.mediaUrl ? {
          type: form.mediaType,
          title: form.mediaTitle.trim() || (mediaIsImage ? 'Broadcast image' : 'Broadcast document'),
          imageUrl: mediaIsImage ? form.mediaUrl : '',
          url: form.mediaUrl,
        } : null,
        action: { label: 'Open update', url: '/messages' },
      });
      setForm(EMPTY_BROADCAST);
      setNotice(update.status === 'scheduled'
        ? 'Broadcast scheduled successfully.'
        : `Broadcast sent to ${Number(update.recipientIds?.length || 0).toLocaleString()} customer${update.recipientIds?.length === 1 ? '' : 's'}.`);
      await loadUpdates();
    } catch (publishError) {
      setError(publishError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-7 flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-brass/20 bg-brass/10 text-brass"><BellRing size={22} /></span>
        <div>
          <h1 className="font-display text-3xl text-ivory sm:text-4xl">Customer Broadcasts</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ivory/45">Send one polished update to every signed-up customer. It appears in Community Updates, the notification centre, and on subscribed phones.</p>
        </div>
      </div>

      <form onSubmit={publish} className="glass-panel rounded-2xl border border-brass/15 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-brass/70">Notification title</span>
            <input value={form.title} maxLength={100} onChange={event => setForm(value => ({ ...value, title: event.target.value }))} placeholder="A new collection has arrived" className="h-12 w-full rounded-xl border border-brass/15 bg-obsidian px-4 text-ivory outline-none focus:border-brass/45" />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-brass/70">Message</span>
            <textarea value={form.body} maxLength={10000} onChange={event => setForm(value => ({ ...value, body: event.target.value }))} placeholder="Keep it short, clear and inviting…" rows={4} className="w-full resize-none rounded-xl border border-brass/15 bg-obsidian p-4 text-ivory outline-none focus:border-brass/45" />
          </label>
          <label>
            <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-brass/70">Recipients</span>
            <select value={form.audience} onChange={event => setForm(value => ({ ...value, audience: event.target.value }))} className="h-12 w-full rounded-xl border border-brass/15 bg-obsidian px-4 text-ivory outline-none">
              <option value="customers">All signed-up customers</option>
              <option value="all">Everyone</option>
              <option value="partners">Partners</option>
              <option value="interns">Interns</option>
              <option value="staff">Studio staff</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-brass/70">Send later (optional)</span>
            <input type="datetime-local" value={form.scheduledAt} onChange={event => setForm(value => ({ ...value, scheduledAt: event.target.value }))} className="h-12 w-full rounded-xl border border-brass/15 bg-obsidian px-4 text-ivory outline-none" />
          </label>
          <label>
            <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-brass/70">Attachment type</span>
            <select value={form.mediaType} onChange={event => setForm(value => ({ ...value, mediaType: event.target.value, mediaUrl: '', mediaTitle: '' }))} className="h-12 w-full rounded-xl border border-brass/15 bg-obsidian px-4 text-ivory outline-none">
              <option value="">No attachment</option>
              <option value="image">Image</option>
              <option value="document">Document</option>
            </select>
          </label>
          {form.mediaType && <label>
            <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-brass/70">Attachment label</span>
            <input value={form.mediaTitle} onChange={event => setForm(value => ({ ...value, mediaTitle: event.target.value }))} placeholder={form.mediaType === 'image' ? 'Image caption' : 'Document name'} className="h-12 w-full rounded-xl border border-brass/15 bg-obsidian px-4 text-ivory outline-none" />
          </label>}
          {form.mediaType && <div className="sm:col-span-2">
            <FileUploadField
              label={form.mediaType === 'image' ? 'Notification image' : 'Notification document'}
              value={form.mediaUrl}
              onChange={mediaUrl => setForm(value => ({ ...value, mediaUrl }))}
              accept={form.mediaType === 'image' ? 'image/jpeg,image/png,image/webp,image/gif' : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,application/pdf'}
              placeholder="Paste a secure URL or upload a file"
            />
          </div>}
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{error}</p>}
        {notice && <p role="status" className="mt-4 flex items-center gap-2 rounded-xl border border-green-400/20 bg-green-400/5 p-3 text-sm text-green-200"><CheckCircle2 size={16} />{notice}</p>}
        <button disabled={busy || !form.title.trim() || !form.body.trim()} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brass px-5 text-sm font-semibold uppercase tracking-wider text-obsidian transition hover:bg-brass-light disabled:opacity-40 sm:w-auto">
          {busy ? <Loader2 size={17} className="animate-spin" /> : form.scheduledAt ? <CalendarClock size={17} /> : <Send size={17} />}
          {form.scheduledAt ? 'Schedule broadcast' : 'Send broadcast'}
        </button>
      </form>

      <section className="mt-7">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-ivory/40">Recent broadcasts</h2>
        {loading ? <div className="h-20 animate-pulse rounded-xl bg-white/5" /> : updates.length ? <div className="space-y-2">
          {updates.slice(0, 12).map(update => (
            <article key={update.id} className="flex items-center gap-3 rounded-xl border border-brass/10 bg-carbon p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brass/10 text-brass">{update.richMedia?.type === 'image' ? <ImageIcon size={18} /> : update.richMedia?.type === 'document' ? <FileText size={18} /> : <BellRing size={18} />}</span>
              <div className="min-w-0 flex-1"><b className="block truncate text-sm text-ivory">{update.title}</b><p className="truncate text-xs text-ivory/40">{update.status} · {update.audience} · {update.deliveredCount || update.recipientIds?.length || 0} delivered</p></div>
            </article>
          ))}
        </div> : <p className="rounded-xl border border-dashed border-brass/15 p-6 text-sm text-ivory/35">No broadcasts have been sent yet.</p>}
      </section>
    </div>
  );
}
