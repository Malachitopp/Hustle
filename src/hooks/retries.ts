/**
 * Trying again after a hiccup. Uploads and restores happen at the moments the spec names and
 * never on a timer, so a one-off failure right after one of those moments (the server briefly
 * refusing a brand-new sign-in, say) would otherwise wait for the next moment, which may be a
 * sign-out away. This gives a failed attempt a couple more goes, a few seconds apart, and then
 * leaves it to the next moment. Nothing polls: an attempt that goes through ends it.
 */

/** How long after a failed attempt the next one comes, then how long after that failure the last one comes. */
export const RETRY_DELAYS = [3_000, 10_000];

/**
 * Runs `attempt` now and, each time it reports that not everything went through, again after
 * the next of `RETRY_DELAYS`, until it succeeds or the delays run out. Returns a function that
 * stops any retry still to come, for when a newer attempt takes over or the caller goes away.
 */
export function withRetries(attempt: () => Promise<boolean>): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retries = 0;

  const run = async () => {
    const done = await attempt();
    if (stopped || done || retries >= RETRY_DELAYS.length) return;
    timer = setTimeout(run, RETRY_DELAYS[retries]);
    retries += 1;
  };
  run();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
