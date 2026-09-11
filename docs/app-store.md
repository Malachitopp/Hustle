# App Store submission

What Apple's review needs that doesn't live in the code. Ticket #18 built the app's side; the
rest of this page is the owner's, in App Store Connect.

## Review notes

Paste this into App Store Connect > the version > App Review Information > Notes. No demo
account is needed, and saying so plainly is what stops a reviewer rejecting the build for want of
credentials.

> Hustle times your own work and grows a pixel-art rose while you work.
>
> **No account is needed.** Everything works as a guest, with the record kept on the phone.
> Signing in (Apple or Google) only backs the record up so a new phone can restore it, so there
> are no credentials to give you. Sign in with Apple is on the Settings tab under "Back up your
> progress", and also offered once after the first session ends.
>
> How to try each feature in a couple of minutes:
>
> - **A session:** Home tab > START. The timer runs and the rose grows. PAUSE stops the count;
>   RESUME starts it again; END finishes the session, with a short celebration.
> - **The plant:** it reaches full bloom on about 4 hours of work in a day and wilts when no work
>   is done, so a fresh install shows a small plant. Settings > Petal colour changes its colour
>   at once, which is the quickest way to see the artwork.
> - **Calendar and totals:** the Calendar tab marks every day with work and totals the week,
>   month and year. A day is a calendar date in the time zone the session started in.
> - **Streak:** the Home header counts days in a row with any work.
> - **Goals:** the Goals tab > NEW GOAL sets a target and a deadline (e.g. 1 hour in 1 day).
>   Work counts toward every active goal. A goal can be switched off, edited or deleted, and
>   finished goals move to the history, a swipe left from Goals.
> - **Notifications:** the phone asks for permission at the first START, not at launch. Nothing
>   is sent between 10pm and 8am. The two kinds can be switched off in Settings. They are
>   scheduled on the phone; Hustle has no push server.
> - **A paused session ends by itself after 6 hours**, which is too long to wait in review; the
>   warning an hour before and the notice at the end are the "Pause warnings" switch in Settings.
> - **Deleting the account:** Settings > Delete account removes the login and every row Hustle
>   holds, and withdraws Hustle's access to the Apple ID. It needs a connection.
>
> Privacy policy: https://malachitopp.github.io/hustle-help/privacy/
> Support: https://malachitopp.github.io/hustle-help/support/

## App Privacy label

Answers for App Store Connect > App Privacy. They match `ios.privacyManifests` in `app.json` and
the privacy policy; if one changes, change all three.

- **Tracking:** no. Hustle has no advertising, no analytics and no third-party tracking SDK, and
  never asks for the tracking permission.
- **Data linked to the user:** Name (the display name), Email address (from Sign in with Apple or
  Google, and Apple's private relay address counts), Other user content (the record: ended
  sessions with their times and time zone, goals and settings). Purpose: App Functionality.
- **Data not linked to the user:** Crash data and Other diagnostic data, through Sentry. Purpose:
  App Functionality. Reports carry no name, email, account id or IP address; `sendDefaultPii` is
  off and session tracking is off, so there are no usage counts.
- A guest's data leaves the phone only as crash reports. Signing in is what starts the backing up.

## Store listing

- **Category:** Productivity. **Age rating:** 4+. No user-generated content, no links out except
  the privacy and support pages.
- **Screenshots:** 6.9" iPhone (1320 x 2868), at least three. Home mid-session with the rose in
  bloom, the Calendar with a few weeks of work, Goals with a goal in progress, and Settings with
  the petal colours are the four that show the app off.
- **Support URL:** https://malachitopp.github.io/hustle-help/support/
- **Privacy policy URL:** https://malachitopp.github.io/hustle-help/privacy/
- **Encryption:** `ITSAppUsesNonExemptEncryption` is already false in `app.json`, so the export
  compliance question is answered by the build.

## Before the first production build

The production Supabase project doesn't exist yet. In order:

1. **Create the prod project** in the Supabase dashboard (same organization as dev, region
   West EU), and keep its database password in the password manager.
2. **Apply the schema:** `npx supabase link --project-ref <prod-ref>` then `npx supabase db push`.
   Then `npx supabase functions deploy` for both Edge Functions.
3. **Dashboard settings** in prod, as the readme's Supabase section describes: the Apple provider
   on with `com.malachitopp.hustle` as a client id; the Google provider on with the web client's
   id and secret, both client ids listed, and Skip nonce checks on. Leave "Confirm email" on:
   only dev needs it off, for the database tests.
4. **Apple token secrets:** `npx supabase secrets set APPLE_TEAM_ID=… APPLE_KEY_ID=…
   APPLE_PRIVATE_KEY="$(cat AuthKey_<key id>.p8)"`, or account deletion can't revoke the token.
5. **Point the production build at prod** with EAS environment variables in the `production`
   environment: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
   `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`,
   `EXPO_PUBLIC_SENTRY_DSN` (plaintext) and `SENTRY_AUTH_TOKEN` (secret). The readme's
   Development build section has the exact commands; swap `development` for `production`.
6. **Point the backups at prod:** set `SUPABASE_DB_URL` in the `hustle-backups` repo's secrets to
   prod's session pooler connection string, so the nightly dump stops reading dev.
7. **Build and submit:** `eas build --profile production --platform ios`, then
   `eas submit --profile production --platform ios`. `autoIncrement` handles the build number.
8. **TestFlight first:** use the build for a week or two across real days, covering midnight, an
   auto-end, notifications, sign-in on a second phone (the restore) and account deletion.
