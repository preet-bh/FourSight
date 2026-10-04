-- The app now accepts new activity for Dearborn only. Historical records remain intact.
alter table public.maintenance_teams alter column region set default 'Dearborn';

insert into public.maintenance_teams(name, category, region) values
  ('Street & Sidewalks', 'Street & sidewalk', 'Dearborn'),
  ('Sanitation Services', 'Trash & sanitation', 'Dearborn'),
  ('Electrical & Lighting', 'Lighting', 'Dearborn'),
  ('Parks & Public Space', 'Parks', 'Dearborn'),
  ('Water & Drainage', 'Water & drainage', 'Dearborn')
on conflict (lower(name), lower(category), lower(region)) do nothing;

drop policy if exists "Residents create their own reports" on public.reports;
create policy "Residents create their own reports" on public.reports for insert to authenticated
  with check (
    owner_id = (select auth.uid()) and status = 'new' and not hidden_from_map
    and region = 'Dearborn'
  );

drop policy if exists "Residents create forum posts" on public.forum_posts;
create policy "Residents create forum posts" on public.forum_posts for insert to authenticated
  with check (
    author_id = (select auth.uid()) and region = 'Dearborn'
    and (report_id is null or exists (
      select 1 from public.reports r
      where r.id = forum_posts.report_id and r.region = forum_posts.region and not r.hidden_from_map
    ))
  );

-- No municipal handoff is configured for Dearborn. Keep that separate from ticket status.
create or replace function public.initialize_report_records()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.report_delivery(report_id, state, message)
  values (new.id, 'sandbox', 'Tracked in FourSight. City delivery is not connected yet.')
  on conflict (report_id) do nothing;
  insert into public.report_events(report_id, status, actor_id) values (new.id, new.status, new.owner_id);
  return new;
end
$$;
revoke all on function public.initialize_report_records() from public, anon, authenticated;

update public.report_delivery d
set state = 'sandbox', message = 'Tracked in FourSight. City delivery is not connected yet.', updated_at = now()
from public.reports r
where r.id = d.report_id and r.region = 'Dearborn' and d.state = 'pending';
