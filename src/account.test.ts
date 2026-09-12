/**
 * Keeping Apple's token: what the app does when the server will not take it. The Supabase client
 * and crash reporting are stubs here; what the server does with a real code is covered by the
 * tests in supabase/tests. Time is faked, so nothing here waits.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';

import { saveAppleToken } from '@/account';
import { reportError } from '@/crashReports';
import { RETRY_DELAYS } from '@/hooks/retries';
import { supabase } from '@/supabase';

jest.mock('@/supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
jest.mock('@/crashReports', () => ({ reportError: jest.fn() }));

const invoke = (supabase as unknown as { functions: { invoke: jest.Mock } }).functions.invoke;
const reported = reportError as jest.Mock;

const kept = { data: { saved: true }, error: null };
/** The server answering and refusing: a status, and the reason in a JSON body, as the functions do. */
const refused = (status: number, reason: string) => ({
  data: null,
  error: new FunctionsHttpError({ status, json: () => Promise.resolve({ error: reason }) }),
});
/** No answer at all, which is what being offline looks like from here. */
const noAnswer = { data: null, error: new TypeError('Network request failed') };

/** Long enough that every retry has come and gone. */
const everyGo = () => jest.advanceTimersByTimeAsync(RETRY_DELAYS.reduce((total, delay) => total + delay, 0) + 1);

const GOES = RETRY_DELAYS.length + 1;

beforeEach(() => {
  jest.useFakeTimers();
  invoke.mockReset();
  reported.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("keeping Apple's token", () => {
  it('asks the server once when the token is kept', async () => {
    invoke.mockResolvedValue(kept);
    saveAppleToken('a-code');
    await everyGo();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('save-apple-token', { body: { authorizationCode: 'a-code' } });
    expect(reported).not.toHaveBeenCalled();
  });

  it('tries again while the server is having a bad day, and reports it once when the goes run out', async () => {
    invoke.mockResolvedValue(refused(502, 'Apple could not be reached.'));
    saveAppleToken('a-code');
    await everyGo();
    expect(invoke).toHaveBeenCalledTimes(GOES);
    expect(reported).toHaveBeenCalledTimes(1);
    // The status is what tells a missing key from an unreachable Apple from a refused write.
    expect(reported.mock.calls[0][0]).toContain('502');
  });

  it('stops as soon as a later go is taken, and says nothing', async () => {
    invoke.mockResolvedValueOnce(refused(500, 'Could not keep the token.')).mockResolvedValue(kept);
    saveAppleToken('a-code');
    await everyGo();
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(reported).not.toHaveBeenCalled();
  });

  it('gives up at once on a code Apple will not take, since another go would fare the same', async () => {
    invoke.mockResolvedValue(refused(400, 'Apple did not accept the code.'));
    saveAppleToken('a-code');
    await everyGo();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(reported).toHaveBeenCalledTimes(1);
  });

  it('gives up at once when nobody is signed in', async () => {
    invoke.mockResolvedValue(refused(401, 'Sign in first.'));
    saveAppleToken('a-code');
    await everyGo();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(reported).toHaveBeenCalledTimes(1);
  });

  it('says nothing when the server cannot be reached, which is ordinary', async () => {
    invoke.mockResolvedValue(noAnswer);
    saveAppleToken('a-code');
    await everyGo();
    expect(invoke).toHaveBeenCalledTimes(GOES);
    expect(reported).not.toHaveBeenCalled();
  });

  it('never rejects when the client throws', async () => {
    invoke.mockRejectedValue(new Error('the fetch blew up'));
    saveAppleToken('a-code');
    await expect(everyGo()).resolves.toBeUndefined();
    expect(reported).not.toHaveBeenCalled();
  });
});
