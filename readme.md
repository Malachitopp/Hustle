# Hustle

An iPhone app for timing your own work honestly. A pixel-art rose grows while you work and wilts when you stop. The v1 design is in [docs/spec.md](docs/spec.md), the vocabulary in [CONTEXT.md](CONTEXT.md), and the build tickets are GitHub issues #2 to #18.

## Run it

Expo SDK 57. Until the sign-in tickets need a development build, Expo Go on an iPhone is enough.

```sh
npm install
npx expo start
```

Scan the QR code with the Camera app on the iPhone. Metro serves the app over the local network, so the phone and the computer need the same Wi-Fi.

## Check it

```sh
npm test            # Jest core tests
npm run typecheck   # tsc
npm run lint        # ESLint
npm run check       # all three
```

## How the code is laid out

```
src/
  core/         every product rule, reached only through core/index.ts
    __tests__/  Jest tests that go through the entry point and pass every time in explicitly
  app/          screens (expo-router): _layout.tsx, onboarding.tsx (first launch, until a display name is chosen),
                then (tabs)/ for Home, Calendar, Goals, Settings
  storage/      the phone's copy of the history (display name, sessions and goals) and the settings, JSON documents in a SQLite key-value store
  store/        keeps the history and settings in memory, applies actions through the core, saves after each change
  plants/       the kinds of plant as data (pixel grids over an indexed palette) and the petal colours
  ui/           the black 8-bit look: PixelText, PixelButton, PixelDialog, PixelToggle, PixelInput,
                PixelBar (progress), PixelDatePicker, PixelConfetti, Screen,
                PixelArt (crisp pixel grids), PixelSprite (one-colour icons), PlantPicture
  hooks/        useNow, which refreshes screens once a minute and on return to the foreground
  phone.ts      session and goal IDs and the phone's time zone
  settings.ts   the user's preferences (petal colour), kept on the phone beside the history
  entitlements.ts  the single entitlement check (everything is free for now)
  theme.ts      colours and fonts
```

The core has two operations: `apply(state, action)` for a timestamped action, and `view(state, now, timeZone)` for everything the screens show. It never reads the clock and contains no UI, storage, network or device code. ESLint refuses imports of the core's internal files from anywhere else.
