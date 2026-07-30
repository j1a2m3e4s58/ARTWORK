import { useEffect, useState } from 'react';
import { CreditCard, MapPin, MessageCircle, Plus, Save, Trash2 } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import { DEFAULT_COMMERCE_OPTIONS, parseCommerceOptions, serializeCommerceOptions } from '@/lib/commerceOptions';

const inputClass = 'min-h-11 w-full border border-brass/15 bg-obsidian px-3 text-sm text-ivory placeholder:text-ivory/25 focus:border-brass/40 focus:outline-none';

export default function CommerceSettingsTab() {
  const [record, setRecord] = useState(null);
  const [form, setForm] = useState(DEFAULT_COMMERCE_OPTIONS);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    studioClient.entities.SiteContent.filter({ key: 'commerce_settings', page: 'Commerce' })
      .then(records => {
        const latest = [...records].sort((a, b) => new Date(a.updated_date || a.created_date || 0) - new Date(b.updated_date || b.created_date || 0)).at(-1);
        setRecord(latest || null);
        setForm(parseCommerceOptions(latest?.value));
      })
      .catch(loadError => setError(loadError.message));
  }, []);

  const updateNested = (group, key, value) => setForm(current => ({
    ...current,
    [group]: { ...current[group], [key]: value },
  }));
  const updateZone = (index, patch) => setForm(current => ({
    ...current,
    deliveryZones: current.deliveryZones.map((zone, zoneIndex) => zoneIndex === index ? { ...zone, ...patch } : zone),
  }));
  const addZone = () => setForm(current => ({
    ...current,
    deliveryZones: [...current.deliveryZones, { id: `zone-${Date.now()}`, name: '', fee: 0, eta: '', active: true }],
  }));
  const removeZone = index => setForm(current => ({
    ...current,
    deliveryZones: current.deliveryZones.filter((_, zoneIndex) => zoneIndex !== index),
  }));

  const save = async () => {
    setError('');
    setNotice('');
    try {
      const payload = { key: 'commerce_settings', page: 'Commerce', group: 'checkout', value: serializeCommerceOptions(form) };
      const saved = record
        ? await studioClient.entities.SiteContent.update(record.id, payload)
        : await studioClient.entities.SiteContent.create(payload);
      setRecord(saved);
      setForm(parseCommerceOptions(saved.value));
      window.dispatchEvent(new Event('atelier:content-updated'));
      setNotice('Delivery, payment, and WhatsApp checkout settings saved.');
    } catch (saveError) {
      setError(saveError.message);
    }
  };

  return (
    <div className="max-w-5xl">
      <h1 className="font-display text-4xl text-ivory">Delivery & Payments</h1>
      <p className="mt-2 text-sm text-ivory/40">Control delivery zones, fees, manual payment instructions, and checkout wording without changing code.</p>
      {(notice || error) && <p role="status" className={`mt-5 border p-3 text-sm ${error ? 'border-red-400/20 text-red-300' : 'border-green-400/20 text-green-300'}`}>{error || notice}</p>}

      <section className="mt-8 border border-brass/10 bg-carbon p-4 sm:p-6">
        <div className="flex items-center gap-3"><MapPin className="text-brass" size={20} /><h2 className="font-display text-2xl text-ivory">Delivery zones</h2></div>
        <p className="mt-2 text-sm text-ivory/35">The selected fee is added to the product subtotal automatically.</p>
        <div className="mt-5 space-y-3">
          {form.deliveryZones.map((zone, index) => (
            <div key={zone.id || index} className="grid min-w-0 gap-3 border border-ivory/5 bg-obsidian/60 p-3 sm:grid-cols-[1.2fr_.65fr_1fr_auto] sm:items-end">
              <label className="text-xs uppercase tracking-wider text-ivory/35">Zone name
                <input value={zone.name} onChange={event => updateZone(index, { name: event.target.value })} placeholder="e.g. Accra" className={`${inputClass} mt-1`} />
              </label>
              <label className="text-xs uppercase tracking-wider text-ivory/35">Fee (GHS)
                <input type="number" min="0" step="0.01" value={zone.fee} onChange={event => updateZone(index, { fee: event.target.value })} className={`${inputClass} mt-1`} />
              </label>
              <label className="text-xs uppercase tracking-wider text-ivory/35">Estimated time
                <input value={zone.eta} onChange={event => updateZone(index, { eta: event.target.value })} placeholder="1–3 working days" className={`${inputClass} mt-1`} />
              </label>
              <div className="flex min-h-11 items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-ivory/55"><input type="checkbox" checked={zone.active} onChange={event => updateZone(index, { active: event.target.checked })} className="accent-brass" /> Active</label>
                <button type="button" onClick={() => removeZone(index)} aria-label={`Remove ${zone.name || 'zone'}`} className="flex h-11 w-11 items-center justify-center border border-red-400/15 text-red-300"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addZone} className="mt-4 flex min-h-11 items-center gap-2 border border-brass/25 px-4 text-sm text-brass"><Plus size={15} /> Add delivery zone</button>
      </section>

      <section className="mt-6 border border-brass/10 bg-carbon p-4 sm:p-6">
        <div className="flex items-center gap-3"><MessageCircle className="text-[#25D366]" size={20} /><h2 className="font-display text-2xl text-ivory">WhatsApp order handoff</h2></div>
        <p className="mt-2 text-sm leading-relaxed text-ivory/40">This number and message are used by the green checkout button. If the number is blank, checkout falls back to the global WhatsApp number in Site Settings.</p>
        <label className="mt-5 block text-xs uppercase tracking-wider text-ivory/35">Order WhatsApp number
          <input value={form.whatsapp.number} onChange={event => updateNested('whatsapp', 'number', event.target.value)} placeholder="+233 55 000 0000" className={`${inputClass} mt-1`} />
        </label>
        <label className="mt-4 block text-xs uppercase tracking-wider text-ivory/35">Order message template
          <textarea value={form.whatsapp.orderMessage} onChange={event => updateNested('whatsapp', 'orderMessage', event.target.value)} rows={10} className={`${inputClass} mt-1 py-3 font-mono normal-case tracking-normal`} />
        </label>
        <p className="mt-3 break-words text-xs leading-relaxed text-ivory/35">
          Available placeholders: {'{studioName}'}, {'{trackingCode}'}, {'{items}'}, {'{deliveryZone}'}, {'{deliveryAddress}'}, {'{paymentMethod}'}, {'{subtotal}'}, {'{deliveryFee}'}, {'{total}'}, {'{customerName}'}, {'{customerPhone}'}, {'{customerNote}'}.
        </p>
      </section>

      <section className="mt-6 border border-brass/10 bg-carbon p-4 sm:p-6">
        <div className="flex items-center gap-3"><CreditCard className="text-brass" size={20} /><h2 className="font-display text-2xl text-ivory">Manual payment methods</h2></div>
        <div className="mt-5 border border-brass/15 bg-brass/5 p-4">
          <label className="flex items-start gap-3 text-sm text-ivory">
            <input type="checkbox" checked={form.paymentMethods.paystack !== false} onChange={event => updateNested('paymentMethods', 'paystack', event.target.checked)} className="mt-1 accent-brass" />
            <span><strong className="block text-brass">Show secure online payment when Paystack is connected</strong><small className="mt-1 block leading-relaxed text-ivory/40">Customers choose Mobile Money or card in Paystack’s secure checkout. Their network sends the authorization prompt to their phone; this website never asks for or stores their MoMo PIN.</small></span>
          </label>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="border border-ivory/5 bg-obsidian/60 p-4">
            <label className="flex items-center gap-2 text-sm text-ivory"><input type="checkbox" checked={form.paymentMethods.mobile_money} onChange={event => updateNested('paymentMethods', 'mobile_money', event.target.checked)} className="accent-brass" /> Accept Mobile Money</label>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input value={form.mobileMoney.network} onChange={event => updateNested('mobileMoney', 'network', event.target.value)} placeholder="Network" className={inputClass} />
              <input value={form.mobileMoney.number} onChange={event => updateNested('mobileMoney', 'number', event.target.value)} placeholder="MoMo number" className={inputClass} />
              <input value={form.mobileMoney.accountName} onChange={event => updateNested('mobileMoney', 'accountName', event.target.value)} placeholder="Account name" className={`${inputClass} sm:col-span-2`} />
              <textarea value={form.mobileMoney.instructions} onChange={event => updateNested('mobileMoney', 'instructions', event.target.value)} placeholder="Instructions" rows={3} className={`${inputClass} py-3 sm:col-span-2`} />
            </div>
          </div>
          <div className="border border-ivory/5 bg-obsidian/60 p-4">
            <label className="flex items-center gap-2 text-sm text-ivory"><input type="checkbox" checked={form.paymentMethods.bank_transfer} onChange={event => updateNested('paymentMethods', 'bank_transfer', event.target.checked)} className="accent-brass" /> Accept bank transfer</label>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input value={form.bankTransfer.bankName} onChange={event => updateNested('bankTransfer', 'bankName', event.target.value)} placeholder="Bank name" className={inputClass} />
              <input value={form.bankTransfer.accountName} onChange={event => updateNested('bankTransfer', 'accountName', event.target.value)} placeholder="Account name" className={inputClass} />
              <input value={form.bankTransfer.accountNumber} onChange={event => updateNested('bankTransfer', 'accountNumber', event.target.value)} placeholder="Account number" className={inputClass} />
              <input value={form.bankTransfer.branch} onChange={event => updateNested('bankTransfer', 'branch', event.target.value)} placeholder="Branch" className={inputClass} />
              <textarea value={form.bankTransfer.instructions} onChange={event => updateNested('bankTransfer', 'instructions', event.target.value)} placeholder="Instructions" rows={3} className={`${inputClass} py-3 sm:col-span-2`} />
            </div>
          </div>
        </div>
        <div className="mt-5 border border-ivory/5 bg-obsidian/60 p-4">
          <label className="flex items-center gap-2 text-sm text-ivory"><input type="checkbox" checked={form.paymentMethods.pay_on_delivery} onChange={event => updateNested('paymentMethods', 'pay_on_delivery', event.target.checked)} className="accent-brass" /> Allow pay on delivery</label>
          <textarea value={form.payOnDeliveryNote} onChange={event => setForm(current => ({ ...current, payOnDeliveryNote: event.target.value }))} rows={3} className={`${inputClass} mt-3 py-3`} />
        </div>
      </section>

      <section className="mt-6 grid gap-4 border border-brass/10 bg-carbon p-4 sm:grid-cols-2 sm:p-6">
        <label className="text-xs uppercase tracking-wider text-ivory/35">Store name
          <input value={form.storeName} onChange={event => setForm(current => ({ ...current, storeName: event.target.value }))} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs uppercase tracking-wider text-ivory/35">Currency
          <input value={form.currency} onChange={event => setForm(current => ({ ...current, currency: event.target.value.toUpperCase() }))} maxLength={3} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs uppercase tracking-wider text-ivory/35 sm:col-span-2">Store introduction
          <textarea value={form.storeSubtitle} onChange={event => setForm(current => ({ ...current, storeSubtitle: event.target.value }))} rows={2} className={`${inputClass} mt-1 py-3`} />
        </label>
        <label className="text-xs uppercase tracking-wider text-ivory/35 sm:col-span-2">Checkout note
          <textarea value={form.checkoutNote} onChange={event => setForm(current => ({ ...current, checkoutNote: event.target.value }))} rows={2} className={`${inputClass} mt-1 py-3`} />
        </label>
      </section>

      <button type="button" onClick={save} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 bg-brass px-5 text-sm uppercase tracking-widest text-obsidian sm:w-auto"><Save size={16} /> Save delivery & payment settings</button>
    </div>
  );
}
