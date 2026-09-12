-- The privileges a new project no longer grants by itself.
--
-- Supabase used to give anon, authenticated and service_role every privilege on each new table
-- in public, and the migrations before this one leaned on that: they only ever took privileges
-- away, never gave them. A project created now starts from almost nothing instead, so on a new
-- project those revokes left the app's tables out of reach altogether: the signed-in user could
-- neither read their record back nor save to it, and every call answered 42501,
-- insufficient_privilege. The project this was written against had it on five tables of six.
--
-- So the privileges the earlier migrations assumed are spelled out here. The set is exactly what
-- those revokes meant to leave behind and no more. It covers saving as well as reading, because
-- the app's four functions are security invoker: they act as the signed-in user, so they need
-- the same privileges in their own right. Row-level security still decides which rows anyone
-- sees; these decide only which tables they may ask about at all.
--
-- anon and service_role are left exactly as they are. Nobody signed out has any business here,
-- and the one table the Edge Functions reach is apple_tokens, already granted to service_role
-- alone by the migration before this one.

-- Read the record back, and add to it. Neither is ever changed or removed in place: a session
-- the account already has is left as it is, days included.
grant select, insert on public.sessions, public.session_days to authenticated;

-- The phone's copy is the latest word for these three, so they are changed and removed in place
-- as well: a renamed goal, a deleted one, a changed petal colour.
grant select, insert, update, delete on public.profiles, public.goals, public.goal_switches to authenticated;
