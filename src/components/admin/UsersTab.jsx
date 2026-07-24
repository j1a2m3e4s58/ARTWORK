import { useEffect, useState } from 'react';
import { MailPlus, RefreshCw, Shield, Users } from 'lucide-react';
import { studioClient } from '@/api/studioClient';

export default function UsersTab({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [draft, setDraft] = useState({ full_name: '', email: '', role: 'customer' });
  const [error, setError] = useState('');
  useEffect(() => { studioClient.entities.User.list('-created_date').then(setUsers); }, []);
  const addUser = async () => {
    try {
      setError('');
      const user = await studioClient.admin.createUser(draft);
      setUsers(current => [user, ...current]);
      setDraft({ full_name: '', email: '', role: 'customer' });
    } catch (err) {
      setError(err.message);
    }
  };
  const updateUser = async (user, changes) => {
    if (changes.role === 'admin' && !window.confirm(`Give ${user.email} full administrator access?`)) return;
    try {
      setError('');
      const updated = await studioClient.entities.User.update(user.id, changes);
      setUsers(current => current.map(item => item.id === user.id ? updated : item));
    } catch (updateError) {
      setError(updateError.message);
    }
  };
  const resendInvite = async user => {
    try {
      setError('');
      await studioClient.admin.resendInvite(user.id);
    } catch (inviteError) {
      setError(inviteError.message);
    }
  };
  return (
    <div>
      <h1 className="font-display text-4xl text-ivory mb-2">Registered Users</h1>
      <p className="text-ivory/40 text-sm mb-8">Invite staff or customers securely. Invitees create their own password from a time-limited email link.</p>
      <div className="mb-6 grid gap-3 border border-brass/15 bg-carbon p-4 md:grid-cols-4">
        <input value={draft.full_name} onChange={e => setDraft({ ...draft, full_name: e.target.value })} placeholder="Full name" className="bg-obsidian border border-brass/15 px-3 py-2 text-sm text-ivory" />
        <input value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} placeholder="Email" type="email" className="bg-obsidian border border-brass/15 px-3 py-2 text-sm text-ivory" />
        <select value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })} className="bg-obsidian border border-brass/15 px-3 py-2 text-sm text-ivory">
          {['customer', 'editor', 'support', 'admin'].map(role => <option key={role}>{role}</option>)}
        </select>
        <button onClick={addUser} className="flex items-center justify-center gap-2 bg-brass px-4 py-2 text-sm text-obsidian"><MailPlus size={15} /> Send invitation</button>
        {error && <p className="md:col-span-4 text-xs text-red-400">{error}</p>}
      </div>
      <div className="hidden border border-brass/10 overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-carbon text-left text-brass/70"><tr><th className="p-4">Name</th><th className="p-4">Email</th><th className="p-4">Joined</th><th className="p-4">Role</th><th className="p-4">Status</th></tr></thead>
          <tbody>
            {users.map(user => <tr key={user.id} className="border-t border-brass/10 text-ivory/60">
              <td className="p-4">{user.full_name || '—'}</td><td className="p-4">{user.email}</td><td className="p-4">{new Date(user.created_date).toLocaleDateString()}</td>
              <td className="p-4"><select disabled={user.id === currentUser?.id} value={user.role} onChange={e => updateUser(user, { role: e.target.value })} className="bg-obsidian border border-brass/15 p-2 text-xs disabled:opacity-40">{['customer', 'editor', 'support', 'admin'].map(role => <option key={role}>{role}</option>)}</select></td>
              <td className="p-4">
                {user.status === 'invited'
                  ? <button onClick={() => resendInvite(user)} className="flex items-center gap-1 text-brass"><RefreshCw size={12} /> Resend</button>
                  : <button disabled={user.id === currentUser?.id} onClick={() => updateUser(user, { status: user.status === 'suspended' ? 'active' : 'suspended' })} className={`${user.status === 'suspended' ? 'text-red-400' : 'text-green-400'} disabled:opacity-40`}>{user.status || 'active'}</button>}
              </td>
            </tr>)}
          </tbody>
        </table>
        {users.length === 0 && <div className="p-10 text-center text-ivory/30"><Users className="mx-auto mb-2" />No registered users yet.</div>}
      </div>
      <div className="grid gap-3 md:hidden">
        {users.map(user => (
          <article key={user.id} className="rounded-xl border border-brass/10 bg-carbon p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="font-medium text-ivory">{user.full_name || 'Unnamed user'}</p><p className="mt-1 break-all text-xs text-brass">{user.email}</p></div>
              <span className="rounded-full bg-brass/10 px-2 py-1 text-[10px] uppercase text-brass">{user.status || 'active'}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <label className="text-[10px] uppercase tracking-wider text-ivory/35">Role
                <select disabled={user.id === currentUser?.id} value={user.role} onChange={e => updateUser(user, { role: e.target.value })} className="mt-1 w-full border border-brass/15 bg-obsidian p-2 text-xs text-ivory">
                  {['customer', 'editor', 'support', 'admin'].map(role => <option key={role}>{role}</option>)}
                </select>
              </label>
              <div className="flex items-end">
                {user.status === 'invited'
                  ? <button onClick={() => resendInvite(user)} className="flex w-full items-center justify-center gap-1 border border-brass/20 p-2 text-xs text-brass"><RefreshCw size={12} /> Resend</button>
                  : <button disabled={user.id === currentUser?.id} onClick={() => updateUser(user, { status: user.status === 'suspended' ? 'active' : 'suspended' })} className="flex w-full items-center justify-center gap-1 border border-brass/20 p-2 text-xs text-ivory/60 disabled:opacity-40"><Shield size={12} /> {user.status === 'suspended' ? 'Activate' : 'Suspend'}</button>}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
