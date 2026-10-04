# Task 2 Report: Supabase persistence adapter

## Implementation

- Added the Supabase-backed `CivicDataApi` and `CommunityDataApi` adapters with row mapping, public/staff projections, report/media/event/delivery reads, owner-scoped uploads, admin RPC calls, linked forum posts, comments, flags, moderation listing/review, subscriptions, cleanup, and initial fetch fallback.
- Kept `Report.id` as the public `FS-*` label and passed `databaseId` UUIDs to admin RPCs.
- Added focused mapping/error tests in `src/platform/data.test.ts`; preserved local demo persistence exports and re-exported the Supabase APIs from `src/platform/data.ts`.
- Generated migrations using `supabase migration new`: `20261004003711_civic_persistence_security.sql` and the requested corrective migration `20261004005417_private_media_visibility_helper.sql`.
- The schema adds the safe reporter display-name projection, optional post-to-report FK, comment hide state, media labels, foreign-key indexes, idempotent team seeding, report-created delivery/event rows, moderator-only atomic flag review, and Realtime publication membership for seven civic/forum tables.
- The baseline `202610030001_initial.sql` had one order defect: `can_view_report_media()` referenced `current_app_role()` before it was defined. The first apply rolled back with PostgreSQL 42883. Per approval, moved only `current_app_role()` earlier; the Ayman RPC migration was not modified or duplicated.
- The original anon media-helper SECURITY DEFINER finding was fixed by the corrective migration. `private.can_view_report_media()` is SECURITY INVOKER and probes `report_media.storage_path`; that table's RLS policy controls row visibility. The Storage policy invokes it from the unexposed `private` schema. Supabase's [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) and [policy helper guidance](https://supabase.com/docs/guides/troubleshooting/do-i-need-to-expose-security-definer-functions-in-row-level-security-policies-iI0uOw) support schema-qualified helper functions in policies without exposing them as Data API endpoints.

## Verification

- Tests-first evidence: the initial focused run failed all four tests because the adapter exports did not yet exist. The current focused suite also covers hidden flags remaining in the active queue and all moderator decisions going through the guarded RPC; final result recorded below.
- `npx tsc --noEmit -p tsconfig.json`: passed.
- `npm run build`: passed (`tsc -b` and Vite production build).
- `git diff --check`: passed.
- Remote project `ahtikaimxxihoecopfzr` started with zero migrations and zero public tables. After the helper-order fix, Supabase applied in order: `initial`, `admin_workflow`, `civic_persistence_security`, `private_media_visibility_helper` (all successful).
- Remote migration versions recorded by Supabase MCP: `20261004004820 initial`, `20261004004823 admin_workflow`, `20261004004825 civic_persistence_security`, `20261004005443 private_media_visibility_helper`.
- Remote schema query confirmed five maintenance teams, all seven required tables in `supabase_realtime`, the reporter-name view column, post report link, comment hide column, and the existing `admin_transition_report` still inserting status events atomically. A direct SQL batch applied the FK indexes and revoked client execution of the auth-profile trigger callback; the migration source includes those same statements.
- Supabase advisors after the corrective migration: no anonymous SECURITY DEFINER warning. Six authenticated SECURITY DEFINER warnings remain for existing admin/role RPCs and new role-gated `review_forum_flag`. Performance advisor reported no unindexed foreign keys after the indexes were applied. It reported 21 unused indexes on the empty project; these include baseline and new indexes and have not yet seen application traffic.
- Remote privilege check confirmed `private.can_view_report_media()` is SECURITY INVOKER, callable by `anon` only for policy evaluation, with no `public.can_view_report_media()` function remaining.

## Concerns

- Supabase CLI could not authenticate in this checkout (`AccessTokenRequiredError`), so migrations were applied through the connected Supabase MCP. The filenames have since been reconciled with the recorded remote versions.
- `private.can_view_report_media()` must remain executable by `anon` and `authenticated` for the Storage policy to invoke it. It is SECURITY INVOKER in the unexposed `private` schema, not a public Data API RPC.

## Security review round 1

- Preserved the four applied baseline migration bodies (including only the previously approved helper-order correction in `initial.sql`) and renamed their tracked files to match remote migration history. The remotely applied security review migration is tracked as `20261004010845_security_review_round_1.sql`; its SQL is unchanged after application. A follow-up `20261004011210_moderation_review_index.sql` adds the advisor-requested `forum_flag_reviews(reviewed_by)` index and was applied successfully.
- Anonymous-role transaction checks with temporary fixtures passed for visible versus hidden reports, report media metadata, Storage objects, forum posts, and comments. No `current_app_role()` permission errors occurred, visible rows were readable, and hidden rows were not exposed. Fixture transaction was rolled back.
- Authenticated-role checks with temporary resident/moderator fixtures passed: cross-owner report-media storage paths were rejected; direct moderator UPDATE of a post was denied; `review_forum_flag` hid a post and retained its flag in the active queue, restored the same target and closed the flag, dismissed a separate flag without changing target visibility, and hid/restored a comment. Five append-only review rows were present for the five successful decisions. Fixture transaction was rolled back.
- Post-migration privilege checks confirmed authenticated lacks UPDATE on forum posts, forum flags, and comment visibility. Remote migration history is now reconciled exactly through `20261004011210 moderation_review_index`.
- Security advisor after these migrations reports only six authenticated SECURITY DEFINER functions, all role-guarded: the four existing admin RPCs, `current_app_role`, and `review_forum_flag`. There are no anonymous SECURITY DEFINER warnings. Performance advisor no longer reports an unindexed foreign key; its 22 unused-index INFO notices are expected on the empty project.
- Remote migration apply outcomes: `security_review_round_1` succeeded at `20261004010845`; `moderation_review_index` succeeded at `20261004011210`. A first disposable fixture attempt failed its input check because the hidden-report test row omitted required hide metadata; the transaction rolled back. The corrected anon and moderator fixture batches both passed and rolled back cleanly.
- Local verification after round 1: `npm test` passed (3 files, 13 tests); `npm run build` passed (`tsc -b` and Vite production build); `git diff --check` passed (Git printed only line-ending normalization warnings for the report and test file).
