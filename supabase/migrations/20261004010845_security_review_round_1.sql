-- Use a narrow owner check when report-associated reads execute under client roles.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.can_view_report(p_report_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.reports r
    where r.id = p_report_id
      and (not r.hidden_from_map
        or r.owner_id = (select auth.uid())
        or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'city_admin'))
  )
$$;
revoke all on function private.can_view_report(uuid) from public;
grant execute on function private.can_view_report(uuid) to anon, authenticated;

create or replace function private.can_view_report_media(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.report_media m
    where m.storage_path = object_name and (select private.can_view_report(m.report_id))
  )
$$;
revoke all on function private.can_view_report_media(text) from public;
grant execute on function private.can_view_report_media(text) to anon, authenticated;

create or replace function private.can_add_report_media(p_report_id uuid, p_storage_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.reports r
    where r.id = p_report_id and r.owner_id = (select auth.uid())
      and left(p_storage_path, length((select auth.uid())::text || '/' || p_report_id::text || '/'))
        = (select auth.uid())::text || '/' || p_report_id::text || '/'
  )
$$;
revoke all on function private.can_add_report_media(uuid,text) from public, anon;
grant execute on function private.can_add_report_media(uuid,text) to authenticated;

create or replace function private.can_upload_report_storage(p_owner_folder text, p_report_folder text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_owner_folder = (select auth.uid())::text
    and exists (
      select 1 from public.reports r
      where r.id::text = p_report_folder and r.owner_id = (select auth.uid())
    )
$$;
revoke all on function private.can_upload_report_storage(text,text) from public, anon;
grant execute on function private.can_upload_report_storage(text,text) to authenticated;

-- Public reads never call the authenticated role helper; hidden reports stay owner/admin scoped.
drop policy if exists "Public sees visible reports" on public.reports;
create policy "Anonymous reads visible reports" on public.reports for select to anon using (not hidden_from_map);
create policy "Authenticated reads visible or owned reports" on public.reports for select to authenticated
  using (not hidden_from_map or owner_id = (select auth.uid()) or (select public.current_app_role()) = 'city_admin');

drop policy if exists "Forum reads visible posts" on public.forum_posts;
create policy "Anonymous reads visible posts" on public.forum_posts for select to anon using (not hidden);
create policy "Authenticated reads posts by role" on public.forum_posts for select to authenticated
  using (not hidden or (select public.current_app_role()) in ('moderator','city_admin'));

drop policy if exists "Forum reads visible comments" on public.forum_comments;
create policy "Anonymous reads visible comments" on public.forum_comments for select to anon
  using (not hidden and exists (select 1 from public.forum_posts p where p.id = post_id and not p.hidden));
create policy "Authenticated reads comments by role" on public.forum_comments for select to authenticated
  using (
    exists (select 1 from public.forum_posts p where p.id = post_id and (not p.hidden or (select public.current_app_role()) in ('moderator','city_admin')))
    and (not hidden or (select public.current_app_role()) in ('moderator','city_admin'))
  );

-- Private-report visibility must not require clients to select reports.owner_id.
drop policy if exists "Visible report media is readable" on public.report_media;
create policy "Visible report media is readable" on public.report_media for select to anon, authenticated
  using ((select private.can_view_report(report_id)));
drop policy if exists "Report owners add media" on public.report_media;
create policy "Report owners add media" on public.report_media for insert to authenticated
  with check ((select private.can_add_report_media(report_id, storage_path)));

drop policy if exists "Delivery visible with report" on public.report_delivery;
create policy "Delivery visible with report" on public.report_delivery for select to anon, authenticated
  using ((select private.can_view_report(report_id)));
drop policy if exists "Events visible with report" on public.report_events;
create policy "Events visible with report" on public.report_events for select to anon, authenticated
  using ((select private.can_view_report(report_id)));

drop policy if exists "Owners upload report media" on storage.objects;
create policy "Owners upload report media" on storage.objects for insert to authenticated with check (
  bucket_id = 'report-media'
  and (select private.can_upload_report_storage((storage.foldername(name))[1], (storage.foldername(name))[2]))
);
drop policy if exists "Public may read visible report media" on storage.objects;
create policy "Public may read visible report media" on storage.objects for select to anon, authenticated
  using (bucket_id = 'report-media' and (select private.can_view_report_media(name)));

-- Moderation decisions append to an immutable record; visibility changes only through its guarded RPC.
create table public.forum_flag_reviews (
  id uuid primary key default gen_random_uuid(),
  flag_id uuid not null references public.forum_flags(id) on delete restrict,
  action text not null check (action in ('hide','restore','dismiss')),
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index forum_flag_reviews_history_idx on public.forum_flag_reviews(flag_id, created_at);
alter table public.forum_flag_reviews enable row level security;
revoke all on public.forum_flag_reviews from public, anon, authenticated;
grant select on public.forum_flag_reviews to authenticated;
create policy "Moderators read moderation history" on public.forum_flag_reviews for select to authenticated
  using ((select public.current_app_role()) in ('moderator','city_admin'));

drop policy if exists "Moderators manage posts" on public.forum_posts;
drop policy if exists "Moderators manage comment visibility" on public.forum_comments;
drop policy if exists "Moderators review flags" on public.forum_flags;
revoke update on public.forum_posts, public.forum_flags from public, anon, authenticated;
revoke update (hidden) on public.forum_comments from public, anon, authenticated;

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
  if flag_row.action not in ('pending','hidden') then raise exception 'This flag has already been reviewed.'; end if;
  if p_action = 'restore' and flag_row.action <> 'hidden' then raise exception 'Only hidden content can be restored.'; end if;
  if p_action = 'hide' and flag_row.action = 'hidden' then raise exception 'This content is already hidden.'; end if;

  insert into public.forum_flag_reviews(flag_id, action, reviewed_by)
    values (p_flag_id, p_action, (select auth.uid()));
  update public.forum_flags
    set action = case p_action when 'hide' then 'hidden' when 'restore' then 'restored' else 'dismissed' end,
        reviewed_by = (select auth.uid())
    where id = p_flag_id;
  if p_action <> 'dismiss' and flag_row.post_id is not null then
    update public.forum_posts set hidden = (p_action = 'hide') where id = flag_row.post_id;
  elsif p_action <> 'dismiss' and flag_row.comment_id is not null then
    update public.forum_comments set hidden = (p_action = 'hide') where id = flag_row.comment_id;
  end if;
end
$$;
revoke all on function public.review_forum_flag(uuid,text) from public, anon;
grant execute on function public.review_forum_flag(uuid,text) to authenticated;
