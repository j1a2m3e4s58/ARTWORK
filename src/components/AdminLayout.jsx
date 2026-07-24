import { Link, Outlet } from 'react-router-dom';
import { ArrowLeft, LockKeyhole, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useAdminAccess } from '@/components/AdminAccessGate';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { lock } = useAdminAccess();
  return (
    <div className="min-h-screen bg-obsidian text-ivory">
      <header className="fixed inset-x-0 top-0 z-[80] h-20 border-b border-brass/10 bg-obsidian/95 backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/" aria-label="Return to website" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-brass/20 text-brass hover:bg-brass/10">
              <ArrowLeft size={18} />
            </Link>
            <div className="min-w-0">
              <p className="flex items-center gap-2 truncate font-display text-lg"><ShieldCheck size={17} className="text-brass" /> Studio Control</p>
              <p className="truncate text-[10px] uppercase tracking-[0.22em] text-ivory/35">{user?.role} workspace</p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <button onClick={lock} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs text-ivory/55 hover:bg-ivory/5 hover:text-brass">
              <LockKeyhole size={16} /><span className="hidden sm:inline">Lock</span>
            </button>
            <Link to="/account" className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs text-ivory/55 hover:bg-ivory/5 hover:text-brass">
              <UserRound size={16} /><span className="hidden sm:inline">My account</span>
            </Link>
            <button onClick={() => logout()} className="flex min-h-11 items-center gap-2 rounded-lg border border-ivory/10 px-3 text-xs text-ivory/55 hover:border-brass/30 hover:text-brass" aria-label="Sign out">
              <LogOut size={16} /><span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
