import { useEffect, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { studioClient } from '@/api/studioClient';

export default function UsersTab() {
  const [users, setUsers] = useState([]);
  const [draft, setDraft] = useState({ full_name: '', email: '', password: '', role: 'customer' });
  const [error, setError] = useState('');
  useEffect(() => { studioClient.entities.User.list('-created_date').then(setUsers); }, []);
  const addUser = async () => {
    try {
      setError('');
      const user = await studioClient.admin.createUser(draft);
      setUsers(current => [user, ...current]);
      setDraft({ full_name: '', email: '', password: '', role: 'customer' });
    } catch (err) {
      setError(err.message);
    }
  };
  const updateUser = async (user, changes) => {
    const updated = await studioClient.entities.User.update(user.id, changes);
    setUsers(current => current.map(item => item.id === user.id ? updated : item));
  };
  return (
    <div>
      <h1 className="font-display text-4xl text-ivory mb-2">Registered Users</h1>
      <p className="text-ivory/40 text-sm mb-8">Email addresses recorded when visitors create an account.</p>
      <div className="mb-6 grid gap-3 border border-brass/15 bg-carbon p-4 md:grid-cols-5">
        <input value={draft.full_name} onChange={e => setDraft({ ...draft, full_name: e.target.value })} placeholder="Full name" className="bg-obsidian border border-brass/15 px-3 py-2 text-sm text-ivory" />
        <input value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} placeholder="Email" type="email" className="bg-obsidian border border-brass/15 px-3 py-2 text-sm text-ivory" />
        <input value={draft.password} onChange={e => setDraft({ ...draft, password: e.target.value })} placeholder="Temporary password" type="password" className="bg-obsidian border border-brass/15 px-3 py-2 text-sm text-ivory" />
        <select value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })} className="bg-obsidian border border-brass/15 px-3 py-2 text-sm text-ivory">
          {['customer', 'editor', 'support', 'admin'].map(role => <option key={role}>{role}</option>)}
        </select>
        <button onClick={addUser} className="flex items-center justify-center gap-2 bg-brass px-4 py-2 text-sm text-obsidian"><Plus size={15} /> Add user</button>
        {error && <p className="md:col-span-5 text-xs text-red-400">{error}</p>}
      </div>
      <div className="border border-brass/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-carbon text-left text-brass/70"><tr><th className="p-4">Name</th><th className="p-4">Email</th><th className="p-4">Joined</th><th className="p-4">Role</th><th className="p-4">Status</th></tr></thead>
          <tbody>
            {users.map(user => <tr key={user.id} className="border-t border-brass/10 text-ivory/60">
              <td className="p-4">{user.full_name || '—'}</td><td className="p-4">{user.email}</td><td className="p-4">{new Date(user.created_date).toLocaleDateString()}</td>
              <td className="p-4"><select value={user.role} onChange={e => updateUser(user, { role: e.target.value })} className="bg-obsidian border border-brass/15 p-2 text-xs">{['customer', 'editor', 'support', 'admin'].map(role => <option key={role}>{role}</option>)}</select></td>
              <td className="p-4"><button onClick={() => updateUser(user, { status: user.status === 'suspended' ? 'active' : 'suspended' })} className={user.status === 'suspended' ? 'text-red-400' : 'text-green-400'}>{user.status || 'active'}</button></td>
            </tr>)}
          </tbody>
        </table>
        {users.length === 0 && <div className="p-10 text-center text-ivory/30"><Users className="mx-auto mb-2" />No registered users yet.</div>}
      </div>
    </div>
  );
}
