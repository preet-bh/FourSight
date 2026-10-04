revoke insert on public.forum_flags from public, anon, authenticated;
grant insert (post_id, comment_id, reporter_id, reason)
  on public.forum_flags to authenticated;

drop policy if exists "Users create flags" on public.forum_flags;
create policy "Users create pending flags"
  on public.forum_flags for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and action = 'pending'
    and reviewed_by is null
  );
