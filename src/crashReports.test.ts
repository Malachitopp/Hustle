/**
 * Crash report adapter tests: nothing starts without a DSN, Sentry is never told who the user is
 * or asked for usage analytics, and a caught error is reported under what the app was doing.
 * Sentry itself is a stub here; the readme says how to watch a real report arrive.
 */
import * as Sentry from '@sentry/react-native';

import { reportCrash, reportError, sendTestError, startCrashReports } from '@/crashReports';

jest.mock('@sentry/react-native', () => ({ init: jest.fn(), captureException: jest.fn(), getClient: jest.fn() }));

const sentry = Sentry as unknown as { init: jest.Mock; captureException: jest.Mock; getClient: jest.Mock };
const DSN = 'https://public-key@o1.ingest.sentry.io/2';

/** Sentry options that would send usage, performance or what was on the screen. */
const ANALYTICS = [
  'tracesSampleRate',
  'tracesSampler',
  'profilesSampleRate',
  'replaysSessionSampleRate',
  'replaysOnErrorSampleRate',
  'attachScreenshot',
  'attachViewHierarchy',
  'enableLogs',
];

beforeEach(() => {
  sentry.init.mockReset();
  sentry.captureException.mockReset();
  sentry.getClient.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('starting crash reports', () => {
  it('starts nothing in a build without a DSN', () => {
    startCrashReports(undefined);
    startCrashReports('');
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it('never sends who the user is, and asks for no usage analytics', () => {
    startCrashReports(DSN);
    expect(sentry.init).toHaveBeenCalledTimes(1);
    const options = sentry.init.mock.calls[0][0];
    expect(options).toMatchObject({ dsn: DSN, sendDefaultPii: false, enableAutoSessionTracking: false });
    for (const option of ANALYTICS) expect(options).not.toHaveProperty(option);
  });
});

describe('reporting', () => {
  it('reports a caught error under what the app was doing, with the error itself as the cause', () => {
    const cause = new Error('database is locked');
    reportError('Could not save the history.', cause);
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    const [reported] = sentry.captureException.mock.calls[0];
    expect(reported).toBeInstanceOf(Error);
    expect(reported.message).toBe('Could not save the history.');
    expect(reported.cause).toBe(cause);
    expect(console.error).toHaveBeenCalledWith('Could not save the history.', cause);
  });

  it('reports a screen that crashed while drawing as fatal', () => {
    const crash = new TypeError("Cannot read property 'name' of undefined");
    reportCrash(crash);
    expect(sentry.captureException).toHaveBeenCalledWith(crash, { level: 'fatal' });
  });

  it('sends a test error only while crash reports are on', () => {
    sentry.getClient.mockReturnValue(undefined);
    expect(sendTestError()).toBe(false);
    expect(sentry.captureException).not.toHaveBeenCalled();

    sentry.getClient.mockReturnValue({});
    expect(sendTestError()).toBe(true);
    expect(sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
  });
});
