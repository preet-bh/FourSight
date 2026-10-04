create table public.admin_ticket_audit (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('team_assigned', 'status_changed', 'hidden', 'restored', 'completion_media_added')),
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index admin_ticket_audit_report_idx on public.admin_ticket_audit(report_id, created_at);
alter table public.admin_ticket_audit enable row level security;
revoke all on public.admin_ticket_audit from public, anon, authenticated;
grant select on public.admin_ticket_audit to authenticated;
create policy "City admins read ticket audit" on public.admin_ticket_audit for select to authenticated
  using ((select public.current_app_role()) = 'city_admin');

create or replace function public.create_profile_for_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), 'resident');
  return new;
end
$$;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant select (hide_reason) on public.reports to authenticated;
grant select (storage_path) on public.report_media to anon, authenticated;

revoke update, delete on public.reports from public, anon, authenticated;
revoke insert, update, delete on public.report_events from public, anon, authenticated;

create or replace function public.admin_transition_report(p_report_id uuid, p_status public.report_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  old_status public.report_status;
  clean_note text := nullif(trim(p_note), '');
begin
  if coalesce((select public.current_app_role()), '') <> 'city_admin' then raise exception 'City admin access required.'; end if;
  select status into old_status from public.reports where id = p_report_id for update;
  if old_status is null then raise exception 'Ticket not found.'; end if;
  if not ((old_status = 'new' and p_status = 'in_progress') or (old_status = 'in_progress' and p_status = 'resolved')) then
    raise exception 'Invalid ticket status transition.';
  end if;
  if p_status = 'resolved' and clean_note is null then raise exception 'A public resolution note is required.'; end if;
  update public.reports set status = p_status, updated_at = now() where id = p_report_id;
  insert into public.report_events(report_id, status, note, actor_id)
    values (p_report_id, p_status, clean_note, (select auth.uid()));
  insert into public.admin_ticket_audit(report_id, actor_id, action, reason, details)
    values (p_report_id, (select auth.uid()), 'status_changed', clean_note,
      jsonb_build_object('from', old_status, 'to', p_status));
end
$$;

create or replace function public.admin_assign_report_team(p_report_id uuid, p_team_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  old_team_id uuid;
  ticket_region text;
begin
  if coalesce((select public.current_app_role()), '') <> 'city_admin' then raise exception 'City admin access required.'; end if;
  select assigned_team_id, region into old_team_id, ticket_region
    from public.reports where id = p_report_id for update;
  if not found then raise exception 'Ticket not found.'; end if;
  if p_team_id is not null and not exists (
    select 1 from public.maintenance_teams
    where id = p_team_id and lower(region) = lower(ticket_region)
  ) then raise exception 'The selected team is not available in this report region.'; end if;
  update public.reports set assigned_team_id = p_team_id, updated_at = now() where id = p_report_id;
  insert into public.admin_ticket_audit(report_id, actor_id, action, details)
    values (p_report_id, (select auth.uid()), 'team_assigned',
      jsonb_build_object('from_team_id', old_team_id, 'to_team_id', p_team_id));
end
$$;

create or replace function public.admin_set_report_visibility(p_report_id uuid, p_hidden boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  old_hidden boolean;
begin
  if coalesce((select public.current_app_role()), '') <> 'city_admin' then raise exception 'City admin access required.'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'An audit reason is required to hide or restore a report.'; end if;
  select hidden_from_map into old_hidden from public.reports where id = p_report_id for update;
  if not found then raise exception 'Ticket not found.'; end if;
  if old_hidden = p_hidden then raise exception 'The report already has the requested visibility.'; end if;
  update public.reports
    set hidden_from_map = p_hidden,
        hide_reason = case when p_hidden then trim(p_reason) else null end,
        hidden_by = case when p_hidden then (select auth.uid()) else null end,
        updated_at = now()
    where id = p_report_id;
  insert into public.admin_ticket_audit(report_id, actor_id, action, reason)
    values (p_report_id, (select auth.uid()), case when p_hidden then 'hidden' else 'restored' end, trim(p_reason));
end
$$;

create or replace function public.admin_resolve_report(p_report_id uuid, p_note text, p_storage_path text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  media_id uuid;
  ticket_status public.report_status;
  clean_note text := nullif(trim(p_note), '');
begin
  if coalesce((select public.current_app_role()), '') <> 'city_admin' then raise exception 'City admin access required.'; end if;
  if clean_note is null then raise exception 'A public resolution note is required.'; end if;
  select status into ticket_status from public.reports where id = p_report_id for update;
  if not found then raise exception 'Ticket not found.'; end if;
  if ticket_status <> 'in_progress' then raise exception 'Completion photos can only be attached to an in-progress ticket.'; end if;

  if p_storage_path is not null then
    if p_storage_path not like 'admin/' || p_report_id::text || '/%' then raise exception 'Invalid completion photo storage path.'; end if;
    if not exists (select 1 from storage.objects where bucket_id = 'report-media' and name = p_storage_path) then
      raise exception 'Completion photo upload was not found.';
    end if;
    insert into public.report_media(report_id, storage_path, kind)
      values (p_report_id, p_storage_path, 'completion') returning id into media_id;
  end if;

  update public.reports set status = 'resolved', updated_at = now() where id = p_report_id;
  insert into public.report_events(report_id, status, note, actor_id)
    values (p_report_id, 'resolved', clean_note, (select auth.uid()));
  insert into public.admin_ticket_audit(report_id, actor_id, action, reason, details)
    values (p_report_id, (select auth.uid()), 'status_changed', clean_note,
      jsonb_build_object('from', ticket_status, 'to', 'resolved'));
  if media_id is not null then
    insert into public.admin_ticket_audit(report_id, actor_id, action, details)
      values (p_report_id, (select auth.uid()), 'completion_media_added', jsonb_build_object('media_id', media_id));
  end if;
  return media_id;
end
$$;

revoke all on function public.admin_transition_report(uuid, public.report_status, text) from public, anon;
revoke all on function public.admin_assign_report_team(uuid, uuid) from public, anon;
revoke all on function public.admin_set_report_visibility(uuid, boolean, text) from public, anon;
revoke all on function public.admin_resolve_report(uuid, text, text) from public, anon;
grant execute on function public.admin_transition_report(uuid, public.report_status, text) to authenticated;
grant execute on function public.admin_assign_report_team(uuid, uuid) to authenticated;
grant execute on function public.admin_set_report_visibility(uuid, boolean, text) to authenticated;
grant execute on function public.admin_resolve_report(uuid, text, text) to authenticated;

create policy "City admins upload completion photos" on storage.objects for insert to authenticated with check (
  bucket_id = 'report-media'
  and (storage.foldername(name))[1] = 'admin'
  and exists (
    select 1 from public.reports r
    where r.id::text = (storage.foldername(name))[2]
      and (select public.current_app_role()) = 'city_admin'
  )
);

create policy "City admins read completion uploads" on storage.objects for select to authenticated using (
  bucket_id = 'report-media'
  and (storage.foldername(name))[1] = 'admin'
  and (select public.current_app_role()) = 'city_admin'
);

create policy "City admins remove unattached completion photos" on storage.objects for delete to authenticated using (
  bucket_id = 'report-media'
  and (storage.foldername(name))[1] = 'admin'
  and (select public.current_app_role()) = 'city_admin'
  and not exists (select 1 from public.report_media where storage_path = name)
);
