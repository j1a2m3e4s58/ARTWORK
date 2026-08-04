import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, Save, XCircle } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import ResponsiveSelect from '@/components/ResponsiveSelect';

const fields = [
  ['internship_title', 'Page title', 'Learn inside the atelier'],
  ['internship_subtitle', 'Introductory text', 'A thoughtful placement for emerging creatives who want to learn from real studio work, practice and process.'],
  ['internship_eligibility', 'Eligibility text', 'Students, recent graduates, and early-career creatives are welcome to apply.'],
  ['internship_noLetter', 'No-letter guidance', 'No official internship letter yet? Apply anyway. Tell us your school, availability and why you would like to learn here. We can discuss the next step with you.'],
  ['internship_letterLabel', 'Letter upload label', 'Upload internship letter (optional)'],
];

const statusOptions = [
  { value: 'received', label: 'Received' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
];

export default function InternshipsTab() {
  const [applications, setApplications] = useState([]);
  const [records, setRecords] = useState([]);
  const [values, setValues] = useState(Object.fromEntries(fields.map(([key, , value]) => [key, value])));
  const [notice, setNotice] = useState('');
  const [updatingId, setUpdatingId] = useState('');

  const load = async () => {
    const [apps, content] = await Promise.all([
      studioClient.entities.InternshipApplication.list('-created_date', 100),
      studioClient.entities.SiteContent.filter({ page: 'Internships' }),
    ]);
    setApplications(apps);
    setRecords(content);
    setValues(current => ({
      ...current,
      ...Object.fromEntries(content.map(item => [item.key, item.value])),
    }));
  };

  useEffect(() => {
    load().catch(() => setNotice('Unable to load internship records.'));
  }, []);

  const save = async () => {
    await Promise.all(fields.map(async ([key, label]) => {
      const existing = records.find(item => item.key === key);
      const payload = { key, label, value: values[key], page: 'Internships', group: 'Internships' };
      return existing
        ? studioClient.entities.SiteContent.update(existing.id, payload)
        : studioClient.entities.SiteContent.create(payload);
    }));
    setNotice('Programme text saved.');
    window.dispatchEvent(new Event('atelier:content-updated'));
    await load();
  };

  const updateStatus = async (application, status) => {
    setUpdatingId(application.id);
    setNotice('');
    try {
      const saved = await studioClient.entities.InternshipApplication.update(application.id, { status });
      setApplications(current => current.map(item => item.id === saved.id ? saved : item));
      setNotice(['accepted', 'approved'].includes(status)
        ? saved.approvalDelivery?.error
          ? 'Application approved. The customer update is queued for retry.'
          : 'Application approved. Customer message, email, and push update prepared.'
        : `Application marked ${status}.`);
    } catch (error) {
      setNotice(error.message || 'Unable to update this application. Please try again.');
    } finally {
      setUpdatingId('');
    }
  };

  return (
    <div className="min-w-0">
      <h1 className="mb-2 font-display text-3xl text-ivory sm:text-4xl">Internships</h1>
      <p className="mb-7 text-sm text-ivory/45">
        Manage the public programme and review every application, including optional internship letters.
      </p>
      {notice && <p className="mb-4 text-sm text-brass">{notice}</p>}

      <section className="mb-10 grid min-w-0 gap-4 border border-brass/15 bg-carbon p-4 sm:p-5">
        {fields.map(([key, label]) => (
          <label key={key} className="min-w-0 text-xs uppercase tracking-wider text-ivory/45">
            {label}
            <textarea
              value={values[key] || ''}
              onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))}
              rows={key === 'internship_title' || key === 'internship_letterLabel' ? 2 : 4}
              className="mt-2 w-full min-w-0 border border-brass/15 bg-obsidian p-3 text-sm normal-case tracking-normal text-ivory"
            />
          </label>
        ))}
        <button
          onClick={save}
          className="flex min-h-10 w-full items-center justify-center gap-2 bg-brass px-4 py-2.5 text-sm text-obsidian sm:w-fit"
        >
          <Save size={15} /> Save internship page
        </button>
      </section>

      <h2 className="mb-4 font-display text-3xl text-ivory">Applications</h2>
      {!applications.length ? (
        <p className="border border-brass/10 p-8 text-center text-sm text-ivory/40">
          No internship applications yet.
        </p>
      ) : (
        <div className="space-y-4">
          {applications.map(item => (
            <article key={item.id} className="min-w-0 border border-brass/15 bg-carbon p-4 sm:p-5">
              <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <div className="min-w-0">
                  <h3 className="font-display text-xl text-ivory">{item.name}</h3>
                  <p className="break-words text-sm text-ivory/45">
                    {item.email}{item.phone ? ` · ${item.phone}` : ''}
                  </p>
                  <p className="mt-2 break-words text-sm text-ivory/65">
                    {item.school || 'Independent applicant'}
                    {item.programme ? ` · ${item.programme}` : ''}
                    {item.availability ? ` · ${item.availability}` : ''}
                  </p>
                </div>
                <ResponsiveSelect
                  label="Application status"
                  value={item.status || 'received'}
                  onChange={status => updateStatus(item, status)}
                  options={statusOptions}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-brass/10 pt-4">
                <button type="button" disabled={updatingId === item.id || item.status === 'accepted'} onClick={() => updateStatus(item, 'accepted')} className="inline-flex min-h-10 items-center gap-2 bg-green-500/15 px-4 text-xs uppercase tracking-wider text-green-300 disabled:cursor-not-allowed disabled:opacity-45">
                  {updatingId === item.id ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Approve
                </button>
                <button type="button" disabled={updatingId === item.id || item.status === 'declined'} onClick={() => updateStatus(item, 'declined')} className="inline-flex min-h-10 items-center gap-2 border border-red-400/25 px-4 text-xs uppercase tracking-wider text-red-300 disabled:cursor-not-allowed disabled:opacity-45"><XCircle size={15} /> Decline</button>
                {item.approvalDelivery?.deliveredAt && <span className="self-center text-xs text-green-300/70">Approval update delivered.</span>}
                {item.approvalDelivery?.error && <span className="self-center text-xs text-amber-300/70">Delivery will be retried.</span>}
              </div>
              <p className="mt-4 break-words text-sm leading-relaxed text-ivory/60">{item.interests}</p>
              {item.notice && (
                <p className="mt-3 break-words border-l border-brass/40 pl-3 text-sm text-ivory/50">
                  {item.notice}
                </p>
              )}
              {item.letterUrl && (
                <a
                  href={item.letterUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-2 text-sm text-brass hover:underline"
                >
                  Open uploaded letter <ExternalLink size={14} />
                </a>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
