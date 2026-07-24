import { useState, useEffect } from 'react';
import { studioClient } from '@/api/studioClient';

// Cache per page
const _caches = {};
const _promises = {};

export function usePageContent(page) {
  const [content, setContent] = useState(_caches[page] || {});

  useEffect(() => {
    if (_caches[page]) { setContent(_caches[page]); return; }
    if (!_promises[page]) {
      _promises[page] = studioClient.entities.SiteContent.filter({ page }).then(records => {
        const map = {};
        records.forEach(r => { map[r.key] = r.value; });
        _caches[page] = map;
        return map;
      }).catch(() => ({}));
    }
    _promises[page].then(map => setContent(map));
  }, [page]);

  return content;
}