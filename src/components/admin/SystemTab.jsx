import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, BellRing, CheckCircle2, CheckSquare, Cloud, CreditCard, DatabaseBackup, MailCheck, MailWarning, RefreshCw, Server, Square, Trash2 } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import { useAuth } from '@/lib/AuthContext';
import GlassConfirmDialog from '@/components/GlassConfirmDialog';

export default function SystemTab() {
  const { user, checkUserAuth } = useAuth();
  const [health, setHealth] = useState(null);
  const [logs, setLogs] = useState([]);
  const [notice, setNotice] = useState('');
  const [mfaSetup, setMfaSetup] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const recoveryPanelRef = useRef(null);
  const [testing, setTesting] = useState('');
  const [selectedLogs, setSelectedLogs] = useState(new Set());
  const [auditDelete, setAuditDelete] = useState(null);
  const [deletingLogs, setDeletingLogs] = useState(false);
  useEffect(() => {
    Promise.all([studioClient.system.status(), studioClient.entities.AuditLog.list('-created_date', 50)])
      .then(([ready, auditLogs]) => { setHealth(ready); setLogs(auditLogs); })
      .catch(error => setNotice(error.message));
  }, []);
  const allLogsSelected = useMemo(() => logs.length > 0 && logs.every(log => selectedLogs.has(log.id)), [logs, selectedLogs]);
  const selectedAuditLogs = useMemo(() => logs.filter(log => selectedLogs.has(log.id)), [logs, selectedLogs]);
  const toggleAuditLog = id => setSelectedLogs(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAllAuditLogs = () => setSelectedLogs(allLogsSelected ? new Set() : new Set(logs.map(log => log.id)));
  const deleteAuditLogs = async () => {
    if (!auditDelete) return;
    setDeletingLogs(true);
    setNotice('');
    try {
      const removeAll = auditDelete === 'all';
      const ids = removeAll ? [] : auditDelete.map(log => log.id);
      const result = await studioClient.admin.purgeAuditLogs(ids, removeAll);
      setLogs(current => removeAll ? [] : current.filter(log => !ids.includes(log.id)));
      setSelectedLogs(new Set());
      setAuditDelete(null);
      setNotice(`${result.purged} audit event${result.purged === 1 ? '' : 's'} permanently deleted.`);
    } catch (error) {
      setNotice(`Audit deletion failed: ${error.message}`);
    } finally {
      setDeletingLogs(false);
    }
  };
  const backup = async () => {
    const result = await studioClient.admin.backup();
    setNotice(result.success ? 'Backup created.' : 'Managed PostgreSQL backups must be configured with your database provider.');
  };
  const startMfa = async () => setMfaSetup(await studioClient.mfa.setup());
  const enableMfa = async () => {
    const result = await studioClient.mfa.enable(mfaCode);
    await checkUserAuth();
    setMfaSetup(null);
    setMfaCode('');
    setRecoveryCodes(result.recoveryCodes || []);
    setNotice('Two-factor authentication enabled.');
  };
  const disableMfa = async () => {
    await studioClient.mfa.disable(disablePassword, mfaCode);
    await checkUserAuth();
    setDisablePassword('');
    setMfaCode('');
    setNotice('Two-factor authentication disabled.');
  };
  const retryEmail = async () => {
    await studioClient.system.retryOutbox();
    setHealth(await studioClient.system.status());
    setNotice('Queued email delivery was retried.');
  };
  const regenerateRecoveryCodes = async () => {
    if (!recoveryPassword || recoveryCode.length !== 6 || recoveryBusy) return;
    setRecoveryBusy(true);
    setRecoveryError('');
    try {
      const result = await studioClient.mfa.regenerateRecoveryCodes(recoveryPassword, recoveryCode);
      setRecoveryPassword('');
      setRecoveryCode('');
      setRecoveryCodes(result.recoveryCodes || []);
      setNotice('Previous recovery codes were revoked. Save the new codes now.');
      setTimeout(() => recoveryPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
    } catch (error) {
      setRecoveryError(error.message || 'Recovery codes could not be generated. Request a fresh authenticator code and try again.');
    } finally {
      setRecoveryBusy(false);
    }
  };
  const rehearse = async (name, action, successMessage) => {
    setTesting(name);
    setNotice('');
    try {
      await action();
      setNotice(successMessage);
      setHealth(await studioClient.system.status());
    } catch (error) {
      setNotice(`${name} failed: ${error.message}`);
    } finally {
      setTesting('');
    }
  };
  return (
    <div>
      <h1 className="font-display text-4xl text-ivory">System & Operations</h1>
      <p className="mb-8 mt-2 text-sm text-ivory/40">Environment readiness, backups and administrator audit history.</p>
      {notice && <p role="status" className="mb-5 border border-brass/25 bg-brass/5 p-3 text-sm text-ivory/75">{notice}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-9">
        {[
          { label: 'API', value: health?.ok ? 'Ready' : health ? 'Needs attention' : 'Checking', icon: Activity, good: health?.ok },
          { label: 'Database', value: health?.services?.database?.kind || 'Checking', icon: Server, good: health?.services?.database?.ok },
          { label: 'Email', value: health?.services?.email?.ok ? 'Connected' : 'Needs setup', icon: health?.services?.email?.ok ? CheckCircle2 : MailWarning, good: health?.services?.email?.ok },
          { label: 'Storage', value: health?.services?.storage?.provider || 'Checking', icon: DatabaseBackup, good: health?.services?.storage?.ok },
          {
            label: 'Payments',
            value: health?.services?.payment?.configured
              ? `${health.services.payment.provider} ${health.services.payment.mode === 'live' ? 'live' : 'test'}`
              : 'Secure payment needs setup',
            icon: CreditCard,
            good: health?.services?.payment?.configured,
          },
          {
            label: 'Monitoring',
            value: health?.services?.monitoring?.ok ? 'Alert channel ready' : 'Webhook required',
            icon: BellRing,
            good: health?.services?.monitoring?.ok,
          },
          {
            label: 'Restore test',
            value: health?.services?.backup?.lastVerifiedAt
              ? new Date(health.services.backup.lastVerifiedAt).toLocaleDateString()
              : 'Not recorded',
            icon: DatabaseBackup,
            good: health?.services?.backup?.ok,
          },
          {
            label: 'Job queue',
            value: health?.services?.queue?.configured ? `${health.services.queue.waiting || 0} waiting` : 'Direct fallback',
            icon: RefreshCw,
            good: health?.services?.queue?.configured,
          },
          {
            label: 'Malware scan',
            value: health?.services?.malwareScanning?.configured ? 'Fail-closed' : 'Needs scanner',
            icon: Activity,
            good: health?.services?.malwareScanning?.configured,
          },
        ].map(({ label, value, icon: Icon, good }) => (
          <div key={label} className={`border p-4 ${good ? 'border-green-400/20 bg-green-400/5' : 'border-yellow-400/20 bg-yellow-400/5'}`}>
            <Icon size={18} className={good ? 'text-green-300' : 'text-yellow-300'} /><p className="mt-3 text-xs uppercase tracking-wider text-ivory/35">{label}</p><p className="mt-1 text-sm text-ivory/75">{value}</p>
          </div>
        ))}
      </div>
      <button onClick={backup} className="mt-5 flex items-center gap-2 border border-brass/25 px-4 py-2 text-sm text-brass"><DatabaseBackup size={15} /> Create backup now</button>
      <button onClick={retryEmail} className="ml-0 mt-3 flex items-center gap-2 border border-brass/25 px-4 py-2 text-sm text-brass sm:ml-3 sm:mt-5 sm:inline-flex"><RefreshCw size={15} /> Retry failed email</button>
      <section className="mt-6 border border-brass/10 bg-carbon p-5">
        <h2 className="font-display text-2xl">Production rehearsals</h2>
        <p className="mt-2 text-sm text-ivory/40">Run controlled end-to-end checks against the services configured on this deployment.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <button disabled={Boolean(testing)} onClick={() => rehearse('Email test', studioClient.admin.testEmail, 'A test email was delivered to your administrator address.')}
            className="flex min-h-11 items-center justify-center gap-2 border border-brass/25 px-3 text-sm text-brass disabled:opacity-40"><MailCheck size={16} /> Test email</button>
          <button disabled={Boolean(testing)} onClick={() => rehearse('Cloudinary test', studioClient.admin.testStorage, 'Cloudinary upload and deletion completed successfully.')}
            className="flex min-h-11 items-center justify-center gap-2 border border-brass/25 px-3 text-sm text-brass disabled:opacity-40"><Cloud size={16} /> Test media</button>
          <button disabled={Boolean(testing)} onClick={() => rehearse('Alert test', studioClient.admin.testAlert, 'The monitoring webhook accepted the test alert.')}
            className="flex min-h-11 items-center justify-center gap-2 border border-brass/25 px-3 text-sm text-brass disabled:opacity-40"><BellRing size={16} /> Test alert</button>
        </div>
        {testing && <p className="mt-3 text-xs text-ivory/45">{testing} is running…</p>}
        {!health?.services?.payment?.configured && (
          <p className="mt-4 border-l border-yellow-300/40 pl-3 text-xs leading-relaxed text-ivory/45">
            Secure checkout is unavailable. Confirm that PAYMENT_PROVIDER is set to paystack and that PAYSTACK_SECRET_KEY contains the intended test or live secret key on Render.
          </p>
        )}
      </section>
      {health?.counts && <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">{Object.entries(health.counts).map(([key, value]) => <div key={key} className="border border-brass/10 bg-carbon p-3"><p className="text-2xl text-brass">{value}</p><p className="mt-1 break-words text-[10px] uppercase tracking-wider text-ivory/35">{key.replace(/([A-Z])/g, ' $1')}</p></div>)}</div>}
      <section className="mt-8 border border-brass/10 bg-carbon p-5">
        <h2 className="font-display text-2xl">Administrator two-factor authentication</h2>
        <p className="mt-2 text-sm text-ivory/40">{user?.mfaEnabled ? 'Enabled — sign-in requires your authenticator code.' : 'Protect the administrator account with a rotating authenticator code.'}</p>
        {!user?.mfaEnabled && !mfaSetup && <button onClick={startMfa} className="mt-4 border border-brass/25 px-4 py-2 text-sm text-brass">Set up authenticator</button>}
        {mfaSetup && (
          <div className="mt-5 grid gap-5 sm:grid-cols-[180px_1fr]">
            <img src={mfaSetup.qrDataUrl} alt="Authenticator QR code" className="h-44 w-44 bg-white p-2" />
            <div><p className="text-xs text-ivory/40">Scan this code, or enter:</p><code className="mt-2 block break-all text-xs text-brass">{mfaSetup.manualKey}</code>
              <input value={mfaCode} onChange={event => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" className="mt-4 w-full border border-brass/15 bg-obsidian px-3 py-2 text-sm text-ivory" />
              <button onClick={enableMfa} className="mt-3 bg-brass px-4 py-2 text-sm text-obsidian">Confirm and enable</button>
            </div>
          </div>
        )}
        {user?.mfaEnabled && (
          <>
            <form className="mt-4 grid gap-2 sm:grid-cols-3" onSubmit={event => { event.preventDefault(); regenerateRecoveryCodes(); }}>
              <input type="password" autoComplete="current-password" value={recoveryPassword} onChange={event => setRecoveryPassword(event.target.value)} placeholder="Current password" aria-label="Current password for recovery codes" className="border border-brass/15 bg-obsidian px-3 py-2 text-sm text-ivory" />
              <input inputMode="numeric" autoComplete="one-time-code" value={recoveryCode} onChange={event => setRecoveryCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Authenticator code" aria-label="Authenticator code for recovery codes" className="border border-brass/15 bg-obsidian px-3 py-2 text-sm text-ivory" />
              <button type="submit" disabled={!recoveryPassword || recoveryCode.length !== 6 || recoveryBusy} className="border border-brass/25 px-4 py-2 text-sm text-brass disabled:cursor-not-allowed disabled:opacity-40">
                {recoveryBusy ? 'Generating…' : 'Generate new recovery codes'}
              </button>
            </form>
            {recoveryError && <p role="alert" className="mt-3 border border-red-400/25 bg-red-400/5 p-3 text-sm text-red-200">{recoveryError}</p>}
            {recoveryCodes.length > 0 && (
              <div ref={recoveryPanelRef} id="mfa-recovery-codes" role="status" className="mt-4 border border-yellow-300/25 bg-yellow-300/5 p-4">
                <p className="text-sm text-yellow-100">Save these one-time codes securely. They will disappear when you leave this section.</p>
                <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm text-brass sm:grid-cols-5">
                  {recoveryCodes.map(code => <code key={code}>{code}</code>)}
                </div>
                <button type="button" onClick={() => setRecoveryCodes([])} className="mt-4 border border-brass/25 px-3 py-2 text-xs text-brass">I saved these codes</button>
              </div>
            )}
            <details className="mt-4 border-t border-ivory/10 pt-4">
              <summary className="cursor-pointer text-xs text-red-300/75">Disable two-factor authentication</summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <input type="password" value={disablePassword} onChange={event => setDisablePassword(event.target.value)} placeholder="Current password" className="border border-brass/15 bg-obsidian px-3 py-2 text-sm text-ivory" />
                <input value={mfaCode} onChange={event => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Authenticator code" className="border border-brass/15 bg-obsidian px-3 py-2 text-sm text-ivory" />
                <button onClick={disableMfa} className="border border-red-400/20 px-4 py-2 text-sm text-red-300">Disable 2FA</button>
              </div>
            </details>
          </>
        )}
      </section>
      <div className="mb-4 mt-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="font-display text-2xl">Recent audit activity</h2><p className="mt-1 text-xs text-ivory/35">Security history is permanent once deleted and cannot be restored.</p></div>
        {user?.role === 'admin' && logs.length > 0 && <div className="flex flex-wrap gap-2">
          <button onClick={toggleAllAuditLogs} className="min-h-10 border border-brass/25 px-3 text-xs text-ivory/65 hover:border-brass/50">{allLogsSelected ? 'Clear selection' : 'Select all'}</button>
          <button disabled={!selectedAuditLogs.length || deletingLogs} onClick={() => setAuditDelete(selectedAuditLogs)} className="min-h-10 border border-red-400/30 px-3 text-xs text-red-300 disabled:cursor-not-allowed disabled:opacity-40">Delete selected ({selectedAuditLogs.length})</button>
          <button disabled={deletingLogs} onClick={() => setAuditDelete('all')} className="min-h-10 bg-red-500/15 px-3 text-xs text-red-200 hover:bg-red-500/25 disabled:opacity-40">Delete all</button>
        </div>}
      </div>
      <div className="overflow-hidden border border-brass/10">
        {logs.map(log => <div key={log.id} className={`grid gap-2 border-t p-3 text-xs first:border-0 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-center ${selectedLogs.has(log.id) ? 'border-brass/25 bg-brass/5' : 'border-brass/10'}`}>
          {user?.role === 'admin' && <button onClick={() => toggleAuditLog(log.id)} aria-label={`Select audit event ${log.action}`} className="text-brass">{selectedLogs.has(log.id) ? <CheckSquare size={18} /> : <Square size={18} />}</button>}
          <span className="text-ivory/65">{log.action}</span><span className="text-brass/65">{log.actorEmail}</span><div className="flex items-center justify-between gap-3"><time className="text-ivory/25">{new Date(log.created_date).toLocaleString()}</time>{user?.role === 'admin' && <button onClick={() => setAuditDelete([log])} aria-label={`Delete audit event ${log.action}`} className="flex h-9 w-9 items-center justify-center text-red-300/55 hover:bg-red-500/10 hover:text-red-200"><Trash2 size={14} /></button>}</div>
        </div>)}
        {!logs.length && <p className="p-8 text-center text-sm text-ivory/30">No audit events yet.</p>}
      </div>
      <GlassConfirmDialog
        open={Boolean(auditDelete)}
        onOpenChange={open => !open && setAuditDelete(null)}
        onConfirm={deleteAuditLogs}
        busy={deletingLogs}
        title={auditDelete === 'all' ? 'Delete the entire audit log?' : `Delete ${auditDelete?.length || 0} audit event${auditDelete?.length === 1 ? '' : 's'}?`}
        description={auditDelete === 'all' ? 'Every recorded administrator and security event will be permanently removed. This cannot be undone.' : 'The selected security history will be permanently removed. This cannot be undone.'}
      />
    </div>
  );
}
