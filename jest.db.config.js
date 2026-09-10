/**
 * Jest config for the database tests in supabase/tests, which need the network and the dev
 * project: `npm run test:db`. `npm test` uses the config in package.json and leaves them out.
 * The transform is borrowed from jest-expo so TypeScript compiles the same way as in the core
 * tests, without the React Native setup those need.
 */
const expoPreset = require('jest-expo/jest-preset');

module.exports = {
  rootDir: __dirname,
  roots: ['<rootDir>/supabase/tests'],
  testEnvironment: 'node',
  transform: expoPreset.transform,
  transformIgnorePatterns: expoPreset.transformIgnorePatterns,
  setupFiles: ['<rootDir>/supabase/tests/env.ts'],
  testTimeout: 30_000,
};
