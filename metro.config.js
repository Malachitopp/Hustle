// Metro, with Sentry's additions: each bundle and its source map share a debug ID, so Sentry can
// match a crash in a release build to the right source map and show a readable stack trace.
// https://docs.sentry.io/platforms/react-native/manual-setup/expo/
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
