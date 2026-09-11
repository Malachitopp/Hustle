/**
 * Retry tests: a failed attempt gets two more goes, at the set delays, and no more; a success or
 * a stop ends it early. Time is faked, so nothing here waits.
 */
import { RETRY_DELAYS, withRetries } from '@/hooks/retries';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

/** Lets the attempt just made settle, without moving the clock. */
const settle = () => jest.advanceTimersByTimeAsync(0);

describe('trying again', () => {
  it('tries once straight away and, while attempts fail, again after each delay, then stops', async () => {
    const attempt = jest.fn<Promise<boolean>, []>().mockResolvedValue(false);
    withRetries(attempt);
    await settle();
    expect(attempt).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(RETRY_DELAYS[0] - 1);
    expect(attempt).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(attempt).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(RETRY_DELAYS[1]);
    expect(attempt).toHaveBeenCalledTimes(3);

    await jest.advanceTimersByTimeAsync(10 * 60_000);
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('stops as soon as an attempt goes through', async () => {
    const attempt = jest.fn<Promise<boolean>, []>().mockResolvedValueOnce(false).mockResolvedValue(true);
    withRetries(attempt);
    await jest.advanceTimersByTimeAsync(RETRY_DELAYS[0]);
    expect(attempt).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(10 * 60_000);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('makes no retry after being stopped', async () => {
    const attempt = jest.fn<Promise<boolean>, []>().mockResolvedValue(false);
    const stop = withRetries(attempt);
    await settle();
    stop();
    await jest.advanceTimersByTimeAsync(10 * 60_000);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('makes no retry when stopped while the first attempt is still under way', async () => {
    let finish: (done: boolean) => void = () => {};
    const attempt = jest.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    const stop = withRetries(attempt);
    stop();
    finish(false);
    await jest.advanceTimersByTimeAsync(10 * 60_000);
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
