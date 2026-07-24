import { useEffect, useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { studioClient } from '@/api/studioClient';

const statuses = ['pending', 'confirmed', 'in_progress', 'ready', 'completed', 'cancelled'];

export default function OrdersTab() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    studioClient.entities.Order.list('-created_date', 100).then(setOrders).catch(loadError => setError(loadError.message));
  }, []);
  const update = async (order, status) => {
    try {
      const updated = await studioClient.entities.Order.update(order.id, { status });
      setOrders(items => items.map(item => item.id === order.id ? updated : item));
    } catch (updateError) {
      setError(updateError.message);
    }
  };
  return (
    <div>
      <h1 className="font-display text-4xl text-ivory">Orders</h1>
      <p className="mb-8 mt-2 text-sm text-ivory/40">Orders initiated through the shop, including WhatsApp fulfilment.</p>
      {error && <p role="alert" className="mb-4 text-sm text-red-300">{error}</p>}
      {!orders.length ? <div className="border border-brass/10 py-16 text-center text-ivory/30"><PackageCheck className="mx-auto mb-3" />No orders yet.</div> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {orders.map(order => (
            <article key={order.id} className="border border-brass/10 bg-carbon p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-sm text-brass">{order.accountEmail}</p><p className="mt-1 text-xs text-ivory/30">{new Date(order.created_date).toLocaleString()}</p></div>
                <select value={order.status} onChange={event => update(order, event.target.value)} className="border border-brass/20 bg-obsidian p-2 text-xs text-ivory">
                  {statuses.map(status => <option key={status}>{status}</option>)}
                </select>
              </div>
              <div className="my-4 space-y-2">
                {order.items.map(item => <div key={item.productId} className="flex justify-between gap-3 text-sm text-ivory/55"><span>{item.title} × {item.qty}</span><span>{order.currency || 'GHS'} {(item.price * item.qty).toLocaleString()}</span></div>)}
              </div>
              <div className="flex justify-between border-t border-brass/10 pt-3"><span className="text-xs uppercase tracking-wider text-ivory/30">Total</span><strong className="font-display text-xl text-brass">${Number(order.total).toFixed(2)}</strong></div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
