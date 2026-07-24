import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

// Cache per page
const _caches = {};
const _promises = {};

export function usePageContent(page) {
  const [content, setContent] = useState(_caches[page] || {});

  useEffect(() => {
    if (_caches[page]) { setContent(_caches[page]); return; }
    if (!_promises[page]) {
      _promises[page] = base44.entities.SiteContent.filter({ page }).then(records => {
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