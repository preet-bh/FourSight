-- Keep public attribution as a display-name snapshot, separate from account identity.
alter table public.reports add column reporter_display_name text;
update public.reports r
set reporter_display_name = coalesce(nullif(trim(p.display_name), ''), 'Resident')
from public.profiles p
where r.owner_id = p.id and r.reporter_display_name is null;
update public.reports set reporter_display_name = 'Resident' where reporter_display_name is null;
alter table public.reports alter column reporter_display_name set default 'Resident';
alter table public.reports alter column reporter_display_name set not null;
alter table public.report_media add column label text;

create or replace view public.public_reports with (security_invoker = true) as
  select id, public_id, title, description, confirmed_transcript, category, region,
         latitude, longitude, status, assigned_team_id, created_at, updated_at, reporter_display_name
  from public.reports where not hidden_from_map;

alter table public.forum_posts
  add column report_id uuid references public.reports(id) on delete set null;
alter table public.forum_comments
  add column hidden boolean not null default false;
alter table public.forum_posts add column author_display_name text not null default 'Resident';
alter table public.forum_comments add column author_display_name text not null default 'Resident';
update public.forum_posts p set author_display_name = coalesce(nullif(trim(u.display_name), ''), 'Resident')
from public.profiles u where u.id = p.author_id;
update public.forum_comments c set author_display_name = coalesce(nullif(trim(u.display_name), ''), 'Resident')
from public.profiles u where u.id = c.author_id;

create index forum_posts_report_idx on public.forum_posts(report_id) where report_id is not null;
create index forum_comments_visible_idx on public.forum_comments(post_id, created_at) where not hidden;
create index admin_ticket_audit_actor_idx on public.admin_ticket_audit(actor_id);
create index forum_comments_author_idx on public.forum_comments(author_id);
create index forum_flags_comment_idx on public.forum_flags(comment_id);
create index forum_flags_post_idx on public.forum_flags(post_id);
create index forum_flags_reporter_idx on public.forum_flags(reporter_id);
create index forum_flags_reviewed_by_idx on public.forum_flags(reviewed_by);
create index forum_posts_author_idx on public.forum_posts(author_id);
create index report_events_actor_idx on public.report_events(actor_id);
create index report_media_report_idx on public.report_media(report_id);
create index reports_assigned_team_idx on public.reports(assigned_team_id);
create index reports_hidden_by_idx on public.reports(hidden_by);
create index reports_owner_idx on public.reports(owner_id);
create unique index maintenance_teams_identity_idx
  on public.maintenance_teams (lower(name), lower(category), lower(region));

create or replace function public.initialize_report_records()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.report_delivery(report_id, state) values (new.id, 'pending') on conflict (report_id) do nothing;
  insert into public.report_events(report_id, status, actor_id) values (new.id, new.status, new.owner_id);
  return new;
end
$$;
revoke all on function public.initialize_report_records() from public, anon, authenticated;
create trigger initialize_report_records_after_insert after insert on public.reports
  for each row execute function public.initialize_report_records();

-- This function exists only as the auth.users trigger callback, not as a client RPC.
revoke all on function public.create_profile_for_auth_user() from public, anon, authenticated;

insert into public.maintenance_teams(name, category, region) values
  ('Street & Sidewalks', 'Street & sidewalk', 'Boston'),
  ('Sanitation Services', 'Trash & sanitation', 'Boston'),
  ('Electrical & Lighting', 'Lighting', 'Boston'),
  ('Parks & Public Space', 'Parks', 'Boston'),
  ('Water & Drainage', 'Water & drainage', 'Boston')
on conflict (lower(name), lower(category), lower(region)) do nothing;

-- A report link can only point at a visible report in the same region.
drop policy if exists "Residents create forum posts" on public.forum_posts;
create policy "Residents create forum posts" on public.forum_posts for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (report_id is null or exists (
      select 1 from public.reports r
      where r.id = report_id and r.region = forum_posts.region and not r.hidden_from_map
    ))
  );

drop policy if exists "Forum reads visible comments" on public.forum_comments;
create policy "Forum reads visible comments" on public.forum_comments for select to anon, authenticated
  using (
    exists(select 1 from public.forum_posts p where p.id = post_id and (not p.hidden or (select public.current_app_role()) in ('moderator','city_admin')))
    and (not hidden or (select public.current_app_role()) in ('moderator','city_admin'))
  );
create policy "Moderators manage comment visibility" on public.forum_comments for update to authenticated
  using ((select public.current_app_role()) in ('moderator','city_admin'))
  with check ((select public.current_app_role()) in ('moderator','city_admin'));

create or replace function public.review_forum_flag(p_flag_id uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  flag_row public.forum_flags%rowtype;
begin
  if coalesce((select public.current_app_role()), '') not in ('moderator','city_admin') then
    raise exception 'Moderator access required.';
  end if;
  if p_action not in ('hide','restore','dismiss') then raise exception 'Invalid moderation action.'; end if;
  select * into flag_row from public.forum_flags where id = p_flag_id for update;
  if not found then raise exception 'Flag not found.'; end if;
  update public.forum_flags set action = case p_action when 'hide' then 'hidden' when 'restore' then 'restored' else 'dismissed' end,
    reviewed_by = (select auth.uid()) where id = p_flag_id;
  if p_action <> 'dismiss' and flag_row.post_id is not null then
    update public.forum_posts set hidden = (p_action = 'hide') where id = flag_row.post_id;
  elsif p_action <> 'dismiss' and flag_row.comment_id is not null then
    update public.forum_comments set hidden = (p_action = 'hide') where id = flag_row.comment_id;
  end if;
end
$$;
revoke all on function public.review_forum_flag(uuid,text) from public, anon;
grant execute on function public.review_forum_flag(uuid,text) to authenticated;

-- Public projections only expose the snapshot name. Reporter UUIDs and account emails remain private.
grant select (reporter_display_name) on public.reports to anon, authenticated;
grant select (report_id) on public.forum_posts to anon, authenticated;
grant select (hidden) on public.forum_comments to anon, authenticated;
grant select (author_display_name) on public.forum_posts, public.forum_comments to anon, authenticated;
grant select (label) on public.report_media to anon, authenticated;
grant update (hidden) on public.forum_comments to authenticated;
grant select on public.public_reports to anon, authenticated;

-- Keep the admin RPCs from the baseline workflow migration intact. Their locked row update and
-- event insert run in one transaction; direct event/report writes stay unavailable to clients.
revoke insert, update, delete on public.report_events from public, anon, authenticated;
revoke update, delete on public.reports from public, anon, authenticated;

-- Realtime table membership is idempotent for projects with a preconfigured publication.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['reports', 'report_events', 'report_media', 'report_delivery', 'forum_posts', 'forum_comments', 'forum_flags'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end
$$;
