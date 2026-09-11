-- A goal's switches belong to the goal's owner. Row-level security alone lets a user add a
-- switch under their own id that names someone else's goal: their own row, so allowed, though
-- hung on a goal they cannot see. Tying a switch to its goal by (goal id, user id) rules that
-- out: the pair must exist in goals, so the goal is the caller's own.

-- Any switch hung on someone else's goal before this rule existed goes first.
delete from public.goal_switches as switch
where not exists (
  select 1 from public.goals as goal where goal.id = switch.goal_id and goal.user_id = switch.user_id
);

alter table public.goals
  add constraint goals_id_user_id_key unique (id, user_id);

alter table public.goal_switches
  drop constraint goal_switches_goal_id_fkey,
  add constraint goal_switches_goal_id_user_id_fkey
    foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade;
