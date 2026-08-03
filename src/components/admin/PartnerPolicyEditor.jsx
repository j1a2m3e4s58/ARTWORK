import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import FileUploadField from './FileUploadField';

const defaults = {
  partner_policy_title: 'Marketplace Partnership Policy',
  partner_policy_version: '1.0',
  partner_policy_commission: 'The studio commission is agreed during review and is deducted from each completed sale before payout.',
  partner_policy_text: 'Only original, lawful and accurately described items may be submitted. The seller remains responsible for ownership, quality and fulfilment information. Reigns Atelier reviews every listing, records sales and payouts, and may pause a listing that breaches these terms.',
  partner_policy_pdf: '',
};

export default function PartnerPolicyEditor() {
  const [records, setRecords] = useState({});
  const [form, setForm] = useState(defaults);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    studioClient.entities.SiteContent.filter({ page: 'PartnerPolicy' }, '-updated_date', 50).then(rows => {
      const map = Object.fromEntries(rows.map(item => [item.key, item]));
      setRecords(map);
      setForm({ ...defaults, ...Object.fromEntries(rows.map(item => [item.key, item.value])) });
    });
  }, []);

  const save = async () => {
    const nextRecords = { ...records };
    for (const [key, value] of Object.entries(form)) {
      nextRecords[key] = records[key]
        ? await studioClient.entities.SiteContent.update(records[key].id, { value })
        : await studioClient.entities.SiteContent.create({ key, value, page: 'PartnerPolicy', group: 'Partner policy' });
    }
    setRecords(nextRecords);
    setNotice('Policy saved. New applications will record this version and wording.');
    window.dispatchEvent(new Event('atelier:content-updated'));
  };

  return <section className="mb-8 border border-brass/15 bg-carbon p-4 sm:p-6">
    <p className="text-[10px] uppercase tracking-[.28em] text-brass">Terms shown before application</p>
    <h2 className="mt-2 font-display text-3xl text-ivory">Partner policy & commission disclosure</h2>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <Field label="Policy title" value={form.partner_policy_title} onChange={event => setForm({ ...form, partner_policy_title: event.target.value })} />
      <Field label="Version" value={form.partner_policy_version} onChange={event => setForm({ ...form, partner_policy_version: event.target.value })} />
    </div>
    <label className="mt-4 block text-xs uppercase tracking-wider text-ivory/45">Commission explanation
      <textarea rows={3} value={form.partner_policy_commission} onChange={event => setForm({ ...form, partner_policy_commission: event.target.value })} className="mt-2 w-full border border-brass/20 bg-obsidian p-3 text-sm normal-case leading-6 text-ivory" />
    </label>
    <label className="mt-4 block text-xs uppercase tracking-wider text-ivory/45">Full policy text
      <textarea rows={7} value={form.partner_policy_text} onChange={event => setForm({ ...form, partner_policy_text: event.target.value })} className="mt-2 w-full border border-brass/20 bg-obsidian p-3 text-sm normal-case leading-6 text-ivory" />
    </label>
    <div className="mt-4"><FileUploadField label="Optional policy PDF" value={form.partner_policy_pdf} onChange={partner_policy_pdf => setForm({ ...form, partner_policy_pdf })} accept="application/pdf" purpose="partner-policy" /></div>
    <button onClick={save} className="mt-5 inline-flex min-h-11 items-center gap-2 bg-brass px-5 text-xs uppercase tracking-widest text-obsidian"><Save size={15} />Save policy</button>
    {notice && <p className="mt-3 text-sm text-green-300">{notice}</p>}
  </section>;
}

function Field({ label, ...props }) {
  return <label className="text-xs uppercase tracking-wider text-ivory/45">{label}<input {...props} className="mt-2 min-h-11 w-full border border-brass/20 bg-obsidian px-3 text-sm normal-case text-ivory" /></label>;
}
