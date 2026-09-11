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

## Production: hustle-prod

The production project is `biumggdkbrqdeizqjfhv` (**hustle-prod**, organization hustle-dev, region
eu-west-1). Set up on 2026-09-12, and checked against dev rather than assumed:

- The four migrations are applied: six tables with row-level security on every one, seven policies,
  five functions, and `apple_tokens` and `delete_user_rows` reachable by `service_role` alone.
- Both Edge Functions are deployed and active, with the same bundle hashes as dev.
- Auth: the Apple provider is on with `com.malachitopp.hustle` as a client id; the Google provider
  is on with both client ids (web first, then iOS, comma separated) and **Skip nonce checks** on.
  "Confirm email" is left **on**, which is right: it is off on dev alone, so the database tests can
  sign throwaway users up and in at once.
- The six EAS `production` variables are set, and resolve to prod's URL and prod's publishable key
  (`sb_publishable_...`, not the legacy `anon` JWT: the app's key is a publishable key, which is
  why both Edge Functions run with `verify_jwt = false`).

### Reaching prod from the CLI

No database password, and no re-linking. The CLI mints a temporary login role from the access token
`supabase login` saved, and `--project-ref` sends one command to prod while the link stays on dev,
so a later bare `db push` cannot reach prod by accident.

```sh
npx supabase db push --project-ref biumggdkbrqdeizqjfhv
npx supabase functions deploy --project-ref biumggdkbrqdeizqjfhv --use-api
npx supabase db query --linked --project-ref biumggdkbrqdeizqjfhv "select 1"   # read-only
npx supabase config diff --project-ref biumggdkbrqdeizqjfhv                    # read-only
```

`supabase link` is the command that asks for the database password; none of the above needs it, so
there is no reason to link prod at all. (`db query` wants `--linked` alongside `--project-ref`;
`db push` does not.)

**Never run `supabase config push` against prod.** It writes this repo's `config.toml` at the
remote, and that file has `[auth.external.apple] enabled = false`, no Google block at all and
`enable_confirmations = false`: the push would switch off both sign-ins and email confirmation.
Auth is dashboard-only, and `config diff` is how to read it back.

### Still to do

1. **The Apple token secrets on prod.** Dev has them, prod does not. Until they are set,
   `save-apple-token` answers 503 and account deletion cannot revoke the Apple refresh token:

   ```sh
   npx supabase secrets set --project-ref biumggdkbrqdeizqjfhv APPLE_TEAM_ID=<team> APPLE_KEY_ID=<key> APPLE_PRIVATE_KEY="$(cat AuthKey_<key id>.p8)"
   ```

2. **Point the backups at prod.** `SUPABASE_DB_URL` in the `hustle-backups` repo's secrets still
   holds dev's connection string, so the nightly dump is still backing up dev. Replace it with
   prod's session pooler string.

3. **Build and submit:** `eas build --profile production --platform ios`, then
   `eas submit --profile production --platform ios`. `autoIncrement` handles the build number.

4. **TestFlight first:** use the build for a week or two across real days, covering midnight, an
   auto-end, notifications, sign-in on a second phone (the restore) and account deletion.
