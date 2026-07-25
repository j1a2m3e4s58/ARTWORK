import { useCallback, useEffect, useState } from 'react';
import { studioClient } from '@/api/studioClient';

export function useCollectionResource(entityName, { sort = '-created_date', limit = 50, enabled = true } = {}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  const [request, setRequest] = useState(0);
  const retry = useCallback(() => setRequest(value => value + 1), []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    setError('');
    studioClient.entities[entityName].list(sort, limit)
      .then(records => {
        if (active) setData(records);
      })
      .catch(fetchError => {
        if (active) setError(fetchError.message || 'This content could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [enabled, entityName, limit, request, sort]);

  return { data, setData, loading, error, retry };
}
