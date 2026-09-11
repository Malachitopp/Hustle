# Hustle

An iPhone app for timing your own work honestly. A pixel-art rose grows while you work and wilts when you stop. The v1 design is in [docs/spec.md](docs/spec.md), the vocabulary in [CONTEXT.md](CONTEXT.md), and the build tickets are GitHub issues #2 to #18.

## Run it

Expo SDK 57. Everything except signing in works in Expo Go on an iPhone; sign-in needs a development build (below), because Apple ties it to the app's own bundle id and Google's sign-in is a native module Expo Go does not carry.

```sh
npm install
cp .env.example .env.local   # then fill in the dev Supabase project's URL and public key
npx expo start
```

Scan the QR code with the Camera app on the iPhone. Metro serves the app over the local network, so the phone and the computer need the same Wi-Fi. Without a `.env.local` the app runs as a guest-only app: nothing to sign in to, nothing uploads. Without the two Google ids in it, there is no Sign in with Google. Without the Sentry DSN, nothing is reported to Sentry.

### Development build

```sh
eas env:create --scope project --environment development --visibility plaintext --name EXPO_PUBLIC_SUPABASE_URL --value https://<dev-project>.supabase.co
eas env:create --scope project --environment development --visibility plaintext --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <dev-anon-key>
eas env:create --scope project --environment development --visibility plaintext --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value <ios-client-id>
eas env:create --scope project --environment development --visibility plaintext --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value <web-client-id>
eas env:create --scope project --environment development --visibility plaintext --name EXPO_PUBLIC_SENTRY_DSN --value <sentry-dsn>
eas build --profile development --platform ios
```

Install the build from the link EAS gives, then `npx expo start` as before and open the app: it connects to Metro like Expo Go does. Do the same for `production` with the prod project's values before the first App Store build.

The app config is `app.json` plus `app.config.ts`, which adds the Google sign-in plugin (and the URL scheme Google hands the sign-in back through) only when `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` is set. A build's native config therefore depends on the environment it was built with: changing that id means a new build.

### Google sign-in

In the Google Cloud Console, under APIs & Services > Credentials, with the OAuth consent screen set up, create two OAuth client ids: an **iOS** one for the bundle id `com.malachitopp.hustle`, and a **Web application** one. One Google Cloud project serves both Supabase projects. In each Supabase project, under Authentication > Providers, turn Google on with the web client's id and secret and list both client ids (iOS and web, comma separated) under the client ids the provider accepts tokens for. The app signs in natively: Google's SDK hands back an identity token and Supabase checks it, so no redirect URL is involved. Also turn on the provider's **Skip nonce checks**: Google's iOS SDK writes a nonce of its own into the token, the free sign-in library gives the app no way to see it, and without the switch Supabase refuses the sign-in with "Passed nonce and nonce in id_token should either both exist or not".

## Check it

```sh
npm test            # Jest core tests
npm run typecheck   # tsc
npm run lint        # ESLint
npm run check       # all three
npm run test:db     # Jest database tests against the dev project (needs .env.local, the network and the Edge Functions deployed)
```

The Edge Functions are Deno code, which `tsc` and ESLint leave alone. With Deno installed (`npm install deno` anywhere works), `deno check supabase/functions/*/index.ts` type-checks them.

## Supabase

Two hosted projects, dev and prod. The schema lives in `supabase/migrations` and is applied with the Supabase CLI (installed as a dev dependency, so `npx supabase`):

```sh
npx supabase login
npx supabase link --project-ref <dev-project-ref>
npx supabase db push
```

Then the same `link` and `push` against prod when it is time. Three dashboard settings the code relies on, in each project: under Authentication, the Apple provider is on with `com.malachitopp.hustle` as a client id (for native sign-in); the Google provider is on as described under Google sign-in above; and on dev only, "Confirm email" is off, so the database tests can sign throwaway users up and in at once. The tests leave those users behind on dev.

The database lets each user add and read their own sessions and never change or delete them (row-level security plus revoked privileges), and add, read, change and delete their own goals, switch history and settings (the `profiles` table), never anyone else's. The app saves through functions rather than straight to the tables: `save_session` stores a session and its days in one step and ignores a session it already has; `save_goal` stores a goal and its switches as they are now, replacing what the account held; `delete_goal` leaves a marker of the deletion so another phone learns of it; `save_profile` stores the settings. Two things are for the server alone: `apple_tokens`, which holds the refresh token behind each Sign in with Apple (no policies, and the API's roles have no privileges on it), and `delete_user_rows`, which removes every row a user owns.

### Edge Functions

Two, in `supabase/functions`, deployed with `npx supabase functions deploy` (the CLI bundles them server-side, so no Docker is needed):

