import { useCallback, useEffect, useRef, useState } from 'react';
import { watchesApi } from '@/lib/api';

const POLL_MS = 20000;

// Watches live outside JobsProvider: they're a small, Dashboard-only concern,
// and their own state (last_checked_at/last_found) only changes server-side
// when a watch-triggered job finishes, so a light poll is simpler than wiring
// a new websocket message type just for this.
export function useWatches() {
  const [watches, setWatches] = useState([]);
  const mountedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const list = await watchesApi.list();
      if (mountedRef.current) setWatches(list);
    } catch { /* backend not up yet */ }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => { mountedRef.current = false; clearInterval(id); };
  }, [refresh]);

  const add = useCallback(async (url, intervalMin, options) => {
    const w = await watchesApi.create(url, intervalMin, options);
    setWatches(prev => [w, ...prev]);
    return w;
  }, []);

  const update = useCallback(async (id, patch) => {
    const w = await watchesApi.update(id, patch);
    setWatches(prev => prev.map(x => (x.id === id ? w : x)));
    return w;
  }, []);

  const remove = useCallback(async (id) => {
    await watchesApi.remove(id);
    setWatches(prev => prev.filter(x => x.id !== id));
  }, []);

  const checkNow = useCallback(async (id) => {
    await watchesApi.checkNow(id);
    refresh();
  }, [refresh]);

  return { watches, refresh, add, update, remove, checkNow };
}
