-- Deleting an account, and what makes revoking its Sign in with Apple possible.
--
-- Apple asks that an app which lets users delete their account also revokes the tokens Sign in
-- with Apple gave it. Revoking takes a refresh token, and only the one-time code from a sign-in
-- can be exchanged for one. So the save-apple-token Edge Function does that exchange at each
-- Apple sign-in and keeps the refresh token here, where no phone can read it: row-level security
-- is on with no policies at all, and the privileges the API's roles would need are taken away,
-- so only the server's own role (which the Edge Functions use) reaches the table.

create table public.apple_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.apple_tokens enable row level security;

revoke all on public.apple_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.apple_tokens to service_role;

-- Removes every row a user owns, in every table. The delete-account Edge Function calls this
-- just before it removes the login itself. Only the server's role may call it: the app cannot,
-- and nor can anyone else through the API.
create or replace function public.delete_user_rows(p_user_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.apple_tokens where user_id = p_user_id;
  delete from public.goal_switches where user_id = p_user_id;
  delete from public.goals where user_id = p_user_id;
  delete from public.session_days where user_id = p_user_id;
  delete from public.sessions where user_id = p_user_id;
  delete from public.profiles where user_id = p_user_id;
end;
$$;

revoke execute on function public.delete_user_rows(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_rows(uuid) to service_role;
