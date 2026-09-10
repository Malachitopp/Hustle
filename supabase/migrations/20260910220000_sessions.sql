-- The record: every ended session, exactly as the timer measured it, and the work time it put
-- on each date. Users add and read their own rows and never change or delete them; row-level
-- security below is what enforces that, whatever the app asks for. The app never writes these
-- tables directly: it saves through save_session, so the tables can change shape later without
-- older app versions breaking.

create table public.sessions (
  -- Generated on the phone when the session started, so a session ended offline can be
  -- uploaded later, and again after a lost reply, without ever being stored twice.
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  -- The IANA zone the session started in, e.g. "Europe/London". Its days were split in this zone.
  time_zone text not null,
  -- The running periods, in order, as [{"from": "<ISO instant>", "to": "<ISO instant>"}, ...].
  -- Paused time falls between them. Work time is their total length.
  periods jsonb not null,
  -- The session's work time in milliseconds: the total length of the periods.
  work_ms bigint not null,
  saved_at timestamptz not null default now(),
  constraint sessions_ended_after_started check (ended_at >= started_at),
  constraint sessions_work_ms_not_negative check (work_ms >= 0),
  constraint sessions_periods_is_array check (jsonb_typeof(periods) = 'array')
);

-- The session's work time on each date it ran on, split at midnight in the session's own zone.
-- The calendar and the week, month and year totals read these.
create table public.session_days (
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  work_ms bigint not null,
  primary key (session_id, day),
  constraint session_days_work_ms_not_negative check (work_ms >= 0)
);

create index sessions_user_started_at on public.sessions (user_id, started_at);
create index session_days_user_day on public.session_days (user_id, day);

alter table public.sessions enable row level security;
alter table public.session_days enable row level security;

-- Each user adds and reads their own rows. There are no update or delete policies, so nothing
-- in the record can be changed or removed through the API.
create policy "Users read their own sessions"
  on public.sessions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users add their own sessions"
  on public.sessions for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users read their own session days"
  on public.session_days for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users add their own session days"
  on public.session_days for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Belt and braces: take away the privileges too, so that even a policy added by mistake one
-- day could not let the app change the record, and someone not signed in can do nothing at all.
revoke all on public.sessions from anon;
revoke all on public.session_days from anon;
revoke update, delete, truncate, references, trigger on public.sessions from authenticated;
revoke update, delete, truncate, references, trigger on public.session_days from authenticated;

-- Stores a session and its days in one step. A session the account already has is left exactly
-- as it is, days included, so a retried upload can never store one twice. The owner is always
-- the caller: the app never says whose session it is.
create or replace function public.save_session(
  p_id uuid,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_time_zone text,
  p_periods jsonb,
  p_work_ms bigint,
  -- [{"date": "YYYY-MM-DD", "work_ms": <milliseconds>}, ...], at least one.
  p_days jsonb
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'save_session needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) = 0 then
    raise exception 'a session has at least one day' using errcode = '22023';
  end if;

  insert into public.sessions (id, user_id, started_at, ended_at, time_zone, periods, work_ms)
  values (p_id, v_user, p_started_at, p_ended_at, p_time_zone, p_periods, p_work_ms)
  on conflict (id) do nothing;

  -- Only a session stored just now gets its days; one stored before already has them.
  if found then
    insert into public.session_days (session_id, user_id, day, work_ms)
    select p_id, v_user, (day ->> 'date')::date, (day ->> 'work_ms')::bigint
    from jsonb_array_elements(p_days) as day;
  end if;
end;
$$;

revoke execute on function public.save_session(uuid, timestamptz, timestamptz, text, jsonb, bigint, jsonb)
  from public, anon;
grant execute on function public.save_session(uuid, timestamptz, timestamptz, text, jsonb, bigint, jsonb)
  to authenticated;
