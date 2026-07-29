import { useEffect, useState } from 'react';
import { studioClient } from '@/api/studioClient';

export function usePageContent(page) {
  const [content, setContent] = useState({});
  useEffect(() => {
    let active = true;
    const load = () => studioClient.entities.SiteContent.filter({ page }).then(records => {
      const ordered = [...records].sort((a, b) => (
        new Date(a.updated_date || a.created_date || 0) - new Date(b.updated_date || b.created_date || 0)
      ));
      if (active) setContent(Object.fromEntries(ordered.map(record => [record.key, record.value])));
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
