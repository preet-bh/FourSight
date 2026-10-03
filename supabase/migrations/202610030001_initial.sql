create extension if not exists pgcrypto;

create type public.report_status as enum ('new', 'in_progress', 'resolved');
create type public.delivery_state as enum ('pending', 'submitted', 'sandbox', 'failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'resident' check (role in ('resident','city_admin','moderator')),
  created_at timestamptz not null default now()
);
create or replace function public.create_profile_for_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)));
  return new;
end
$$;
create trigger on_auth_user_created_profile after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();
create table public.maintenance_teams (
  id uuid primary key default gen_random_uuid(), name text not null, category text not null, region text not null default 'Boston'
);
create table public.reports (
  id uuid primary key default gen_random_uuid(), public_id text unique not null,
  owner_id uuid references auth.users(id) on delete set null,
  title text not null, description text not null, confirmed_transcript text,
  category text not null, region text not null, latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180), status public.report_status not null default 'new',
  assigned_team_id uuid references public.maintenance_teams(id), hidden_from_map boolean not null default false,
  hide_reason text, hidden_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((hidden_from_map and hide_reason is not null and hidden_by is not null) or (not hidden_from_map and hide_reason is null))
);
create table public.report_media (
  id uuid primary key default gen_random_uuid(), report_id uuid not null references public.reports(id) on delete cascade,
  storage_path text not null, kind text not null check (kind in ('image','video','completion')),
  selected_frame_seconds numeric, created_at timestamptz not null default now()
);
create table public.report_delivery (
  report_id uuid primary key references public.reports(id) on delete cascade,
  state public.delivery_state not null default 'pending', external_reference text, message text,
  updated_at timestamptz not null default now()
);
create table public.report_events (
  id uuid primary key default gen_random_uuid(), report_id uuid not null references public.reports(id) on delete cascade,
  status public.report_status not null, note text, actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.forum_posts (
  id uuid primary key default gen_random_uuid(), region text not null, topic text not null, title text not null,
  body text not null, author_id uuid not null references auth.users(id) on delete cascade,
  hidden boolean not null default false, created_at timestamptz not null default now()
);
create table public.forum_comments (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references public.forum_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade, body text not null, created_at timestamptz not null default now()
);
create table public.forum_flags (
  id uuid primary key default gen_random_uuid(), post_id uuid references public.forum_posts(id) on delete cascade,
  comment_id uuid references public.forum_comments(id) on delete cascade, reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text, action text not null default 'pending' check (action in ('pending','hidden','restored','dismissed')),
  reviewed_by uuid references auth.users(id), created_at timestamptz not null default now(),
  check (num_nonnulls(post_id, comment_id) = 1)
);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('report-media', 'report-media', false, 52428800, array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict (id) do nothing;

create index reports_public_map_idx on public.reports(region, status, created_at desc) where not hidden_from_map;
create index reports_queue_idx on public.reports(status, created_at desc);
create index report_events_report_idx on public.report_events(report_id, created_at);
create index forum_posts_region_idx on public.forum_posts(region, topic, created_at desc);
create index forum_comments_post_idx on public.forum_comments(post_id, created_at);
create index forum_flags_queue_idx on public.forum_flags(action, created_at);

create or replace function public.can_view_report_media(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.report_media m join public.reports r on r.id = m.report_id
    where m.storage_path = object_name and (not r.hidden_from_map or r.owner_id = (select auth.uid()) or (select public.current_app_role()) = 'city_admin')
  )
$$;
revoke all on function public.can_view_report_media(text) from public;
grant execute on function public.can_view_report_media(text) to anon, authenticated;

-- The public projection contains no reporter, moderation, or staff-only fields.
create view public.public_reports with (security_invoker = true) as
  select id, public_id, title, description, confirmed_transcript, category, region, latitude, longitude,
         status, assigned_team_id, created_at, updated_at
  from public.reports where not hidden_from_map;

-- PostGIS is not required for the MVP map; coordinates are indexed when a geo-query extension is added.
create or replace function public.current_app_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid())
$$;
revoke all on function public.current_app_role() from public, anon;
grant execute on function public.current_app_role() to authenticated;

create or replace function public.admin_transition_report(p_report_id uuid, p_status public.report_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare old_status public.report_status;
begin
  if (select public.current_app_role()) <> 'city_admin' then raise exception 'City admin access required.'; end if;
  select status into old_status from public.reports where id = p_report_id for update;
  if old_status is null then raise exception 'Ticket not found.'; end if;
  if not ((old_status = 'new' and p_status = 'in_progress') or (old_status = 'in_progress' and p_status = 'resolved')) then
    raise exception 'Invalid ticket status transition.';
  end if;
  if p_status = 'resolved' and nullif(trim(p_note), '') is null then raise exception 'A public resolution note is required.'; end if;
  update public.reports set status = p_status, updated_at = now() where id = p_report_id;
  insert into public.report_events(report_id,status,note,actor_id) values (p_report_id,p_status,nullif(trim(p_note),''),(select auth.uid()));
end
$$;
create or replace function public.admin_assign_report_team(p_report_id uuid, p_team_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select public.current_app_role()) <> 'city_admin' then raise exception 'City admin access required.'; end if;
  update public.reports set assigned_team_id = p_team_id, updated_at = now() where id = p_report_id;
  if not found then raise exception 'Ticket not found.'; end if;
end
$$;
create or replace function public.admin_set_report_visibility(p_report_id uuid, p_hidden boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select public.current_app_role()) <> 'city_admin' then raise exception 'City admin access required.'; end if;
  if p_hidden and nullif(trim(p_reason),'') is null then raise exception 'A hide reason is required.'; end if;
  update public.reports set hidden_from_map = p_hidden, hide_reason = case when p_hidden then trim(p_reason) else null end,
    hidden_by = case when p_hidden then (select auth.uid()) else null end, updated_at = now() where id = p_report_id;
  if not found then raise exception 'Ticket not found.'; end if;
end
$$;
revoke all on function public.admin_transition_report(uuid,public.report_status,text) from public;
revoke all on function public.admin_assign_report_team(uuid,uuid) from public;
revoke all on function public.admin_set_report_visibility(uuid,boolean,text) from public;
grant execute on function public.admin_transition_report(uuid,public.report_status,text) to authenticated;
grant execute on function public.admin_assign_report_team(uuid,uuid) to authenticated;
grant execute on function public.admin_set_report_visibility(uuid,boolean,text) to authenticated;

alter table public.profiles enable row level security;
alter table public.maintenance_teams enable row level security;
alter table public.reports enable row level security;
alter table public.report_media enable row level security;
alter table public.report_delivery enable row level security;
alter table public.report_events enable row level security;
alter table public.forum_posts enable row level security;
alter table public.forum_comments enable row level security;
alter table public.forum_flags enable row level security;

create policy "Users read own profile; admins read profiles" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.current_app_role()) in ('city_admin','moderator'));
create policy "Teams are readable by signed in users" on public.maintenance_teams for select to authenticated using (true);
create policy "Public sees visible reports" on public.reports for select to anon, authenticated using (not hidden_from_map or owner_id = (select auth.uid()) or (select public.current_app_role()) = 'city_admin');
create policy "Residents create their own reports" on public.reports for insert to authenticated with check (owner_id = (select auth.uid()) and status = 'new' and not hidden_from_map);
create policy "Admins update reports" on public.reports for update to authenticated using ((select public.current_app_role()) = 'city_admin') with check ((select public.current_app_role()) = 'city_admin');
create policy "Visible report media is readable" on public.report_media for select to anon, authenticated using (exists(select 1 from public.reports r where r.id = report_id and (not r.hidden_from_map or r.owner_id = (select auth.uid()) or (select public.current_app_role()) = 'city_admin')));
create policy "Report owners add media" on public.report_media for insert to authenticated with check (exists(select 1 from public.reports r where r.id = report_id and r.owner_id = (select auth.uid())));
create policy "Delivery visible with report" on public.report_delivery for select to anon, authenticated using (exists(select 1 from public.reports r where r.id = report_id and (not r.hidden_from_map or r.owner_id = (select auth.uid()) or (select public.current_app_role()) = 'city_admin')));
create policy "Events visible with report" on public.report_events for select to anon, authenticated using (exists(select 1 from public.reports r where r.id = report_id and (not r.hidden_from_map or r.owner_id = (select auth.uid()) or (select public.current_app_role()) = 'city_admin')));
create policy "Admins add status events" on public.report_events for insert to authenticated with check ((select public.current_app_role()) = 'city_admin');
create policy "Forum reads visible posts" on public.forum_posts for select to anon, authenticated using (not hidden or (select public.current_app_role()) in ('moderator','city_admin'));
create policy "Residents create forum posts" on public.forum_posts for insert to authenticated with check (author_id = (select auth.uid()));
create policy "Moderators manage posts" on public.forum_posts for update to authenticated using ((select public.current_app_role()) in ('moderator','city_admin')) with check ((select public.current_app_role()) in ('moderator','city_admin'));
create policy "Forum reads visible comments" on public.forum_comments for select to anon, authenticated using (exists(select 1 from public.forum_posts p where p.id = post_id and (not p.hidden or (select public.current_app_role()) in ('moderator','city_admin'))));
create policy "Residents write their comments" on public.forum_comments for insert to authenticated with check (author_id = (select auth.uid()));
create policy "Users create flags" on public.forum_flags for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy "Moderators read and update flags" on public.forum_flags for select to authenticated using ((select public.current_app_role()) in ('moderator','city_admin'));
create policy "Moderators review flags" on public.forum_flags for update to authenticated using ((select public.current_app_role()) in ('moderator','city_admin')) with check ((select public.current_app_role()) in ('moderator','city_admin'));

