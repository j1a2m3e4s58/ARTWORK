import { Navigate } from 'react-router-dom';
import { useSettings } from '@/hooks/useSettings';

export default function FeatureRoute({ setting, defaultEnabled = true, children }) {
  const settings = useSettings();
  if (!settings.__loaded) {
    return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-2 border-brass/20 border-t-brass" /></div>;
  }
  const raw = settings[setting];
  const enabled = raw === undefined ? defaultEnabled : raw !== 'false';
  return enabled ? children : <Navigate to="/" replace />;
}
