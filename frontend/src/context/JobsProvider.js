import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { jobsApi, WS_URL } from '@/lib/api';
import { isElectron } from '@/lib/electron';

const JobsContext = createContext(null);

const ACTIVE = new Set(['queued', 'running']);
const LOG_CAP = 250;
const WS_MIN_DELAY = 1000;
const WS_MAX_DELAY = 30000;

function notify(title, body) {
  if (isElectron && window.electronAPI.notify) window.electronAPI.notify(title, body);
}

export function JobsProvider({ children }) {
  const [jobs, setJobs] = useState({});          // id -> job
  const [logs, setLogs] = useState({});          // id -> [{kind,text}]
  const [oauth, setOauth] = useState({});        // site -> {url,done,ok,keys,error,lines}
  const [tools, setTools] = useState({});        // name -> {status,pct,error}
  const [connected, setConnected] = useState(false);

  const wsRef = useRef(null);
  const retryRef = useRef(null);
  const attemptRef = useRef(0);                  // WS reconnect backoff counter
  const prevStatusRef = useRef(null);            // id -> last-seen status (null = not primed yet)

  const upsert = useCallback((job) => {
    setJobs(prev => ({ ...prev, [job.id]: { ...prev[job.id], ...job } }));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const list = await jobsApi.list();
      setJobs(Object.fromEntries(list.map(j => [j.id, j])));
    } catch { /* backend not up yet */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Desktop notifications on terminal transitions (side-effect free upsert) ──
  useEffect(() => {
    const seen = prevStatusRef.current;
    const now = {};
    let anyTerminal = false;
    for (const j of Object.values(jobs)) now[j.id] = j.status;

    if (seen) {
      for (const j of Object.values(jobs)) {
        const was = seen[j.id];
        if (was && ACTIVE.has(was) && !ACTIVE.has(j.status)) {
          anyTerminal = true;
          if (j.status === 'error') notify('Download failed', j.url);
          else if (j.status === 'done') {
            const n = j.files_ok || 0;
            notify(`Downloaded ${n} file${n === 1 ? '' : 's'}`, j.url);
          }
        }
      }
      if (anyTerminal && !Object.values(jobs).some(j => ACTIVE.has(j.status))) {
        const done = Object.values(jobs).filter(j => j.status === 'done').length;
        const failed = Object.values(jobs).filter(j => j.status === 'error').length;
        if (done + failed > 1) notify('Queue finished', `${done} done${failed ? `, ${failed} failed` : ''}`);
      }
    }
    prevStatusRef.current = now;
  }, [jobs]);

  // ── WebSocket with exponential-backoff reconnect ─────────────────────────────
  useEffect(() => {
    let closed = false;

    const connect = () => {
      if (closed) return;
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => { setConnected(true); attemptRef.current = 0; };
      ws.onclose = () => {
        setConnected(false);
        if (closed) return;
        const delay = Math.min(WS_MIN_DELAY * 2 ** attemptRef.current, WS_MAX_DELAY);
        attemptRef.current += 1;
        retryRef.current = setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === 'snapshot') {
          msg.jobs.forEach(upsert);
        } else if (msg.type === 'job.update') {
          upsert(msg.job);
        } else if (msg.type === 'job.progress') {
          setJobs(prev => prev[msg.id] ? {
            ...prev,
            [msg.id]: {
              ...prev[msg.id],
              files_ok: msg.files_ok, files_skipped: msg.files_skipped,
              files_error: msg.files_error, current_file: msg.current_file,
            },
          } : prev);
        } else if (msg.type === 'job.line') {
          setLogs(prev => {
            const cur = prev[msg.id] || [];
            const next = [...cur, { kind: msg.kind, text: msg.text }];
            if (next.length > LOG_CAP) next.splice(0, next.length - LOG_CAP);
            return { ...prev, [msg.id]: next };
          });
        } else if (msg.type === 'site.oauth') {
          setOauth(prev => ({
            ...prev,
            [msg.site]: { ...prev[msg.site], ...msg, lines: prev[msg.site]?.lines || [] },
          }));
        } else if (msg.type === 'site.oauth.line') {
          setOauth(prev => {
            const cur = prev[msg.site] || { lines: [] };
            const lines = [...(cur.lines || []), msg.text].slice(-80);
            return { ...prev, [msg.site]: { ...cur, lines } };
          });
        } else if (msg.type === 'tool.progress') {
          setTools(prev => ({ ...prev, [msg.name]: { status: msg.status, pct: msg.pct, error: msg.error } }));
        }
      };
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [upsert]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const createJobs = useCallback(async (urls, options) => {
    const { created } = await jobsApi.create(urls, options);
    created.forEach(upsert);
    return created;
  }, [upsert]);

  // A 404 here just means the job is already gone — reconcile locally, don't throw.
  const dropLocal = useCallback((id) => {
    setJobs(prev => { const n = { ...prev }; delete n[id]; return n; });
    setLogs(prev => { const n = { ...prev }; delete n[id]; return n; });
  }, []);

  const cancel = useCallback(async (id) => {
    try { await jobsApi.cancel(id); }
    catch (e) { if (e?.response?.status === 404) dropLocal(id); else toast.error('Could not cancel'); }
  }, [dropLocal]);

  const retry = useCallback(async (id) => {
    try { await jobsApi.retry(id); setLogs(p => ({ ...p, [id]: [] })); }
    catch (e) { if (e?.response?.status === 404) dropLocal(id); else toast.error('Could not retry'); }
  }, [dropLocal]);

  const remove = useCallback(async (id) => {
    try { await jobsApi.remove(id); }
    catch (e) { if (e?.response?.status !== 404) toast.error('Could not remove'); }
    dropLocal(id);
  }, [dropLocal]);

  const deleteFiles = useCallback(async (id) => {
    try { return await jobsApi.deleteFiles(id); }
    catch (e) { if (e?.response?.status !== 404) { toast.error('Could not delete files'); throw e; } }
    finally { dropLocal(id); }
  }, [dropLocal]);

  const clearFinished = useCallback(async () => {
    try { await jobsApi.clearFinished(); }
    catch { toast.error('Could not clear'); return; }
    setJobs(prev => Object.fromEntries(Object.entries(prev).filter(([, j]) => ACTIVE.has(j.status))));
  }, []);

  const clearOauth = useCallback((site) => {
    setOauth(prev => { const n = { ...prev }; delete n[site]; return n; });
  }, []);

  const list = Object.values(jobs).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const active = list.filter(j => ACTIVE.has(j.status));
  const finished = list.filter(j => !ACTIVE.has(j.status));

  return (
    <JobsContext.Provider value={{
      jobs, list, active, finished, logs, connected,
      oauth, clearOauth, tools,
      refresh, createJobs, cancel, retry, remove, deleteFiles, clearFinished,
    }}>
      {children}
    </JobsContext.Provider>
  );
}

export function useJobs() {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error('useJobs must be used within JobsProvider');
  return ctx;
}
