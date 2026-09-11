-- Goals and settings, backed up with the account so a new phone picks them up along with the
-- record. Unlike the record these change: a goal is edited, switched, celebrated and deleted,
-- and the settings are changed in Settings. So each user can add, read, change and delete their
-- own rows here, and nobody else's; row-level security below enforces that whatever the app
-- asks for. As with sessions, the app writes through functions (save_goal, delete_goal and
-- save_profile) rather than straight to the tables, so the tables can change shape later
-- without older app versions breaking.

-- One row per user: the settings the app backs up. Made the first time they are saved.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- What the app calls the user. Null only if the phone that saved it somehow had no name.
  display_name text,
  -- The petal colour's name in the app's list, e.g. "blue", or null for the default.
  petal_colour text,
  -- The two notification switches in Settings.
  pause_warnings boolean not null default true,
  streak_reminder boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Every goal the user has made, deleted ones included: a deleted goal stays as a marker, with
-- deleted_at set and its switches gone, so that another phone still showing it learns it went.
create table public.goals (
  -- Generated on the phone when the goal was created, so a goal made offline can be saved later.
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  -- The work time to reach, in milliseconds.
  target_ms bigint not null,
  -- The last date that counts. The goal ends at the midnight that closes this date...
  deadline date not null,
  -- ...in this IANA zone, the one the goal was created in, e.g. "Europe/London".
  time_zone text not null,
  created_at timestamptz not null,
  -- When the user saw the celebration for reaching the target, so no phone shows it twice.
  celebrated_at timestamptz,
  -- When the goal was deleted, or null while it stands.
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint goals_target_positive check (target_ms > 0)
);

-- A goal's switch history: every time it was switched off (dormant) or on (active), in order.
-- Which work counts toward the goal is replayed from these on the phone.
create table public.goal_switches (
  goal_id uuid not null references public.goals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 0 for the first flick, 1 for the next, and so on. Two flicks can share an instant when the
  -- phone's clock was set back, so the order is kept apart from the time.
  position integer not null,
  at timestamptz not null,
  active boolean not null,
  primary key (goal_id, position),
  constraint goal_switches_position_not_negative check (position >= 0)
);

create index goals_user_created_at on public.goals (user_id, created_at);
create index goal_switches_user on public.goal_switches (user_id);

alter table public.profiles enable row level security;
alter table public.goals enable row level security;
alter table public.goal_switches enable row level security;

-- Each user does anything to their own rows and nothing to anyone else's.
create policy "Users manage their own profile"
  on public.profiles for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage their own goals"
  on public.goals for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage their own goal switches"
  on public.goal_switches for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Someone not signed in can do nothing at all, and nothing in the app needs the rest.
revoke all on public.profiles from anon;
revoke all on public.goals from anon;
revoke all on public.goal_switches from anon;
revoke truncate, references, trigger on public.profiles from authenticated;
revoke truncate, references, trigger on public.goals from authenticated;
revoke truncate, references, trigger on public.goal_switches from authenticated;

-- Stores a goal and its switch history in one step, as they are on the phone now. A goal the
-- account already has takes the new details and switches, and comes back if it had been deleted:
-- the phone's copy is the latest word. The owner is always the caller; a goal that belongs to
-- someone else is refused and left as it is.
create or replace function public.save_goal(
  p_id uuid,
  p_name text,
  p_target_ms bigint,
  p_deadline date,
  p_time_zone text,
  p_created_at timestamptz,
  p_celebrated_at timestamptz,
  -- [{"at": "<ISO instant>", "active": <true or false>}, ...] in order; may be empty.
  p_switches jsonb
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'save_goal needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(p_switches) <> 'array' then
    raise exception 'the switches are a list' using errcode = '22023';
  end if;

  insert into public.goals (id, user_id, name, target_ms, deadline, time_zone, created_at, celebrated_at, deleted_at, updated_at)
  values (p_id, v_user, p_name, p_target_ms, p_deadline, p_time_zone, p_created_at, p_celebrated_at, null, now())
  on conflict (id) do update
    set name = excluded.name,
        target_ms = excluded.target_ms,
        deadline = excluded.deadline,
        time_zone = excluded.time_zone,
        created_at = excluded.created_at,
        celebrated_at = excluded.celebrated_at,
        deleted_at = null,
        updated_at = now()
    where public.goals.user_id = v_user;
  if not found then
    raise exception 'that goal belongs to another account' using errcode = '42501';
  end if;

  delete from public.goal_switches where goal_id = p_id and user_id = v_user;
  insert into public.goal_switches (goal_id, user_id, position, at, active)
  select p_id, v_user, (flicks.ordinality - 1)::integer, (flicks.flick ->> 'at')::timestamptz, (flicks.flick ->> 'active')::boolean
  from jsonb_array_elements(p_switches) with ordinality as flicks(flick, ordinality);
end;
$$;

-- Deletes a goal from the account: the goal stays as a marker, so another phone still showing
-- it learns it went, and its switches go. Deleting a goal the account never had, or one deleted
-- already, changes nothing, so a retry is harmless.
create or replace function public.delete_goal(p_id uuid) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'delete_goal needs a signed-in user' using errcode = '42501';
  end if;
  update public.goals
    set deleted_at = coalesce(deleted_at, now()), updated_at = now()
    where id = p_id and user_id = v_user;
  delete from public.goal_switches where goal_id = p_id and user_id = v_user;
end;
$$;

-- Stores the caller's settings, replacing whatever the account held.
create or replace function public.save_profile(
  p_display_name text,
  p_petal_colour text,
  p_pause_warnings boolean,
  p_streak_reminder boolean
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'save_profile needs a signed-in user' using errcode = '42501';
  end if;
  insert into public.profiles (user_id, display_name, petal_colour, pause_warnings, streak_reminder, updated_at)
  values (v_user, p_display_name, p_petal_colour, p_pause_warnings, p_streak_reminder, now())
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        petal_colour = excluded.petal_colour,
        pause_warnings = excluded.pause_warnings,
        streak_reminder = excluded.streak_reminder,
        updated_at = now();
end;
$$;

revoke execute on function public.save_goal(uuid, text, bigint, date, text, timestamptz, timestamptz, jsonb) from public, anon;
grant execute on function public.save_goal(uuid, text, bigint, date, text, timestamptz, timestamptz, jsonb) to authenticated;
revoke execute on function public.delete_goal(uuid) from public, anon;
grant execute on function public.delete_goal(uuid) to authenticated;
revoke execute on function public.save_profile(text, text, boolean, boolean) from public, anon;
grant execute on function public.save_profile(text, text, boolean, boolean) to authenticated;
