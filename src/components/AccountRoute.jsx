import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

export default function AccountRoute({ children }) {
  const { user, isLoadingAuth } = useAuth();
  const location = useLocation();
  if (isLoadingAuth) return <div className="min-h-screen bg-obsidian" />;
  if (!user) return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  return children;
}
