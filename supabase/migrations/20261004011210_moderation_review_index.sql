create index if not exists forum_flag_reviews_reviewed_by_idx
  on public.forum_flag_reviews(reviewed_by);
