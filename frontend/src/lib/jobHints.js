import { useEffect, useState } from 'react';

export const RATE_LIMIT_COOLDOWN_MIN = 30;

/**
 * Minutes the site is likely still throttling, based on when the job failed.
 * Advisory only. Retry stays enabled; the number just tells the user how long
 * to reasonably wait. 0 = the window has passed.
 */
export function retryCooldownMin(job) {
  if (job?.hint !== 'rate_limited' || !job.finished_at) return 0;
  const elapsedMin = (Date.now() - new Date(job.finished_at).getTime()) / 60000;
  return Math.max(0, Math.ceil(RATE_LIMIT_COOLDOWN_MIN - elapsedMin));
}

/** Re-render roughly once a minute while a job is still in its cooldown window. */
export function useCooldownTick(job) {
  const [, force] = useState(0);
  useEffect(() => {
    if (job?.hint !== 'rate_limited') return undefined;
    const id = setInterval(() => force(n => n + 1), 30000);
    return () => clearInterval(id);
  }, [job?.hint]);
  return retryCooldownMin(job);
}

const TRICKLE_TIME_CONSTANT_SEC = 12; // how quickly the fake curve ramps up
const TRICKLE_CEILING = 92;           // approaches but never claims done on its own

/**
 * Most gallery-dl downloads have no file-count total (no Preview run) and no
 * byte-level signal the way the yt-dlp path now has, so the queue used to
 * show a sweeping "something is happening" bar for the whole run and then
 * jump straight to done with nothing in between. This fakes a smooth,
 * ever-slowing climb toward (not to) 100% from the moment the job actually
 * started, so the bar keeps visibly moving through the run instead of
 * looking frozen until the instant it finishes.
 */
export function useTrickleProgress(job) {
  const [, force] = useState(0);
  const running = job?.status === 'running';
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => force(n => n + 1), 300);
    return () => clearInterval(id);
  }, [running]);
  if (!running || !job.started_at) return null;
  const elapsedSec = (Date.now() - new Date(job.started_at).getTime()) / 1000;
  if (elapsedSec < 0) return null;
  return TRICKLE_CEILING * (1 - Math.exp(-elapsedSec / TRICKLE_TIME_CONSTANT_SEC));
}

/** hint -> i18n key for the amber chip on JobCard / History. */
export const HINT_KEY = {
  auth: 'dashboard.needsAuth',
  cookies_locked: 'dashboard.cookiesLocked',
  rate_limited: 'dashboard.rateLimited',
};
