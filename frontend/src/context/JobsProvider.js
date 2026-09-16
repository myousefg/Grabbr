import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { jobsApi, WS_URL } from '@/lib/api';
import { isElectron } from '@/lib/electron';
import { useSettings } from '@/context/SettingsProvider';

const JobsContext = createContext(null);

const ACTIVE = new Set(['queued', 'running', 'paused']);
const LOG_CAP = 250;
const WS_MIN_DELAY = 1000;
const WS_MAX_DELAY = 30000;
const LINGER_MS = 5000; // how long a just-finished job stays in "Queue & Active"

function notify(title, body) {
  if (isElectron && window.electronAPI.notify) window.electronAPI.notify(title, body);
}

export function JobsProvider({ children }) {
  const { settings } = useSettings();
  const notifyEnabled = settings?.notifications_enabled ?? true;
  const notifyEnabledRef = useRef(notifyEnabled);
  notifyEnabledRef.current = notifyEnabled;

  const [jobs, setJobs] = useState({});          // id -> job
  const [logs, setLogs] = useState({});          // id -> [{kind,text}]
  const [oauth, setOauth] = useState({});        // site -> {url,done,ok,keys,error,lines}
  const [tools, setTools] = useState({});        // name -> {status,pct,error}
  const [connected, setConnected] = useState(false);
  const [lingering, setLingering] = useState({}); // id -> true (just-finished, still shown in Queue & Active)

  const wsRef = useRef(null);
  const retryRef = useRef(null);
  const attemptRef = useRef(0);                  // WS reconnect backoff counter
  const prevStatusRef = useRef(null);            // id -> last-seen status (null = not primed yet)
  const openJobsRef = useRef(new Set());         // ids whose card is expanded; pauses the linger timer
  const lingerTimersRef = useRef({});            // id -> timeout handle

  const clearLingerTimer = useCallback((id) => {
    clearTimeout(lingerTimersRef.current[id]);
    delete lingerTimersRef.current[id];
  }, []);

  // Starts (or restarts) the countdown that drops a finished job out of
  // "Queue & Active". Skipped while the job's log panel is open, so checking
  // logs on a single quick download doesn't race the job disappearing first.
  const scheduleLingerExpiry = useCallback((id) => {
    clearLingerTimer(id);
    if (openJobsRef.current.has(id)) return;
    lingerTimersRef.current[id] = setTimeout(() => {
      delete lingerTimersRef.current[id];
      setLingering(prev => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, LINGER_MS);
  }, [clearLingerTimer]);

  const setJobOpen = useCallback((id, isOpen) => {
    if (isOpen) {
      openJobsRef.current.add(id);
      clearLingerTimer(id);
    } else {
      openJobsRef.current.delete(id);
      scheduleLingerExpiry(id);
    }
  }, [clearLingerTimer, scheduleLingerExpiry]);

  useEffect(() => () => {
    Object.values(lingerTimersRef.current).forEach(clearTimeout);
  }, []);

  const upsert = useCallback((job) => {
    if (!job || !job.id) return;
    setJobs(prev => ({ ...prev, [job.id]: { ...prev[job.id], ...job } }));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const list = await jobsApi.list();
      setJobs(Object.fromEntries(list.map(j => [j.id, j])));
    } catch { /* backend not up yet */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Terminal-transition side effects: desktop notifications + the "Queue &
  // Active" linger window ──────────────────────────────────────────────────
  // Only jobs that transition in THIS batch count toward the notify summary
  // below; counting every done/error job ever loaded (including old History
  // entries) made a bogus "Queue finished" toast fire alongside almost every
  // single completed download.
  useEffect(() => {
    const seen = prevStatusRef.current;
    const now = {};
    const justFinished = [];
    for (const j of Object.values(jobs)) now[j.id] = j.status;

    if (seen) {
      for (const j of Object.values(jobs)) {
        const was = seen[j.id];
        if (was && ACTIVE.has(was) && !ACTIVE.has(j.status)) justFinished.push(j);
      }
      if (justFinished.length) {
        setLingering(prev => {
          const next = { ...prev };
          for (const j of justFinished) next[j.id] = true;
          return next;
        });
        for (const j of justFinished) scheduleLingerExpiry(j.id);
      }
      if (notifyEnabledRef.current) {
        if (justFinished.length === 1) {
          const j = justFinished[0];
          if (j.status === 'error') notify('Download failed', j.url);
          else if (j.status === 'done') {
            const n = j.files_ok || 0;
            notify(`Downloaded ${n} file${n === 1 ? '' : 's'}`, j.url);
          }
        } else if (justFinished.length > 1) {
          const done = justFinished.filter(j => j.status === 'done').length;
          const failed = justFinished.filter(j => j.status === 'error').length;
          notify('Queue finished', `${done} done${failed ? `, ${failed} failed` : ''}`);
        }
      }
    }
    prevStatusRef.current = now;
  }, [jobs, scheduleLingerExpiry]);

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
              pct: msg.pct,
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

  // A 404 here just means the job is already gone. Reconcile locally, don't throw.
  const dropLocal = useCallback((id) => {
    setJobs(prev => { const n = { ...prev }; delete n[id]; return n; });
    setLogs(prev => { const n = { ...prev }; delete n[id]; return n; });
    clearLingerTimer(id);
    openJobsRef.current.delete(id);
    setLingering(prev => { if (!(id in prev)) return prev; const n = { ...prev }; delete n[id]; return n; });
  }, [clearLingerTimer]);

  const cancel = useCallback(async (id) => {
    try { await jobsApi.cancel(id); }
    catch (e) { if (e?.response?.status === 404) dropLocal(id); else toast.error('Could not cancel'); }
  }, [dropLocal]);

  const pause = useCallback(async (id) => {
    try { await jobsApi.pause(id); }
    catch (e) { if (e?.response?.status === 404) dropLocal(id); else toast.error('Could not pause'); }
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
    try {
      const r = await jobsApi.deleteFiles(id);
      dropLocal(id);
      return r;
    } catch (e) {
      // 404: already gone, reconcile locally. 409: the backend refused (e.g.
      // a flat/shared folder) and the history entry is still there - don't
      // drop it locally or the UI would lie about what actually happened.
      if (e?.response?.status === 404) dropLocal(id);
      throw e;
    }
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
  // What "Queue & Active" renders: truly active jobs plus ones that just
  // finished, so completing a single download doesn't yank its card away
  // before there's a chance to check the log.
  const queueView = list.filter(j => ACTIVE.has(j.status) || lingering[j.id]);

  return (
    <JobsContext.Provider value={{
      jobs, list, active, finished, queueView, logs, connected,
      oauth, clearOauth, tools, setJobOpen,
      refresh, createJobs, cancel, pause, retry, remove, deleteFiles, clearFinished,
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
