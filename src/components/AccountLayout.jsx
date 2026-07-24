import { Link, Outlet } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

export default function AccountLayout() {
  const { user, logout } = useAuth();
  const staff = ['admin', 'editor', 'support'].includes(user?.role);
  return (
    <div className="min-h-screen bg-obsidian text-ivory">
      <header className="fixed inset-x-0 top-0 z-[80] h-20 border-b border-brass/10 bg-obsidian/95 backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-12">
          <Link to="/" className="flex min-h-11 items-center gap-3 text-sm text-ivory/60 hover:text-brass">
            <ArrowLeft size={17} /> Back to gallery
          </Link>
          <div className="flex items-center gap-2">
            {staff && <Link to="/admin" className="flex min-h-11 items-center gap-2 px-3 text-xs text-brass"><ShieldCheck size={16} /> Studio Control</Link>}
            <button onClick={() => logout()} className="min-h-11 border border-ivory/10 px-3 text-xs text-ivory/55 hover:border-brass/30 hover:text-brass">Sign out</button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