- `save-apple-token`: the app calls it right after each Sign in with Apple with Apple's one-time authorization code. It exchanges the code with Apple for a refresh token and keeps it in `apple_tokens`.
- `delete-account`: revokes that token with Apple if there is one, deletes every row the caller owns (`delete_user_rows`) and removes their login from Supabase Auth.

Both check the caller themselves through Supabase Auth; `verify_jwt` is off for them in `supabase/config.toml`, because the app's key is a publishable key, not a JWT. The Apple calls need a Sign in with Apple key: in the Apple Developer portal, under Certificates, Identifiers & Profiles > Keys, make a key with Sign in with Apple enabled and grouped with the Hustle App ID, download the `.p8` file (Apple offers it once) and note the Key ID; the Team ID is shown at the top right of the portal. Then, in each Supabase project:

```sh
npx supabase secrets set APPLE_TEAM_ID=<team id> APPLE_KEY_ID=<key id> APPLE_PRIVATE_KEY="$(cat AuthKey_<key id>.p8)"
```

Until those are set, `save-apple-token` answers 503 and the sign-in stands regardless (keeping the token is best effort), and `delete-account` works for any user who has no token to revoke. The functions' logs are under Edge Functions in the dashboard.

## Crash reports

Crashes and errors go to Sentry, to one React Native project in the existing Sentry account. Development and release builds share it, and Sentry keeps them apart by environment: `development` for JavaScript served by Metro, `production` for a release build. There are no usage analytics, and no report says who it came from: no display name, email, account or IP address, and no session counts, performance tracing, screenshots or replays. All of that is set in `src/crashReports.ts`, and its tests check it.

What gets reported:

- anything thrown and not caught, in JavaScript (a handler, a timer, a promise) or in native code;
- a screen that throws while drawing. React Native hands that to its own handler rather than Sentry's, so the root layout exports an `ErrorBoundary` that reports it and shows "Something went wrong" with Try again;
- errors the app catches but cannot get past (loading or saving the history, scheduling notifications), through `reportError`. Failed uploads and downloads are not reported, since being offline is normal.

The DSN is public, like the Supabase key: `EXPO_PUBLIC_SENTRY_DSN` in `.env.local`, and an EAS environment variable for builds (see Development build, and the same for `production`). Without it nothing is reported.

Readable stack traces: a development build's are worked out through Metro. A release build uploads its source maps and native debug symbols to Sentry while EAS builds it, through the `@sentry/react-native/expo` plugin in `app.json` and the Sentry Metro config in `metro.config.js`. The plugin needs the Sentry organization and project slugs (in its options in `app.json`, or as `SENTRY_ORG` and `SENTRY_PROJECT` EAS variables) and an auth token (in Sentry, Settings > Auth Tokens, an organization token) as a secret EAS variable in each environment that makes release builds:

```sh
eas env:create --scope project --environment production --visibility secret --name SENTRY_AUTH_TOKEN --value <token>
```

A release build without the token fails at "Bundle React Native code and images" rather than ship without readable stack traces. Development builds upload nothing: the `development` profile in `eas.json` sets `SENTRY_DISABLE_AUTO_UPLOAD`, because Sentry's build step otherwise stops even a Debug build that has no Sentry token of its own.

To check the whole path, hold the version line at the foot of Settings for two seconds. The app sends a test error and says so, and the error shows up under Issues in Sentry within a minute or so, its stack trace naming `src/crashReports.ts` and the Settings screen.

## Backups

