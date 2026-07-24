import { useEffect, useState } from 'react';
import { studioClient } from '@/api/studioClient';

export function usePageContent(page) {
  const [content, setContent] = useState({});
  useEffect(() => {
    let active = true;
    const load = () => studioClient.entities.SiteContent.filter({ page }).then(records => {
      if (active) setContent(Object.fromEntries(records.map(record => [record.key, record.value])));
    }).catch(() => {});
    load();
    window.addEventListener('atelier:content-updated', load);
    return () => {
      active = false;
      window.removeEventListener('atelier:content-updated', load);
    };
  }, [page]);
  return content;
}
