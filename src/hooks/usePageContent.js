import { useEffect, useState } from 'react';
import { studioClient } from '@/api/studioClient';

export function usePageContent(page) {
  const [content, setContent] = useState({});
  useEffect(() => {
    let active = true;
    // A page can have a large number of editable controls. Request the full
    // supported content set so newer records are never hidden by the API's
    // small default page size.
    const load = () => studioClient.entities.SiteContent.filter({ page }, '-updated_date', 200).then(records => {
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
