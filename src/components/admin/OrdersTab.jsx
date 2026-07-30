import { useEffect, useState } from 'react';
import { ExternalLink, Image, MessageCircle, PackageCheck } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import ResponsiveSelect from '@/components/ResponsiveSelect';
import { paymentMethodLabel } from '@/lib/commerceOptions';
import { useSettings } from '@/hooks/useSettings';

const statuses = ['delivery_quote_required', 'awaiting_payment', 'pending', 'confirmed', 'in_progress', 'ready', 'shipped', 'fulfilled', 'completed', 'cancelled', 'refunded'];
const paymentStatuses = [
  { value: 'awaiting_payment', label: 'Awaiting payment' },
  { value: 'quote_required', label: 'Delivery quote required' },
  { value: 'pay_on_delivery', label: 'Pay on delivery' },
  { value: 'payment_submitted', label: 'Proof submitted' },
  { value: 'paid', label: 'Paid / confirmed' },
  { value: 'failed', label: 'Payment rejected' },
  { value: 'refunded', label: 'Refunded' },
];

export default function OrdersTab() {
  const settings = useSettings();
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const load = () => studioClient.entities.Order.list('-created_date', 150).then(setOrders).catch(loadError => setError(loadError.message));
  useEffect(() => { load(); }, []);

  const update = async (order, changes) => {
    setError('');
    try {
      const updated = await studioClient.entities.Order.update(order.id, changes);
      setOrders(items => items.map(item => item.id === order.id ? updated : item));
    } catch (updateError) {
      setError(updateError.message);
    }
  };
  const formatMoney = (value, currency = 'GHS') => new Intl.NumberFormat('en-GH', { style: 'currency', currency }).format(Number(value) || 0);
  const applyQuote = async (order, value) => {
    const shipping = Math.max(0, Number(value) || 0);
    await update(order, {
      shipping,
      total: Number(order.subtotal || 0) + shipping,
      deliveryZone: { ...(order.deliveryZone || {}), name: 'Custom delivery quote', fee: shipping, eta: 'Confirmed by studio' },
      deliveryQuoteRequested: false,
      paymentMethod: 'paystack',
      paymentStatus: 'awaiting_payment',
      status: 'awaiting_payment',
    });
  };
  const whatsappOrderUrl = order => {
    const number = String(order.shippingAddress?.phone || settings.whatsapp_number || '').replace(/\D/g, '');
    const message = `Hello ${order.shippingAddress?.recipientName || ''}, this is Reigns Atelier about order ${order.trackingCode || order.id}.`;
    return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : '';
  };

  return (
    <div>
      <h1 className="font-display text-4xl text-ivory">Customer Orders</h1>
      <p className="mb-8 mt-2 text-sm text-ivory/40">Review delivery, manual payment, uploaded proof, WhatsApp fulfilment, and order progress.</p>
      {error && <p role="alert" className="mb-4 border border-red-400/20 p-3 text-sm text-red-300">{error}</p>}
      {!orders.length ? <div className="border border-brass/10 py-16 text-center text-ivory/30"><PackageCheck className="mx-auto mb-3" />No orders yet.</div> : (
        <div className="grid gap-4 xl:grid-cols-2">
          {orders.map(order => (
            <article key={order.id} className="min-w-0 border border-brass/10 bg-carbon p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-display text-xl text-brass">{order.trackingCode || `Order ${order.id.slice(0, 8)}`}</p>
                  <p className="truncate text-sm text-ivory/70">{order.shippingAddress?.recipientName || order.accountEmail}</p>
                  <p className="text-xs text-ivory/35">{order.accountEmail} {order.shippingAddress?.phone && `• ${order.shippingAddress.phone}`}</p>
                  <p className="mt-1 text-xs text-ivory/25">{new Date(order.created_date).toLocaleString()}</p>
                </div>
                <div className="grid w-full gap-2 sm:w-48">
                  <ResponsiveSelect label="Order status" value={order.status} onChange={status => update(order, { status })} options={statuses} className="text-xs" />
                  <ResponsiveSelect label="Payment status" value={order.paymentStatus} onChange={paymentStatus => update(order, { paymentStatus, proofStatus: paymentStatus === 'paid' ? 'approved' : order.proofStatus })} options={paymentStatuses} className="text-xs" />
                </div>
              </div>

              <div className="my-4 space-y-2 border-y border-brass/10 py-4">
                {(order.items || []).map(item => <div key={item.productId} className="flex justify-between gap-3 text-sm text-ivory/55"><span>{item.title} × {item.qty}</span><span>{formatMoney(item.price * item.qty, order.currency)}</span></div>)}
              </div>

              <div className="grid gap-3 text-xs sm:grid-cols-2">
                <div className="border border-ivory/5 bg-obsidian/45 p-3">
                  <span className="uppercase tracking-wider text-ivory/25">Delivery</span>
                  <strong className="mt-1 block text-sm text-ivory">{order.deliveryZone?.name || order.deliveryMethod}</strong>
                  <p className="mt-1 text-ivory/40">{order.shippingAddress?.addressLine1}{order.shippingAddress?.city ? `, ${order.shippingAddress.city}` : ''}</p>
                  <p className="text-brass">{formatMoney(order.shipping, order.currency)}</p>
                </div>
                <div className="border border-ivory/5 bg-obsidian/45 p-3">
                  <span className="uppercase tracking-wider text-ivory/25">Payment</span>
                  <strong className="mt-1 block text-sm text-ivory">{paymentMethodLabel(order.paymentMethod || 'mobile_money')}</strong>
                  <p className="mt-1 text-ivory/40">Proof: {String(order.proofStatus || 'not submitted').replaceAll('_', ' ')}</p>
                  {order.paymentProofUrl && <a href={order.paymentProofUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-brass"><Image size={13} /> View payment proof <ExternalLink size={11} /></a>}
                </div>
              </div>

              {order.paymentStatus === 'quote_required' && <div className="mt-3 border border-brass/25 bg-brass/5 p-3">
                <p className="text-xs text-ivory/55">This customer selected a location outside the published zones. Enter the delivery fee, then the customer can return to their account and continue securely through Paystack.</p>
                <div className="mt-3 flex flex-col gap-2 min-[390px]:flex-row">
                  <input id={`quote-${order.id}`} type="number" min="0" step="0.01" placeholder="Delivery fee (GHS)" className="min-h-11 flex-1 border border-brass/20 bg-obsidian px-3 text-sm text-ivory" />
                  <button onClick={() => applyQuote(order, document.getElementById(`quote-${order.id}`)?.value)} className="min-h-11 bg-brass px-4 text-xs font-medium uppercase tracking-wider text-obsidian">Approve quote</button>
                </div>
              </div>}

              {order.customerNote && <p className="mt-3 border-l-2 border-brass/30 pl-3 text-xs text-ivory/45">{order.customerNote}</p>}
              <div className="mt-4 flex flex-col gap-3 border-t border-brass/10 pt-4 min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between">
                <div><span className="text-[10px] uppercase tracking-wider text-ivory/30">Order total</span><strong className="block font-display text-2xl text-brass">{formatMoney(order.total, order.currency)}</strong></div>
                {whatsappOrderUrl(order) && <a href={whatsappOrderUrl(order)} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center gap-2 bg-[#25D366] px-4 text-sm text-white"><MessageCircle size={16} /> Update on WhatsApp</a>}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
