import { Navigate } from 'react-router-dom';
import { useSettings } from '@/hooks/useSettings';

export default function FeatureRoute({ setting, defaultEnabled = true, children }) {
  const settings = useSettings();
  const raw = settings[setting];
  const enabled = raw === undefined ? defaultEnabled : raw !== 'false';
  return enabled ? children : <Navigate to="/" replace />;
}
