import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, Banknote, Check, Copy, CreditCard, ImagePlus, MapPin, MessageCircle,
  Minus, PackageCheck, Plus, ShoppingBag, Truck, Upload, X,
} from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import { paymentMethodLabel, renderWhatsAppOrderMessage } from '@/lib/commerceOptions';

const fieldClass = 'min-h-12 w-full border border-brass/15 bg-obsidian px-4 text-sm text-ivory placeholder:text-ivory/25 focus:border-brass/45 focus:outline-none';

export default function CommerceCheckout({
  open, onClose, cart, setCart, user, settings, commerce, formatMoney, onCompleted,
}) {
  const [view, setView] = useState('bag');
  const [zoneId, setZoneId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('mobile_money');
  const [details, setDetails] = useState({
    recipientName: user?.full_name || '', phone: '', addressLine1: '', addressLine2: '',
    city: '', region: '', country: 'Ghana', postalCode: '', customerNote: '',
  });
  const [order, setOrder] = useState(null);
  const [ordering, setOrdering] = useState(false);
  const [error, setError] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState('');
  const [uploadingProof, setUploadingProof] = useState(false);
  const [paymentConfig, setPaymentConfig] = useState(null);
  const [orderAttemptKey, setOrderAttemptKey] = useState(() => crypto.randomUUID());

  const activeZones = commerce.deliveryZones.filter(zone => zone.active !== false);
  const zone = activeZones.find(item => item.id === zoneId);
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * item.qty, 0);
  const deliveryFee = Number(zone?.fee || 0);
  const total = subtotal + deliveryFee;
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  const enabledMethods = useMemo(() => {
    const manual = ['mobile_money', 'bank_transfer', 'pay_on_delivery']
      .filter(method => commerce.paymentMethods?.[method] !== false);
    return paymentConfig?.configured && commerce.paymentMethods?.paystack !== false
      ? ['paystack', ...manual]
      : manual;
  }, [commerce.paymentMethods, paymentConfig]);
  const whatsappNumber = String(commerce.whatsapp?.number || settings.whatsapp_number || '').replace(/\D/g, '');

  useEffect(() => {
    if (!open) return undefined;
    studioClient.payments.config()
      .then(setPaymentConfig)
      .catch(() => setPaymentConfig({ configured: false, provider: 'manual' }));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = event => {
      if (event.key === 'Escape' && !ordering && !uploadingProof) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, ordering, uploadingProof]);

  useEffect(() => {
    if (!enabledMethods.includes(paymentMethod) && enabledMethods[0]) {
      setPaymentMethod(enabledMethods[0]);
    }
  }, [enabledMethods, paymentMethod]);

  const updateQuantity = (id, delta) => setCart(current => current
    .map(item => item.id === id ? { ...item, qty: Math.max(0, item.qty + delta) } : item)
    .filter(item => item.qty > 0));

  const validate = () => {
    if (!user) {
      window.location.assign('/login?redirect=/shop');
      return false;
    }
    if (!zone) return setError('Choose a delivery zone so the correct fee can be added.'), false;
    if (!details.recipientName || !details.phone || !details.addressLine1 || !details.city) {
      return setError('Enter your name, phone number, delivery address, and city.'), false;
    }
    if (!enabledMethods.includes(paymentMethod)) return setError('Choose an available payment method.'), false;
    return true;
  };

  const whatsappUrl = createdOrder => {
    if (!whatsappNumber) return '';
    const message = renderWhatsAppOrderMessage(commerce.whatsapp?.orderMessage, {
      studioName: commerce.storeName || settings.site_name || 'Reigns Atelier',
      trackingCode: createdOrder.trackingCode,
      items: createdOrder.items.map(item => `• ${item.title} × ${item.qty}`).join('\n'),
      deliveryZone: createdOrder.deliveryZone?.name || 'To be confirmed',
      deliveryAddress: [
        createdOrder.shippingAddress?.addressLine1,
        createdOrder.shippingAddress?.addressLine2,
        createdOrder.shippingAddress?.city,
        createdOrder.shippingAddress?.region,
      ].filter(Boolean).join(', '),
      paymentMethod: paymentMethodLabel(createdOrder.paymentMethod),
      subtotal: formatMoney(createdOrder.subtotal),
      deliveryFee: formatMoney(createdOrder.shipping),
      total: formatMoney(createdOrder.total),
      customerName: createdOrder.shippingAddress?.recipientName || details.recipientName,
      customerPhone: createdOrder.shippingAddress?.phone || details.phone,
      customerNote: createdOrder.customerNote ? `Note: ${createdOrder.customerNote}` : '',
    });
    return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
  };

  const launchSecurePayment = async createdOrder => {
    const initialized = await studioClient.payments.initialize(createdOrder.id);
    if (!initialized.authorizationUrl) throw new Error('The secure payment page could not be opened. Please try again.');
    window.location.assign(initialized.authorizationUrl);
  };

  const placeOrder = async ({ continueToWhatsApp = false } = {}) => {
    if (!validate()) return;
    if (continueToWhatsApp && !whatsappNumber) {
      setError('WhatsApp ordering needs a number. Add it in Studio Control → Delivery & Payments → WhatsApp order handoff, or record the order without opening WhatsApp.');
      return;
    }
    setOrdering(true);
    setError('');
    try {
      const created = await studioClient.entities.Order.create({
        items: cart.map(item => ({ productId: item.id, title: item.title, price: item.price, qty: item.qty })),
        total,
        channel: paymentMethod === 'paystack' ? 'paystack' : continueToWhatsApp ? 'whatsapp' : 'manual',
        paymentMethod,
        deliveryMethod: 'delivery',
        deliveryZoneId: zone.id,
        shippingAddress: {
          recipientName: details.recipientName,
          phone: details.phone,
          addressLine1: details.addressLine1,
          addressLine2: details.addressLine2,
          city: details.city,
          region: details.region,
          country: details.country,
          postalCode: details.postalCode,
        },
        customerNote: details.customerNote,
      }, { idempotencyKey: orderAttemptKey });
      setOrder(created);
      setCart([]);
      onCompleted?.(created);
      if (paymentMethod === 'paystack') {
        try {
          await launchSecurePayment(created);
          return;
        } catch (paymentError) {
          setView('confirmed');
          throw new Error(`Your order was recorded, but secure payment did not open: ${paymentError.message}`);
        }
      }
      setView('confirmed');
      if (continueToWhatsApp) {
        const url = whatsappUrl(created);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setOrdering(false);
    }
  };

  const submitProof = async () => {
    if (!proofFile || !order) return;
    setUploadingProof(true);
    setError('');
    try {
      const { file_url, media } = await studioClient.integrations.Core.UploadFile({ file: proofFile });
      const updated = await studioClient.orders.submitPaymentProof(order.id, {
        paymentProofUrl: file_url,
        mediaId: media?.id,
      });
      setOrder(updated);
      setProofFile(null);
      setProofPreview('');
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploadingProof(false);
    }
  };

  const chooseProof = file => {
    if (!file) return;
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    setProofFile(file);
    setProofPreview(URL.createObjectURL(file));
  };

  const close = () => {
    onClose();
    window.setTimeout(() => {
      setView('bag');
      setOrder(null);
      setZoneId('');
      setProofFile(null);
      if (proofPreview) URL.revokeObjectURL(proofPreview);
      setProofPreview('');
      setError('');
      setPaymentConfig(null);
      setOrderAttemptKey(crypto.randomUUID());
    }, 300);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Shopping bag and checkout"
            className="fixed inset-y-0 right-0 z-[80] flex w-full max-w-2xl flex-col overflow-hidden border-l border-brass/15 bg-carbon shadow-2xl"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
          >
            <header className="flex min-h-20 items-center justify-between border-b border-brass/10 px-5 sm:px-7">
              <div className="flex items-center gap-3">
                {view !== 'bag' && view !== 'confirmed' && <button onClick={() => setView('bag')} aria-label="Back to bag" className="flex h-10 w-10 items-center justify-center border border-ivory/10 text-ivory/55"><ArrowLeft size={17} /></button>}
                <div><p className="text-[10px] uppercase tracking-[0.25em] text-brass/60">{view === 'bag' ? 'Your selection' : view === 'checkout' ? 'Secure order details' : 'Order recorded'}</p><h2 className="font-display text-2xl text-ivory">{view === 'bag' ? `Your Bag (${count})` : view === 'checkout' ? 'Complete Your Order' : 'Order Confirmed'}</h2></div>
              </div>
              <button onClick={close} aria-label="Close" className="flex h-11 w-11 items-center justify-center border border-ivory/10 text-ivory/55"><X size={19} /></button>
            </header>

            <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-6 sm:px-7">
              {view === 'bag' && (
                <div>
                  {!cart.length ? <div className="py-24 text-center"><ShoppingBag className="mx-auto text-brass/20" size={42} /><p className="mt-4 text-ivory/35">Your bag is empty.</p></div> : (
                    <div className="space-y-4">
                      {cart.map(item => (
                        <article key={item.id} className="grid grid-cols-[84px_1fr] gap-4 border border-ivory/10 bg-obsidian/55 p-3 sm:grid-cols-[104px_1fr_auto]">
                          <img src={item.imageUrl} alt={item.title} className="h-24 w-full object-cover sm:h-28" />
                          <div className="min-w-0">
                            <h3 className="font-display text-lg text-ivory">{item.title}</h3>
                            <p className="mt-1 text-xs uppercase tracking-wider text-brass/60">{item.type}</p>
                            <div className="mt-4 inline-flex items-center border border-ivory/10">
                              <button onClick={() => updateQuantity(item.id, -1)} className="flex h-9 w-9 items-center justify-center" aria-label={`Decrease ${item.title}`}><Minus size={13} /></button>
                              <span className="w-8 text-center text-sm">{item.qty}</span>
                              <button onClick={() => updateQuantity(item.id, 1)} className="flex h-9 w-9 items-center justify-center" aria-label={`Increase ${item.title}`}><Plus size={13} /></button>
                            </div>
                          </div>
                          <div className="col-span-2 flex items-center justify-between sm:col-span-1 sm:flex-col sm:items-end">
                            <strong className="font-display text-xl text-brass">{formatMoney(item.price * item.qty)}</strong>
                            <button onClick={() => setCart(current => current.filter(candidate => candidate.id !== item.id))} className="text-xs text-ivory/35 hover:text-red-300">Remove</button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {view === 'checkout' && (
                <div className="space-y-6">
                  <section className="border border-brass/10 bg-obsidian/45 p-4 sm:p-5">
                    <div className="flex items-center gap-3"><MapPin className="text-brass" size={19} /><h3 className="font-display text-xl">Customer & delivery details</h3></div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <input value={details.recipientName} onChange={event => setDetails({ ...details, recipientName: event.target.value })} placeholder="Full name *" className={fieldClass} />
                      <input value={details.phone} onChange={event => setDetails({ ...details, phone: event.target.value })} placeholder="Phone number *" className={fieldClass} />
                      <input value={details.addressLine1} onChange={event => setDetails({ ...details, addressLine1: event.target.value })} placeholder="Delivery address *" className={`${fieldClass} sm:col-span-2`} />
                      <input value={details.addressLine2} onChange={event => setDetails({ ...details, addressLine2: event.target.value })} placeholder="Landmark / address line 2" className={`${fieldClass} sm:col-span-2`} />
                      <input value={details.city} onChange={event => setDetails({ ...details, city: event.target.value })} placeholder="City / town *" className={fieldClass} />
                      <input value={details.region} onChange={event => setDetails({ ...details, region: event.target.value })} placeholder="Region" className={fieldClass} />
                    </div>
                  </section>

                  <section className="border border-brass/10 bg-obsidian/45 p-4 sm:p-5">
                    <div className="flex items-center gap-3"><Truck className="text-brass" size={19} /><h3 className="font-display text-xl">Delivery zone</h3></div>
                    <p className="mt-2 text-sm text-ivory/40">Choose one zone. Its fee is added immediately.</p>
                    <div className="mt-4 grid gap-2">
                      {activeZones.map(item => (
                        <button key={item.id} onClick={() => setZoneId(item.id)} className={`flex min-h-16 items-center justify-between border p-4 text-left ${zoneId === item.id ? 'border-brass bg-brass/10' : 'border-ivory/10 bg-carbon'}`}>
                          <span><strong className="block text-ivory">{item.name}</strong><small className="text-ivory/35">{item.eta || 'Delivery arranged by the studio'}</small></span>
                          <span className="text-right text-sm text-brass">{formatMoney(item.fee)}{zoneId === item.id && <Check className="ml-auto mt-1" size={15} />}</span>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="border border-brass/10 bg-obsidian/45 p-4 sm:p-5">
                    <div className="flex items-center gap-3"><CreditCard className="text-brass" size={19} /><h3 className="font-display text-xl">Payment method</h3></div>
                    <div className="mt-4 grid gap-2">
                      {enabledMethods.map(method => (
                        <button key={method} onClick={() => setPaymentMethod(method)} className={`flex min-h-16 items-center gap-4 border p-4 text-left ${paymentMethod === method ? 'border-brass bg-brass/10' : 'border-ivory/10 bg-carbon'}`}>
                          {method === 'pay_on_delivery' ? <Truck size={19} /> : method === 'bank_transfer' ? <Banknote size={19} /> : <CreditCard size={19} />}
                          <span><strong className="block text-ivory">{paymentMethodLabel(method)}</strong><small className="text-ivory/35">{method === 'paystack' ? 'Choose Mobile Money or card securely. Authorize MoMo on your phone; your PIN is never entered on this website.' : method === 'pay_on_delivery' ? commerce.payOnDeliveryNote : 'Order now, then complete and confirm payment manually.'}</small></span>
                          {paymentMethod === method && <Check className="ml-auto text-brass" size={17} />}
                        </button>
                      ))}
                    </div>
                  </section>

                  <textarea value={details.customerNote} onChange={event => setDetails({ ...details, customerNote: event.target.value })} placeholder="Order note (optional)" rows={3} className={`${fieldClass} py-3`} />
                </div>
              )}

              {view === 'confirmed' && order && (
                <div>
                  <div className="border border-green-400/20 bg-green-400/5 p-6 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center bg-brass text-obsidian"><PackageCheck size={30} /></div>
                    <h3 className="mt-5 font-display text-3xl text-ivory">Thank you. Your order is recorded.</h3>
                    <p className="mt-2 text-sm text-ivory/45">Keep this tracking code for payment and delivery updates.</p>
                    <div className="mt-5 border border-brass/15 bg-obsidian p-4"><span className="text-[10px] uppercase tracking-widest text-ivory/35">Tracking code</span><strong className="mt-1 block font-display text-3xl tracking-wider text-brass">{order.trackingCode}</strong><button onClick={() => navigator.clipboard.writeText(order.trackingCode)} className="mt-2 inline-flex items-center gap-2 text-xs text-ivory/45"><Copy size={13} /> Copy code</button></div>
                  </div>

                  <div className="mt-5 border border-brass/10 bg-obsidian/45 p-5">
                    <div className="space-y-2 text-sm"><p className="flex justify-between text-ivory/50"><span>Products</span><span>{formatMoney(order.subtotal)}</span></p><p className="flex justify-between text-ivory/50"><span>Delivery — {order.deliveryZone?.name}</span><span>{formatMoney(order.shipping)}</span></p><p className="flex justify-between border-t border-brass/10 pt-3 font-display text-xl text-brass"><span>Total</span><span>{formatMoney(order.total)}</span></p></div>
                    <p className="mt-4 text-sm text-ivory/50">Payment: <strong className="text-ivory">{paymentMethodLabel(order.paymentMethod)}</strong></p>
                    {order.paymentMethod === 'mobile_money' && commerce.mobileMoney.number && <div className="mt-4 border border-ivory/10 p-4 text-sm text-ivory/55"><p><strong className="text-ivory">{commerce.mobileMoney.network}</strong></p><p>{commerce.mobileMoney.number} — {commerce.mobileMoney.accountName}</p><p className="mt-2 text-xs">{commerce.mobileMoney.instructions}</p></div>}
                    {order.paymentMethod === 'bank_transfer' && commerce.bankTransfer.accountNumber && <div className="mt-4 border border-ivory/10 p-4 text-sm text-ivory/55"><p><strong className="text-ivory">{commerce.bankTransfer.bankName}</strong></p><p>{commerce.bankTransfer.accountNumber} — {commerce.bankTransfer.accountName}</p><p className="mt-2 text-xs">{commerce.bankTransfer.instructions}</p></div>}
                    {order.paymentMethod === 'pay_on_delivery' && <p className="mt-4 border border-ivory/10 p-4 text-sm text-ivory/55">{commerce.payOnDeliveryNote}</p>}
                  </div>

                  {['mobile_money', 'bank_transfer'].includes(order.paymentMethod) && order.proofStatus !== 'submitted' && (
                    <div className="mt-5 border border-brass/10 bg-obsidian/45 p-5">
                      <div className="flex items-center gap-3"><ImagePlus className="text-brass" size={19} /><h3 className="font-display text-xl">Upload payment proof</h3></div>
                      <p className="mt-2 text-sm text-ivory/40">Upload a clear screenshot after payment. It will appear with this order in Studio Control.</p>
                      {proofPreview && <img src={proofPreview} alt="Selected payment proof" className="mt-4 max-h-64 w-full object-contain border border-ivory/10 bg-black" />}
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 border border-brass/25 text-sm text-brass"><ImagePlus size={16} /> Select screenshot<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={event => chooseProof(event.target.files?.[0])} /></label>
                        <button onClick={submitProof} disabled={!proofFile || uploadingProof} className="flex min-h-12 items-center justify-center gap-2 bg-brass text-sm text-obsidian disabled:opacity-35"><Upload size={16} /> {uploadingProof ? 'Uploading…' : 'Upload proof'}</button>
                      </div>
                    </div>
                  )}
                  {order.proofStatus === 'submitted' && <p className="mt-5 border border-green-400/20 bg-green-400/5 p-4 text-sm text-green-200">Payment proof received. The studio will review it and update your order.</p>}
                </div>
              )}

              {error && <p role="alert" className="mt-5 border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-300">{error}</p>}
            </div>

            <footer className="border-t border-brass/10 bg-carbon px-5 py-5 sm:px-7">
              {view === 'bag' && cart.length > 0 && <><div className="mb-4 flex items-end justify-between"><span className="text-sm text-ivory/40">Subtotal</span><strong className="font-display text-3xl text-brass">{formatMoney(subtotal)}</strong></div><button onClick={() => setView('checkout')} className="flex min-h-[52px] w-full items-center justify-center gap-2 bg-brass text-sm uppercase tracking-widest text-obsidian">Continue to checkout <ArrowLeft className="rotate-180" size={16} /></button><button onClick={close} className="mt-2 min-h-11 w-full border border-ivory/10 text-sm text-ivory/50">Continue shopping</button></>}
              {view === 'checkout' && (
                <>
                  <div className="mb-4 grid grid-cols-3 gap-2 border border-ivory/10 p-3 text-center text-xs">
                    <span className="text-ivory/35">Subtotal<strong className="mt-1 block text-ivory">{formatMoney(subtotal)}</strong></span>
                    <span className="text-ivory/35">Delivery<strong className="mt-1 block text-ivory">{formatMoney(deliveryFee)}</strong></span>
                    <span className="text-ivory/35">Total<strong className="mt-1 block text-brass">{formatMoney(total)}</strong></span>
                  </div>
                  {paymentMethod === 'paystack' ? (
                    <button onClick={() => placeOrder()} disabled={ordering} className="flex min-h-[52px] w-full items-center justify-center gap-2 bg-brass text-sm uppercase tracking-widest text-obsidian disabled:opacity-50">
                      <CreditCard size={17} /> {ordering ? 'Opening secure payment…' : 'Pay securely now'}
                    </button>
                  ) : (
                    <>
                      <button onClick={() => placeOrder({ continueToWhatsApp: true })} disabled={ordering || (!settings.__loaded && !commerce.whatsapp?.number)} className="flex min-h-[52px] w-full items-center justify-center gap-2 bg-[#25D366] text-sm uppercase tracking-widest text-white disabled:opacity-50">
                        <MessageCircle size={17} /> {ordering ? 'Recording order…' : !settings.__loaded && !commerce.whatsapp?.number ? 'Loading WhatsApp…' : 'Place order & continue on WhatsApp'}
                      </button>
                      <button onClick={() => placeOrder()} disabled={ordering} className="mt-2 min-h-11 w-full border border-brass/20 text-sm text-brass">Place order without opening WhatsApp</button>
                    </>
                  )}
                </>
              )}
              {view === 'confirmed' && order && (
                <>
                  {order.paymentMethod === 'paystack' && order.paymentStatus !== 'paid' ? (
                    <button onClick={() => launchSecurePayment(order).catch(paymentError => setError(paymentError.message))} className="flex min-h-[52px] w-full items-center justify-center gap-2 bg-brass text-sm uppercase tracking-widest text-obsidian"><CreditCard size={17} /> Continue secure payment</button>
                  ) : whatsappUrl(order) ? (
                    <a href={whatsappUrl(order)} target="_blank" rel="noopener noreferrer" className="flex min-h-[52px] w-full items-center justify-center gap-2 bg-[#25D366] text-sm uppercase tracking-widest text-white"><MessageCircle size={17} /> Send order update on WhatsApp</a>
                  ) : (
                    <p className="border border-brass/15 p-3 text-center text-xs text-ivory/45">Your order is safely recorded. The studio will contact you using the details supplied.</p>
                  )}
                  <button onClick={close} className="mt-2 min-h-11 w-full border border-brass/20 text-sm text-brass">Continue shopping</button>
                </>
              )}
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
