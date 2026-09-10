# Supabase with no server of our own

The app talks directly to Supabase (hosted Postgres and Auth), with no Node/Express API in between, even though Node/Express was the initial preference. The server's only jobs are sign-in and storing a small amount of per-user data. Everything time-based (the timer, the plant, auto-end, notifications) runs on the phone, so an API server would add hosting, deploys and ownership checks on every endpoint while doing almost nothing.

## Considered Options

- **Node/Express API plus hosted Postgres.** Full control, but it's a second thing to build, deploy and pay for, and every screen needs its own endpoint.
- **Firebase.** Also serverless, but its database isn't SQL, which makes calendar and week/month/year totals awkward. Its billing counts every document read, and its main strength (live sync between devices) isn't needed, because sessions are saved once, when they end.

## Consequences

- Trusted logic lives in the database. Row-level security limits every query to the user's own rows and makes the record insert-only. Sessions are saved through database functions rather than direct table writes, which also keeps older app versions working as the schema changes.
- The only server code is two Supabase Edge Functions. One exchanges the Apple sign-in code for a refresh token. The other deletes an account: the auth user, all their rows, and their Apple token (Apple requires the revocation; Supabase doesn't do it).
- Revisit this when a feature needs real server logic, most likely social features. An Express service can then be added alongside Supabase without rewriting the app.
