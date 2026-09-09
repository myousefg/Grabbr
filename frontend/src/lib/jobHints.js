import { useEffect, useState } from 'react';

export const RATE_LIMIT_COOLDOWN_MIN = 30;

/**
 * Minutes the site is likely still throttling, based on when the job failed.
 * Advisory only — Retry stays enabled; the number just tells the user how long
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

/** hint -> i18n key for the amber chip on JobCard / History. */
export const HINT_KEY = {
  auth: 'dashboard.needsAuth',
  cookies_locked: 'dashboard.cookiesLocked',
  rate_limited: 'dashboard.rateLimited',
};
