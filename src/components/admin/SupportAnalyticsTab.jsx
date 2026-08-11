import { useEffect, useState } from 'react';
import { AlertTriangle, Clock3, Loader2, MessageSquareWarning, RefreshCw, ShieldAlert, TimerReset } from 'lucide-react';
import { studioClient } from '@/api/studioClient';

const duration = seconds => {
  const value = Math.max(0, Number(seconds) || 0);
  if (value < 60) return `${Math.round(value)}s`;
  if (value < 3600) return `${Math.round(value / 60)}m`;
  if (value < 86400) return `${(value / 3600).toFixed(value < 7200 ? 1 : 0)}h`;
  return `${(value / 86400).toFixed(1)}d`;
};

export default function SupportAnalyticsTab({ canRecoverJobs = false }) {
  const [analytics, setAnalytics] = useState(null);
  const [moderation, setModeration] = useState([]);
  const [jobs, setJobs] = useState({ health: {}, failures: [] });
  const [busy, setBusy] = useState(true);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const load = async () => {
    setBusy(true); setError('');
    try {
      const requests = [studioClient.admin.supportAnalytics(), studioClient.admin.moderation()];
      if (canRecoverJobs) requests.push(studioClient.admin.jobs());
      const [metrics, events, queueJobs] = await Promise.all(requests);
      setAnalytics(metrics); setModeration(events || []); if (queueJobs) setJobs(queueJobs);
    } catch (loadError) { setError(loadError.message); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); }, [canRecoverJobs]);
  const review = async (id, status) => {
    setWorking(id);
    try { const updated = await studioClient.admin.reviewModeration(id, status); setModeration(rows => rows.map(item => item.id === id ? { ...item, ...updated } : item)); }
    catch (reviewError) { setError(reviewError.message); }
    finally { setWorking(''); }
  };
  const retry = async id => {
    setWorking(id);
    try { await studioClient.admin.retryJob(id); await load(); }
    catch (retryError) { setError(retryError.message); setWorking(''); }
  };
  if (busy && !analytics) return <div className="flex min-h-80 items-center justify-center"><Loader2 className="animate-spin text-brass" /></div>;
  const cards = [
    ['Average response', duration(analytics?.averageResponseSeconds), TimerReset],
    ['95th percentile', duration(analytics?.p95ResponseSeconds), Clock3],
    ['Unread duration', duration(analytics?.averageUnreadSeconds), MessageSquareWarning],
    ['Unresolved chats', analytics?.unresolvedCount || 0, AlertTriangle],
    ['Spam review', analytics?.moderationReview || 0, ShieldAlert],
    ['Malware blocked', analytics?.malwareBlocked || 0, ShieldAlert],
  ];
  return <div>
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="font-display text-4xl text-ivory">Support Analytics</h1><p className="mt-2 text-sm text-ivory/40">Response health, unresolved customer conversations, moderation and durable delivery.</p></div><button type="button" onClick={load} disabled={busy} className="flex min-h-11 items-center justify-center gap-2 border border-brass/25 px-4 text-sm text-brass"><RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> Refresh</button></div>
    {error && <p role="alert" className="mt-5 border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-300">{error}</p>}
    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{cards.map(([label, value, Icon]) => <div key={label} className="border border-brass/10 bg-carbon p-4"><Icon size={17} className="text-brass" /><p className="mt-3 text-2xl text-ivory">{value}</p><p className="text-[10px] uppercase tracking-wider text-ivory/35">{label}</p></div>)}</div>
    <section className="mt-6 border border-brass/10 bg-carbon p-5"><h2 className="font-display text-2xl text-ivory">Unresolved conversations</h2><div className="mt-4 space-y-2">{(analytics?.unresolved || []).map(item => <a key={item.id} href={`/admin?section=messages&conversation=${encodeURIComponent(item.id)}`} className="grid gap-2 border border-brass/10 bg-obsidian p-3 text-sm hover:border-brass/30 sm:grid-cols-[1fr_auto_auto]"><span className="truncate text-ivory/70">{item.title}</span><span className="text-amber-200">Waiting {duration(item.waitingSeconds)}</span><span className="text-ivory/40">{item.unreadCount} unread</span></a>)}{!analytics?.unresolved?.length && <p className="py-8 text-center text-sm text-ivory/35">No customer conversation is awaiting a studio response.</p>}</div></section>
    <section className="mt-6 border border-brass/10 bg-carbon p-5"><h2 className="font-display text-2xl text-ivory">Spam and attachment safety</h2><div className="mt-4 space-y-2">{moderation.slice(0, 40).map(item => <div key={item.id} className="grid gap-3 border border-brass/10 bg-obsidian p-3 sm:grid-cols-[1fr_auto]"><div><p className="text-sm text-ivory/70">{item.type === 'attachment_malware' ? `Blocked attachment: ${item.filename || 'upload'}` : `Spam score ${item.score || 0}`}</p><p className="mt-1 text-xs text-ivory/35">{item.user?.name || 'Account'} · {new Date(item.created_date).toLocaleString()} · {item.status}</p></div>{['review', 'blocked'].includes(item.status) && <div className="flex gap-2"><button disabled={working === item.id} onClick={() => review(item.id, 'resolved')} className="border border-green-400/20 px-3 text-xs text-green-300">Resolve</button><button disabled={working === item.id} onClick={() => review(item.id, 'dismissed')} className="border border-ivory/10 px-3 text-xs text-ivory/45">Dismiss</button></div>}</div>)}{!moderation.length && <p className="py-8 text-center text-sm text-ivory/35">No moderation events recorded.</p>}</div></section>
    {canRecoverJobs && <section className="mt-6 border border-brass/10 bg-carbon p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-2xl text-ivory">Delivery and processing queue</h2><p className="mt-1 text-xs text-ivory/40">{jobs.health?.configured ? 'Redis/BullMQ durable mode' : 'Direct fallback mode'} · {jobs.health?.waiting || 0} waiting · {jobs.health?.failed || 0} failed</p></div></div><div className="mt-4 space-y-2">{(jobs.failures || []).map(item => <div key={item.id} className="flex flex-col justify-between gap-3 border border-red-400/10 bg-obsidian p-3 sm:flex-row sm:items-center"><div className="min-w-0"><p className="truncate text-sm text-ivory/70">{item.name}</p><p className="truncate text-xs text-red-300/60">{item.error}</p></div>{!['recovered', 'retried'].includes(item.status) && <button disabled={working === item.id} onClick={() => retry(item.id)} className="flex min-h-10 shrink-0 items-center justify-center gap-2 border border-brass/25 px-3 text-xs text-brass"><RefreshCw size={13} /> Retry job</button>}</div>)}{!jobs.failures?.length && <p className="py-8 text-center text-sm text-ivory/35">No failed delivery or processing jobs.</p>}</div></section>}
  </div>;
}
