import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CheckCircle2, MapPin, PackageSearch, Search } from 'lucide-react';
import PageTransition from '@/components/PageTransition';
import { studioClient } from '@/api/studioClient';

const label = value => String(value || 'pending').replaceAll('_', ' ');
const money = (value, currency = 'GHS') => new Intl.NumberFormat('en-GH', { style: 'currency', currency }).format(Number(value) || 0);

export default function OrderTracking() {
  const location = useLocation();
  const initial = new URLSearchParams(location.search);
  const [form, setForm] = useState({ trackingCode: initial.get('code') || '', email: '' });
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const trackOrder = useCallback(async values => {
    setError('');
    setOrder(null);
    setLoading(true);
    try {
      setOrder(await studioClient.orders.track(values));
    } catch (requestError) {
      setError(requestError.message || 'We could not find that order.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const trackingToken = query.get('token') || '';
    if (!trackingToken) return;
    setLoading(true); setError('');
    studioClient.orders.trackByToken(trackingToken).then(setOrder).catch(requestError => setError(requestError.message || 'We could not open this order.')).finally(() => setLoading(false));
  }, [location.search, trackOrder]);

  const submit = event => {
    event.preventDefault();
    trackOrder(form);
  };

  return <PageTransition><main className="min-h-screen bg-obsidian px-5 pb-24 pt-28 sm:px-6">
    <section className="mx-auto max-w-5xl">
      <header className="border border-brass/15 bg-carbon/70 p-5 sm:p-8">
        <p className="text-xs uppercase tracking-[.3em] text-brass/70">Customer care</p>
        <h1 className="mt-3 font-display text-5xl text-ivory sm:text-6xl">Track your order</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-ivory/55">See the latest payment, studio preparation and delivery progress. Your checkout confirmation opens a secure tracking link automatically; you can also search using your tracking code and checkout email.</p>
      </header>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
        <form onSubmit={submit} className="grid content-start gap-3 border border-brass/15 bg-carbon p-5">
          <div className="mb-2 flex items-center gap-2 text-brass"><PackageSearch size={18} /><span className="font-tight text-xs uppercase tracking-[.2em]">Search details</span></div>
          <label className="text-xs uppercase tracking-wider text-ivory/45">Tracking code<input required value={form.trackingCode} onChange={event => setForm(current => ({ ...current, trackingCode: event.target.value }))} placeholder="RA-12345678" className="mt-2 min-h-12 w-full border border-brass/20 bg-obsidian px-3 text-sm text-ivory" /></label>
          <label className="text-xs uppercase tracking-wider text-ivory/45">Checkout email<input required type="email" autoComplete="email" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} placeholder="you@email.com" className="mt-2 min-h-12 w-full border border-brass/20 bg-obsidian px-3 text-sm text-ivory" /></label>
          <button disabled={loading} className="mt-2 flex min-h-12 items-center justify-center gap-2 bg-brass px-5 text-xs font-semibold uppercase tracking-wider text-obsidian disabled:opacity-50"><Search size={15} />{loading ? 'Checking…' : 'Track order'}</button>
        </form>

        <section className="border border-brass/15 bg-carbon p-5 sm:p-7">
          {error && <p role="alert" className="border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{error}</p>}
          {!order && !error && <div className="flex min-h-64 flex-col items-center justify-center text-center"><PackageSearch size={32} className="text-brass/55" /><h2 className="mt-4 font-display text-2xl text-ivory">Your order status will appear here</h2><p className="mt-2 max-w-sm text-sm leading-6 text-ivory/40">Use the code shown after checkout. Choosing “Track this order” opens this page with your order already loaded.</p></div>}
          {order && <>
            <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[.2em] text-ivory/35">Tracking code</p><h2 className="mt-1 font-display text-3xl text-brass">{order.trackingCode}</h2></div><span className="border border-green-400/25 bg-green-400/10 px-3 py-2 text-xs uppercase tracking-wider text-green-200">{label(order.status)}</span></div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="border border-ivory/10 p-3"><p className="text-xs uppercase text-ivory/35">Payment</p><p className="mt-1 text-sm text-ivory">{label(order.paymentStatus)}</p></div><div className="border border-ivory/10 p-3"><p className="text-xs uppercase text-ivory/35">Delivery</p><p className="mt-1 text-sm text-ivory">{order.deliveryZone?.name || 'Being confirmed'}</p></div><div className="border border-ivory/10 p-3"><p className="text-xs uppercase text-ivory/35">Order total</p><p className="mt-1 text-sm text-ivory">{money(order.total, order.currency)}</p></div></div>
            <div className="mt-6 border-t border-brass/10 pt-5"><p className="text-xs uppercase tracking-[.2em] text-brass/70">Progress</p><ol className="mt-4 space-y-3">{(order.statusHistory?.length ? order.statusHistory : [{ status: order.status, at: order.createdDate }]).map((entry, index) => <li key={`${entry.status}-${entry.at}-${index}`} className="flex gap-3 text-sm"><CheckCircle2 className="mt-0.5 shrink-0 text-brass" size={16} /><span className="capitalize text-ivory/75">{label(entry.status)} <small className="ml-2 text-ivory/35">{entry.at ? new Date(entry.at).toLocaleString() : ''}</small></span></li>)}</ol></div>
            <p className="mt-6 flex gap-2 border-t border-brass/10 pt-5 text-sm text-ivory/50"><MapPin size={16} className="shrink-0 text-brass" />{order.deliveryZone?.eta || 'The studio will update you when delivery timing is confirmed.'}</p>
          </>}
        </section>
      </div>
    </section>
  </main></PageTransition>;
}
