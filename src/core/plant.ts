/**
 * The plant: how alive it is, worked out from the record and the session in progress. Nothing
 * about the plant is ever stored; it is replayed from the running periods every time.
 *
 * Work raises life by 10% an hour, up to 100%. A stop (the end of any running period, whether a
 * pause or End) starts a wilt: life falls in a straight line and reaches 0% exactly 6 hours
 * later, whatever level it started at (ADR-0001). Working again before then keeps the same
 * plant. At 0% the plant dies, and the next running moment plants a new one at 0%.
 */
import { allPeriods } from './actions';
import type { Instant, State } from './state';

const HOUR = 60 * 60_000;

/** Percentage points of life gained per hour of work. Full bloom is 10 hours from empty. */
export const GROWTH_PER_HOUR = 10;

/**
 * How long a wilt takes to reach 0% from any level. The same 6 hours as a paused session's
 * auto-end, on purpose: a pause that ends the session also kills the plant (ADR-0001).
 */
export const WILT_DURATION = 6 * HOUR;

/** The six ways a plant can be drawn. Every alive look covers a band of life; dead is its own. */
export type Look = 'dead' | 'wilting' | 'drooping' | 'bud' | 'opening' | 'full-bloom';

/** The lowest life for each alive look, highest first. Below the last one the plant is wilting. */
const BANDS: readonly [life: number, look: Look][] = [
  [80, 'full-bloom'],
  [60, 'opening'],
  [40, 'bud'],
  [20, 'drooping'],
];

/** The look for an alive plant at `life` percent. */
export function lookFor(life: number): Look {
  for (const [from, look] of BANDS) {
    if (life >= from) return look;
  }
  return 'wilting';
}

export type PlantView =
  /** Before the very first session: only dirt. */
  | { state: 'none' }
  | {
      state: 'alive';
      /** From 0 to 100. */
      life: number;
      look: Look;
      /** The first running moment of this plant. Stays the same for as long as it lives. */
      plantedAt: Instant;
      /** When life reaches 0% unless work starts again first; null while a session is running. */
      diesAt: Instant | null;
    }
  | {
      state: 'dead';
      life: 0;
      look: 'dead';
      plantedAt: Instant;
      /** When life reached 0%. The dead plant stays on screen until the next running moment. */
      diedAt: Instant;
    };

/**
 * The plant at instant `now`. Expects a state that has already been settled (an auto-ended
 * session moved into the record), which `view` takes care of.
 */
export function plantView(state: State, now: Instant): PlantView {
  const periods = allPeriods(state, now);
  if (periods.length === 0) return { state: 'none' };

  let alive = false;
  let life = 0;
  let plantedAt = periods[0].from;
  let lastStop = periods[0].from;

  for (const period of periods) {
    // Clocks can be set backwards; a period never starts before the stop that came before it.
    const from = Math.max(period.from, lastStop);
    const to = Math.max(period.to, from);
    if (alive) {
      const gap = from - lastStop;
      if (gap >= WILT_DURATION) alive = false;
      else life = wilted(life, gap);
    }
    if (!alive) {
      alive = true;
      plantedAt = from;
      life = 0;
    }
    life = Math.min(100, life + ((to - from) / HOUR) * GROWTH_PER_HOUR);
    lastStop = to;
  }

  const running = state.current !== null && state.current.runningSince !== null;
  if (running) return { state: 'alive', life, look: lookFor(life), plantedAt, diesAt: null };

  const diesAt = lastStop + WILT_DURATION;
  if (now >= diesAt) return { state: 'dead', life: 0, look: 'dead', plantedAt, diedAt: diesAt };
  life = wilted(life, Math.max(0, now - lastStop));
  return { state: 'alive', life, look: lookFor(life), plantedAt, diesAt };
}

/** Life after wilting for `elapsed` milliseconds from `life`, assuming the wilt is not over. */
function wilted(life: number, elapsed: number): number {
  return life * (1 - elapsed / WILT_DURATION);
}
