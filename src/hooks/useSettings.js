import { useState, useEffect } from 'react';
import { studioClient } from '@/api/studioClient';

let _cache = null;
let _promise = null;

export function useSettings() {
  const [settings, setSettings] = useState(_cache || {});

  useEffect(() => {
    if (_cache) { setSettings(_cache); return; }
    if (!_promise) {
      _promise = studioClient.entities.SiteContent.filter({ page: 'Settings' }).then(records => {
        const map = {};
        records.forEach(r => { map[r.key] = r.value; });
        _cache = map;
        return map;
      }).catch(() => ({}));
    }
    _promise.then(map => setSettings(map));
  }, []);

  return settings;
}