create policy "Owners upload report media" on storage.objects for insert to authenticated with check (
  bucket_id = 'report-media' and (storage.foldername(name))[1] = (select auth.uid())::text and exists (
    select 1 from public.reports r where r.id::text = (storage.foldername(name))[2] and r.owner_id = (select auth.uid())
  )
);
create policy "Public may read visible report media" on storage.objects for select to anon, authenticated using (
  bucket_id = 'report-media' and (select public.can_view_report_media(name))
);

-- Explicit grants: new public-schema tables are not implicitly exposed through the Data API.
revoke all on public.reports from anon, authenticated;
grant select (id, public_id, title, description, confirmed_transcript, category, region, latitude, longitude, status, assigned_team_id, hidden_from_map, created_at, updated_at) on public.reports to anon, authenticated;
grant select on public.public_reports to anon, authenticated;
revoke all on public.report_media, public.forum_posts, public.forum_comments from anon, authenticated;
grant select (id, report_id, kind, selected_frame_seconds, created_at) on public.report_media to anon, authenticated;
grant select on public.report_delivery to anon, authenticated;
grant select (id, report_id, status, note, created_at) on public.report_events to anon, authenticated;
grant select (id, region, topic, title, body, hidden, created_at) on public.forum_posts to anon, authenticated;
grant select (id, post_id, body, created_at) on public.forum_comments to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.maintenance_teams to authenticated;
grant insert on public.reports, public.report_media, public.forum_posts, public.forum_comments, public.forum_flags to authenticated;
grant update on public.forum_posts, public.forum_flags to authenticated;
grant insert on public.report_events to authenticated;
grant select, update on public.forum_flags to authenticated;

insert into public.maintenance_teams(name, category, region) values
  ('Street & Sidewalks', 'Street & sidewalk', 'Boston'),
  ('Sanitation Services', 'Trash & sanitation', 'Boston'),
  ('Electrical & Lighting', 'Lighting', 'Boston'),
  ('Parks & Public Space', 'Parks', 'Boston'),
  ('Water & Drainage', 'Water & drainage', 'Boston');

-- Create a city admin only after a real auth user exists:
-- update public.profiles set role = 'city_admin' where id = '<verified-auth-user-uuid>';
