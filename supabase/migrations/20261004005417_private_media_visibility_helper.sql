-- Storage's RLS policy needs a helper, but that helper does not need a public RPC endpoint.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.can_view_report_media(object_name text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.report_media m where m.storage_path = object_name
  )
$$;
revoke all on function private.can_view_report_media(text) from public;
grant execute on function private.can_view_report_media(text) to anon, authenticated;

drop policy if exists "Public may read visible report media" on storage.objects;
create policy "Public may read visible report media" on storage.objects for select to anon, authenticated
  using (bucket_id = 'report-media' and (select private.can_view_report_media(name)));

drop function if exists public.can_view_report_media(text);
