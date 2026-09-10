# Hustle

An iPhone app for timing your own work honestly. A pixel-art rose grows while you work and wilts when you stop. The v1 design is in [docs/spec.md](docs/spec.md), the vocabulary in [CONTEXT.md](CONTEXT.md), and the build tickets are GitHub issues #2 to #18.

## Run it

Expo SDK 57. Everything except Sign in with Apple works in Expo Go on an iPhone; sign-in needs a development build (below), because Apple ties it to the app's own bundle id.

```sh
npm install
cp .env.example .env.local   # then fill in the dev Supabase project's URL and public key
npx expo start
```

Scan the QR code with the Camera app on the iPhone. Metro serves the app over the local network, so the phone and the computer need the same Wi-Fi. Without a `.env.local` the app runs as a guest-only app: nothing to sign in to, nothing uploads.

### Development build

```sh
eas env:create --scope project --environment development --visibility plaintext --name EXPO_PUBLIC_SUPABASE_URL --value https://<dev-project>.supabase.co
eas env:create --scope project --environment development --visibility plaintext --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <dev-anon-key>
eas build --profile development --platform ios
```

Install the build from the link EAS gives, then `npx expo start` as before and open the app: it connects to Metro like Expo Go does. Do the same for `production` with the prod project's values before the first App Store build.

## Check it

```sh
npm test            # Jest core tests
npm run typecheck   # tsc
npm run lint        # ESLint
npm run check       # all three
npm run test:db     # Jest database tests against the dev project (needs .env.local and the network)
```

## Supabase

Two hosted projects, dev and prod. The schema lives in `supabase/migrations` and is applied with the Supabase CLI (installed as a dev dependency, so `npx supabase`):

```sh
npx supabase login
npx supabase link --project-ref <dev-project-ref>
npx supabase db push
```

Then the same `link` and `push` against prod when it is time. Two dashboard settings the code relies on, in each project: under Authentication, the Apple provider is on with `com.malachitopp.hustle` as a client id (for native sign-in); and on dev only, "Confirm email" is off, so the database tests can sign throwaway users up and in at once. The tests leave those users behind on dev.

The database lets each user add and read their own sessions and never change or delete them (row-level security plus revoked privileges), and the app saves through the `save_session` function, which stores a session and its days in one step and ignores a session it already has.

## How the code is laid out

```
src/
  core/         every product rule, reached only through core/index.ts
    __tests__/  Jest tests that go through the entry point and pass every time in explicitly
  app/          screens (expo-router): _layout.tsx, onboarding.tsx (first launch, until a display name is chosen),
                then (tabs)/ for Home, Calendar, Goals, Settings
  storage/      the phone's copy of the history (display name, sessions, goals, notification switches, account and
                upload queue) and the settings, JSON documents in a SQLite key-value store
  store/        keeps the history and settings in memory, applies actions through the core, saves after each change
  plants/       the kinds of plant as data (pixel grids over an indexed palette) and the petal colours
  ui/           the black 8-bit look: PixelText, PixelButton, PixelDialog, PixelToggle, PixelSwitch, PixelInput,
                PixelBar (progress), PixelDatePicker, PixelConfetti, Screen,
                PixelArt (crisp pixel grids), PixelSprite (one-colour icons), PlantPicture
  hooks/        useNow, which refreshes screens once a minute and on return to the foreground;
                useNotificationSync, which gives the phone the core's notification schedule whenever it changes;
                useAccountSync, which keeps the core's note of who is signed in matching Supabase's session;
                useUploadSync, which uploads waiting sessions after a change, on foreground and when the connection returns
  phone.ts      session and goal IDs and the phone's time zone
  notifications.ts  the thin adapter over expo-notifications: replaces the phone's pending notifications with the
                core's schedule, and asks permission at the first Start (local only, no push server)
  supabase.ts   the Supabase client, from EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (null without them)
  account.ts    Sign in with Apple through Supabase Auth (native identity token with a nonce), and watching the session
  uploads.ts    sends ended sessions to the save_session database function, one run at a time
  settings.ts   the user's preferences (petal colour), kept on the phone beside the history
  entitlements.ts  the single entitlement check (everything is free for now)
  theme.ts      colours and fonts
supabase/
  migrations/   the database schema, applied with `npx supabase db push`
  tests/        Jest database tests run against the dev project as throwaway users (`npm run test:db`)
```

The core has two operations: `apply(state, action)` for a timestamped action, and `view(state, now, timeZone)` for everything the screens show. It never reads the clock and contains no UI, storage, network or device code. ESLint refuses imports of the core's internal files from anywhere else.
