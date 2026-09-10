# Hustle v1 spec

Everything decided in the design session on 10 September 2026. Bold words follow the glossary in [CONTEXT.md](../CONTEXT.md). The two biggest decisions are recorded in [docs/adr](adr/).

## Launch

- iPhone only. Free, public on the App Store, available in all countries, English only.
- Name: Hustle. Bundle id: `com.malachitopp.hustle`.
- Built with Expo (SDK 57) and EAS Build, so no Mac is needed.
- Tested through TestFlight before it's submitted for review.
- Paid subscriptions will come later, so paid features must be easy to switch on behind one check.

## Sessions

- The timer stores a start time plus pause and resume times. Work time is now minus the start time minus paused time, recalculated every minute. It keeps counting when the app is closed or the phone is locked or restarted.
- Home buttons:

  | State | Buttons | Extra line |
  |---|---|---|
  | No session | Start session | none |
  | Running | Pause · End session | none |
  | Paused | Resume · End session | "Paused · ends automatically at 11:40pm" |

- End session asks "End session? You've worked 6h 40m." with Keep going and End session buttons. Ending shows a pop-up with pixel confetti: "Session complete · 6h 40m · Your rose will last until 12:40am".
- A session paused for 6 hours auto-ends.
- A running session has no time limit. The user is trusted.
- A session enters the **record** only when it ends. Until then it exists only on the phone.
- Sessions of any length count. The user can never edit or delete anything in the record.

## Days, calendar and totals

- A **day** runs midnight to midnight. Work that crosses midnight is split between the two days, using the time zone the session started in. The split happens once, when the session ends.
- "Today" means all work on today's date, across every session, including one that's running.
- Calendar tab: a "Total worked this [Week | Month | Year]" toggle (weeks start on Monday) sits above a month grid where each day shows its work time. Tapping a day lists its sessions, view only. Past months can be browsed; the totals always show the current week, month or year.

## The plant

- **Life** runs from 0% to 100%. A running session adds 10% per hour, so 10 hours from empty is **full bloom**. Life can't go above 100%.
- When work stops (pause or End), life falls in a straight line to 0% exactly 6 hours later, whatever level it started at. See ADR-0001.
- Working again before life reaches 0% keeps the same plant. At 0% the plant dies. The dead plant stays on screen until the next work plants a new one, starting at 0%.
- The plant has six looks, chosen by life: dead, wilting, drooping, bud, opening, full bloom.
- The rose sits on a dirt base with a green stem, on a black background. Before the very first session there's only dirt.
- Petal colours: red (default), orange, yellow, green (brighter than the stem), blue, pink, violet. The colour can be changed any time in Settings.
- The plant is drawn as pixel grids in code. New kinds of plant must slot in without changes elsewhere.

## Streak

- The **streak** counts days in a row with any work, however little. It breaks when a whole day passes with no work.
- It's shown on Home as "Day 23".

## Home header

Yellow text above the plant, updating every minute.

| Situation | Text |
|---|---|
| Never worked | "Welcome, {name}. Start a session to plant your first rose." |
| A session is running or paused, or you worked today and the rose is alive, and today's work time is under 5 hours | "{name}, you have worked 2h 14m today" |
| The same, once today's work time reaches 5 hours | "Congratulations {name}, you have worked 6h 40m today" |
| You worked today and the rose has since died | "Your rose has died, {name}. Start working to plant a new one." |
| No work yet today, rose still alive | "Welcome back, {name}. Your rose is waiting." |
| No work yet today, rose died overnight | "New day, {name}. Start a session to plant a new rose." |

## Notifications

All notifications are scheduled on the phone. Nothing is sent between 10pm and 8am.

- 5 hours into a pause: "Your session ends in 1 hour and your rose will die. Resume to save it."
- When a paused session auto-ends: "Your session ended automatically. Your rose has died."
- At 9pm on a day with no work yet, if there's a streak: "Your 23-day streak ends at midnight. Start a session to keep it."
- Nothing is sent after the user presses End.
- Permission is asked the first time the user presses Start. Everything still works if they say no.
- Settings has two switches: Pause warnings and Streak reminder.

## Goals

- A **goal** has a name, a target work time and a deadline date, e.g. "Finals: 100h by 24 Oct". Goals are optional.
- A goal only counts work done while it's **active**, and new goals start active. The dropdown at the top right of the Goals tab switches goals on and off. A switched-off goal is **dormant**: it keeps its progress but gains nothing. Several goals can be active at once, and the same work counts toward all of them.
- Goals can be edited (name, target, deadline) and deleted.
- The Goals tab shows each goal's name and progress bar ("34h / 100h"), with dormant goals greyed out. Swiping left opens History, which lists past goals marked **Achieved** or **Missed**.
- A goal is achieved the moment its work time reaches the target, with a small celebration. It's missed if its deadline passes first.
- Goals don't affect the plant, don't appear on Home and don't send notifications.

## Accounts

- First launch shows one "how it works" screen, then asks "What should we call you?". The display name can be changed in Settings.
- **Guests** can use everything. Their record stays on the phone.
- After the first session ends (after the confetti), the app offers "Save your progress" with Sign in with Apple and Sign in with Google. Settings also has a "Back up your progress" option.
- Signing in uploads the guest record. If the account already has work in it, the guest sessions are added to it.
- Sign out clears the phone's copy. Delete account removes the account and all its data, revokes Apple sign-in access, and returns the app to a fresh guest state.
- Settings contains: display name, petal colour, notification switches, account (sign in, sign out, delete account), and privacy policy and support links.

## Backend and data

- Supabase (hosted Postgres and Auth), with no server of our own. See ADR-0002.
- Two Supabase projects: dev for testing and prod for real users.
- Two Edge Functions. One exchanges the Apple sign-in code for a refresh token and stores it. The other deletes an account: all its rows, the auth user and the Apple token.
- Each ended session is one permanent row holding its running intervals and time zone, plus one row for each day it touched, for the calendar and totals. Security rules let users add and read their own rows, never change or delete them. Saves go through database functions.
- The plant and the streak are worked out on the phone from recent sessions and never stored.
- No polling, realtime feeds or background jobs. The app talks to Supabase only when a session ends, when the calendar or goals are opened (the results are then cached), when settings or goals change, and for sign-in and account deletion.
- Offline: an ended session is saved on the phone first, with an ID generated on the phone, and uploaded when there's a connection. A retried upload can't create a duplicate.
- Supabase free plan for now, moving to Pro once subscriptions pay for it. The spend cap stays on.
- Backups: a nightly GitHub Action copies the database with `pg_dump`, encrypts the copy and keeps the last 30. They're stored in a private repo separate from the code.
- Crashes and errors are reported to Sentry, using the existing account. No usage analytics.

## Before App Store submission

1. Privacy policy and support pages on GitHub Pages, linked from App Store Connect and from Settings.
2. App Privacy label declaring display name, email, work sessions, and crash data (not linked to identity). No tracking.
3. Account deletion as described above, including revoking the Apple token.
4. Privacy manifest via `app.json`.
5. `supportsTablet: false` and `ITSAppUsesNonExemptEncryption: false`.
6. Store listing: icon, 6.9" iPhone screenshots, description, age rating, Productivity category, and review notes explaining guest mode.
7. Notification permission asked at the first Start, not at launch.

## Not in v1

- Lock-screen timer (Live Activity).
- Subscriptions, with a Restore purchases button and Apple's subscription wording rules.
- More kinds of plant.
- Social features, which are the likely point to add an Express server.
- Supabase Pro, with its built-in daily backups.
