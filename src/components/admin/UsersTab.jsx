import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { studioClient } from '@/api/studioClient';

export default function UsersTab() {
  const [users, setUsers] = useState([]);
  useEffect(() => { studioClient.entities.User.list('-created_date').then(setUsers); }, []);
  return (
    <div>
      <h1 className="font-display text-4xl text-ivory mb-2">Registered Users</h1>
      <p className="text-ivory/40 text-sm mb-8">Email addresses recorded when visitors create an account.</p>
      <div className="border border-brass/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-carbon text-left text-brass/70"><tr><th className="p-4">Name</th><th className="p-4">Email</th><th className="p-4">Joined</th><th className="p-4">Status</th></tr></thead>
          <tbody>
            {users.map(user => <tr key={user.id} className="border-t border-brass/10 text-ivory/60"><td className="p-4">{user.full_name || '—'}</td><td className="p-4">{user.email}</td><td className="p-4">{new Date(user.created_date).toLocaleDateString()}</td><td className="p-4 text-green-400">{user.status || 'active'}</td></tr>)}
          </tbody>
        </table>
        {users.length === 0 && <div className="p-10 text-center text-ivory/30"><Users className="mx-auto mb-2" />No registered users yet.</div>}
      </div>
    </div>
  );
}