Every night at 02:17 UTC a GitHub Action in the private repo [Malachitopp/hustle-backups](https://github.com/Malachitopp/hustle-backups) dumps the prod database with `pg_dump` (through the Supabase CLI), encrypts the dump with the backup password and keeps it as a release there, keeping the newest 30. A backup holds the schema, every row (the logins included) and the migration history. It doesn't hold the project's settings, the Edge Functions or their secrets, which this readme covers. The database connection string and the backup password live only in that repo's secrets; the password is also in the owner's password manager, since no backup opens without it. That repo's README says how to restore: into a new project, over prod, or into dev to practise. Its Restore workflow does it in one transaction and checks every table's row count, so a restore that fails changes nothing.

These backups aren't the **Back up** of CONTEXT.md, which is one phone uploading to its account.

Until prod exists, the backups read dev. When prod is created, set that repo's `SUPABASE_DB_URL` secret to prod's session pooler connection string.

## Privacy policy and support

Both pages are published with GitHub Pages from
[Malachitopp/hustle-help](https://github.com/Malachitopp/hustle-help), a separate public repo,
because this one is private and a free GitHub account can only publish Pages from a public repo:

- <https://malachitopp.github.io/hustle-help/privacy/>
- <https://malachitopp.github.io/hustle-help/support/>

Settings links to both, and so does the App Store listing. The policy says what Hustle holds, who
else touches it (Supabase, Sentry, GitHub's encrypted backups, and Apple and Google for sign-in),
how long it is kept and how deletion works. Whenever that changes, three things change together:
the policy, `ios.privacyManifests` in `app.json`, and the App Privacy label in App Store Connect.

## The icon and the launch image

```sh
npm run icons
```

Draws `assets/icon.png` (1024 square, the bloom on black, no transparency, as the App Store asks)
and `assets/splash-icon.png` (the whole plant, transparent, painted on black by the splash screen
plugin) from the rose's own pixel grids in `src/plants`. Node reads that TypeScript directly, so
there is one copy of the rose and the tile on the home screen cannot drift from the plant in the
app. Run it after changing the rose or the default petal colour.

## The App Store

[docs/app-store.md](docs/app-store.md) holds the review notes to paste into App Store Connect, the
App Privacy answers, the listing details, and the ordered list of what to do before the first
production build: creating the prod Supabase project, applying the schema and the Edge Functions
to it, and pointing the production build and the nightly backups at it.

## How the code is laid out

```
src/
  core/         every product rule, reached only through core/index.ts
    __tests__/  Jest tests that go through the entry point and pass every time in explicitly
  app/          screens (expo-router): _layout.tsx (with the ErrorBoundary that stands in for a crashed screen),
                onboarding.tsx (first launch, until a display name is chosen), then (tabs)/ for Home, Calendar,
                Goals, Settings
  storage/      the phone's copy of the history (display name, petal colour, sessions, goals, notification switches,
                account, the upload queues and whether Save your progress has been offered), one JSON document
                in a SQLite key-value store
  store/        keeps the history in memory, applies actions through the core, saves after each change
  plants/       the kinds of plant as data (pixel grids over an indexed palette) and the petal colours
  ui/           the black 8-bit look: PixelText, PixelButton, PixelDialog, PixelToggle, PixelSwitch, PixelInput,
                PixelBar (progress), PixelDatePicker, PixelConfetti, Screen,
                PixelArt (crisp pixel grids), PixelSprite (one-colour icons), PlantPicture,
                SignInButtons (Sign in with Apple and Sign in with Google, for Save your progress and Settings)
  hooks/        useNow, which refreshes screens once a minute and on return to the foreground;
                useNotificationSync, which gives the phone the core's notification schedule whenever it changes;
                useAccountSync, which keeps the core's note of who is signed in matching Supabase's session;
                useUploadSync, which uploads waiting sessions, goals and settings after a change, on foreground and
                when the connection returns;
                useRestoreSync, which downloads the account's record, goals and settings after a sign-in, at the same moments;
                retries, which gives a failed upload or download two more goes a few seconds apart (no polling);
                useMonthRestore, which fetches the month the Calendar shows, once per month while the app stays open;
                useGoalsRestore, which fetches the account's goals when Goals is opened, once while the app stays open
  phone.ts      session and goal IDs and the phone's time zone
  notifications.ts  the thin adapter over expo-notifications: replaces the phone's pending notifications with the
                core's schedule, and asks permission at the first Start (local only, no push server)
  supabase.ts   the Supabase client, from EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (null without them)
  account.ts    Sign in with Apple and Sign in with Google through Supabase Auth (native identity tokens; Apple's
                with a nonce), watching the session, signing out and deleting the account through the Edge Functions
  uploads.ts    sends ended sessions, changed and deleted goals and changed settings to the database's functions,
                one run at a time
  restore.ts    downloads what the account holds (everything, one month of sessions, or the goals) for the core to
                merge by id
  entitlements.ts  the single entitlement check (everything is free for now)
  crashReports.ts  the thin adapter over Sentry: starts it (only with a DSN), reports crashes and the errors the app
                catches but can't get past, and sends the test error; never who the user is, no usage analytics
  theme.ts      colours and fonts
supabase/
  migrations/   the database schema, applied with `npx supabase db push`
  functions/    the two Edge Functions (Deno), save-apple-token and delete-account, with what they share in _shared/;
                deployed with `npx supabase functions deploy`
  tests/        Jest database tests run against the dev project as throwaway users, deleted again at the end of each
                file through delete-account (`npm run test:db`)
scripts/
  make-icons.mjs  draws the app icon and the launch image from the rose's pixel grids (`npm run icons`)
```

The core has two operations: `apply(state, action)` for a timestamped action, and `view(state, now, timeZone)` for everything the screens show. It never reads the clock and contains no UI, storage, network or device code. ESLint refuses imports of the core's internal files from anywhere else.
