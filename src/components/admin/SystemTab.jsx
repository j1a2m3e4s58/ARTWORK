import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, DatabaseBackup, MailWarning, Server } from 'lucide-react';
import { studioClient } from '@/api/studioClient';
import { useAuth } from '@/lib/AuthContext';

export default function SystemTab() {
  const { user, checkUserAuth } = useAuth();
  const [health, setHealth] = useState(null);
  const [logs, setLogs] = useState([]);
  const [notice, setNotice] = useState('');
  const [mfaSetup, setMfaSetup] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  useEffect(() => {
    Promise.all([studioClient.system.ready(), studioClient.entities.AuditLog.list('-created_date', 50)])
      .then(([ready, auditLogs]) => { setHealth(ready); setLogs(auditLogs); });
  }, []);
  const backup = async () => {
    const result = await studioClient.admin.backup();
    setNotice(result.success ? 'Backup created.' : 'Managed PostgreSQL backups must be configured with your database provider.');
  };
  const startMfa = async () => setMfaSetup(await studioClient.mfa.setup());
  const enableMfa = async () => {
    await studioClient.mfa.enable(mfaCode);
    await checkUserAuth();
    setMfaSetup(null);
    setMfaCode('');
    setNotice('Two-factor authentication enabled.');
  };
  const disableMfa = async () => {
    await studioClient.mfa.disable(disablePassword, mfaCode);
    await checkUserAuth();
    setDisablePassword('');
    setMfaCode('');
    setNotice('Two-factor authentication disabled.');
  };
  return (
    <div>
      <h1 className="font-display text-4xl text-ivory">System & Operations</h1>
      <p className="mb-8 mt-2 text-sm text-ivory/40">Environment readiness, backups and administrator audit history.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'API', value: health?.ok ? 'Healthy' : 'Checking', icon: Activity, good: health?.ok },
          { label: 'Database', value: health?.database || 'Checking', icon: Server, good: health?.database === 'postgresql' },
          { label: 'Email', value: health?.email ? 'Configured' : 'Needs setup', icon: health?.email ? CheckCircle2 : MailWarning, good: health?.email },
          { label: 'Storage', value: health?.storage || 'local', icon: DatabaseBackup, good: health?.storage && health.storage !== 'local' },
        ].map(({ label, value, icon: Icon, good }) => (
          <div key={label} className={`border p-4 ${good ? 'border-green-400/20 bg-green-400/5' : 'border-yellow-400/20 bg-yellow-400/5'}`}>
            <Icon size={18} className={good ? 'text-green-300' : 'text-yellow-300'} /><p className="mt-3 text-xs uppercase tracking-wider text-ivory/35">{label}</p><p className="mt-1 text-sm text-ivory/75">{value}</p>
          </div>
        ))}
      </div>
      <button onClick={backup} className="mt-5 flex items-center gap-2 border border-brass/25 px-4 py-2 text-sm text-brass"><DatabaseBackup size={15} /> Create backup now</button>
      {notice && <p className="mt-3 text-sm text-ivory/55">{notice}</p>}
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
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <input type="password" value={disablePassword} onChange={event => setDisablePassword(event.target.value)} placeholder="Current password" className="border border-brass/15 bg-obsidian px-3 py-2 text-sm text-ivory" />
            <input value={mfaCode} onChange={event => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Authenticator code" className="border border-brass/15 bg-obsidian px-3 py-2 text-sm text-ivory" />
            <button onClick={disableMfa} className="border border-red-400/20 px-4 py-2 text-sm text-red-300">Disable 2FA</button>
          </div>
        )}
      </section>
      <h2 className="mb-4 mt-10 font-display text-2xl">Recent audit activity</h2>
      <div className="overflow-hidden border border-brass/10">
        {logs.map(log => <div key={log.id} className="grid gap-1 border-t border-brass/10 p-3 text-xs first:border-0 sm:grid-cols-[1fr_1fr_auto]"><span className="text-ivory/65">{log.action}</span><span className="text-brass/65">{log.actorEmail}</span><time className="text-ivory/25">{new Date(log.created_date).toLocaleString()}</time></div>)}
        {!logs.length && <p className="p-8 text-center text-sm text-ivory/30">No audit events yet.</p>}
      </div>
    </div>
  );
}
