import { useCallback, useEffect, useRef, useState } from 'react';
import { convertApi } from '@/lib/api';

// Conversions are fast (seconds, not the minutes a download can take) and the
// user is almost always actively looking at this page while one runs, so a
// short poll reads as "live" without needing a dedicated websocket message
// type - unlike Watch, which runs unattended in the background.
const POLL_MS = 1500;

export function useConversions() {
  const [conversions, setConversions] = useState([]);
  const mountedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const list = await convertApi.list();
      if (mountedRef.current) setConversions(list);
    } catch { /* backend not up yet */ }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => { mountedRef.current = false; clearInterval(id); };
  }, [refresh]);

  const add = useCallback(async (items) => {
    const { created } = await convertApi.create(items);
    setConversions(prev => [...created, ...prev]);
    return created;
  }, []);

  const remove = useCallback(async (id) => {
    await convertApi.remove(id);
    setConversions(prev => prev.filter(c => c.id !== id));
  }, []);

  const clearFinished = useCallback(async () => {
    await convertApi.clearFinished();
    setConversions(prev => prev.filter(c => c.status === 'queued' || c.status === 'running'));
  }, []);

  return { conversions, refresh, add, remove, clearFinished };
}
