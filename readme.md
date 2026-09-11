# Hustle

An iPhone app for timing your own work honestly. A pixel-art rose grows while you work and wilts when you stop. The v1 design is in [docs/spec.md](docs/spec.md), the vocabulary in [CONTEXT.md](CONTEXT.md), and the build tickets are GitHub issues #2 to #18.

## Run it

Expo SDK 57. Everything except signing in works in Expo Go on an iPhone; sign-in needs a development build (below), because Apple ties it to the app's own bundle id and Google's sign-in is a native module Expo Go does not carry.

```sh
npm install
cp .env.example .env.local   # then fill in the dev Supabase project's URL and public key
npx expo start
```

Scan the QR code with the Camera app on the iPhone. Metro serves the app over the local network, so the phone and the computer need the same Wi-Fi. Without a `.env.local` the app runs as a guest-only app: nothing to sign in to, nothing uploads. Without the two Google ids in it, there is no Sign in with Google.

### Development build

```sh
eas env:create --scope project --environment development --visibility plaintext --name EXPO_PUBLIC_SUPABASE_URL --value https://<dev-project>.supabase.co
eas env:create --scope project --environment development --visibility plaintext --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <dev-anon-key>
eas env:create --scope project --environment development --visibility plaintext --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value <ios-client-id>
eas env:create --scope project --environment development --visibility plaintext --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value <web-client-id>
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

## How the code is laid out

```
src/
  core/         every product rule, reached only through core/index.ts
    __tests__/  Jest tests that go through the entry point and pass every time in explicitly
  app/          screens (expo-router): _layout.tsx, onboarding.tsx (first launch, until a display name is chosen),
                then (tabs)/ for Home, Calendar, Goals, Settings
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
  theme.ts      colours and fonts
supabase/
  migrations/   the database schema, applied with `npx supabase db push`
  functions/    the two Edge Functions (Deno), save-apple-token and delete-account, with what they share in _shared/;
                deployed with `npx supabase functions deploy`
  tests/        Jest database tests run against the dev project as throwaway users, deleted again at the end of each
                file through delete-account (`npm run test:db`)
```

The core has two operations: `apply(state, action)` for a timestamped action, and `view(state, now, timeZone)` for everything the screens show. It never reads the clock and contains no UI, storage, network or device code. ESLint refuses imports of the core's internal files from anywhere else.
