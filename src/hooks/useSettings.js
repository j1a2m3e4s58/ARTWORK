import { useEffect, useState } from 'react';
import { studioClient } from '@/api/studioClient';

export function useSettings() {
  const [settings, setSettings] = useState({});
  useEffect(() => {
    let active = true;
    const load = () => studioClient.entities.SiteContent.filter({ page: 'Settings' }).then(records => {
      if (active) setSettings(Object.fromEntries(records.map(record => [record.key, record.value])));
    }).catch(() => {});
    load();
    window.addEventListener('atelier:content-updated', load);
    return () => {
      active = false;
      window.removeEventListener('atelier:content-updated', load);
    };
  }, []);
  return settings;
}
