/**
 * Crash reports: the thin adapter over Sentry, and the only code that talks to it. Crashes, and
 * the errors the app catches but cannot get past, go to the Sentry project named by
 * EXPO_PUBLIC_SENTRY_DSN, read from .env.local when running locally and from EAS environment
 * variables in a build. Without it nothing is reported, and the app works the same.
 *
 * A report says what went wrong and where: the error, its stack trace, the phone model and the
 * iOS and app versions. It never says who: no display name, email, account or IP address. There
 * are no usage analytics either: no counts of app opens, no performance tracing, no screenshots
 * and no replays, none of which Sentry does unless asked.
 */
import * as Sentry from '@sentry/react-native';

/**
 * Starts crash reporting as the app loads. From then on anything thrown and not caught is
 * reported, in a handler, a timer, a promise or native code. Reports are marked development or
 * production by the bundle's `__DEV__`, so a development build's stay apart from the App Store's.
 * A screen that throws while drawing is the exception: React Native hands that to its own
 * handler, not Sentry's, so the root layout's error boundary catches it and calls `reportCrash`.
 */
export function startCrashReports(dsn: string | undefined = process.env.EXPO_PUBLIC_SENTRY_DSN): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    // Nothing that says who the user is. Sentry's default, spelled out because the App Privacy
    // label ("crash data, not linked to identity") depends on it.
    sendDefaultPii: false,
    // No release-health sessions: they count every time the app is opened, which is usage.
    enableAutoSessionTracking: false,
  });
}

/**
 * Reports an error the app caught but could not get past, such as a save that failed, and logs it
 * as before. The report is titled with `message`, what the app was trying to do, and carries the
 * error that stopped it, stack trace and all, as its cause. None of the messages name the user.
 */
export function reportError(message: string, cause?: unknown): void {
  if (cause === undefined) console.error(message);
  else console.error(message, cause);
  const error = new Error(message);
  if (cause !== undefined) error.cause = cause;
  Sentry.captureException(error);
}

/** Reports a screen that threw while drawing, which the root layout's error boundary caught. */
export function reportCrash(error: Error): void {
  Sentry.captureException(error, { level: 'fatal' });
}

/**
 * Sends a deliberate test error, to check that reports reach Sentry with a readable stack trace.
 * Says whether it was sent, which it cannot be while crash reporting is off.
 */
export function sendTestError(): boolean {
  if (!Sentry.getClient()) return false;
  Sentry.captureException(new Error('Test error, sent on purpose from Settings.'));
  return true;
}
