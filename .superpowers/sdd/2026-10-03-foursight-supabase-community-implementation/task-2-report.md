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

- Tests-first evidence: the initial focused run failed all four tests because the adapter exports did not yet exist. Final `npm test -- --run src/platform/data.test.ts`: **4 passed**.
- `npx tsc --noEmit -p tsconfig.json`: passed.
- `npm run build`: passed (`tsc -b` and Vite production build).
- `git diff --check`: passed.
- Remote project `ahtikaimxxihoecopfzr` started with zero migrations and zero public tables. After the helper-order fix, Supabase applied in order: `initial`, `admin_workflow`, `civic_persistence_security`, `private_media_visibility_helper` (all successful).
- Remote migration versions recorded by Supabase MCP: `20261004004820 initial`, `20261004004823 admin_workflow`, `20261004004825 civic_persistence_security`, `20261004005443 private_media_visibility_helper`.
- Remote schema query confirmed five maintenance teams, all seven required tables in `supabase_realtime`, the reporter-name view column, post report link, comment hide column, and the existing `admin_transition_report` still inserting status events atomically. A direct SQL batch applied the FK indexes and revoked client execution of the auth-profile trigger callback; the migration source includes those same statements.
- Supabase advisors after the corrective migration: no anonymous SECURITY DEFINER warning. Six authenticated SECURITY DEFINER warnings remain for existing admin/role RPCs and new role-gated `review_forum_flag`. Performance advisor reported no unindexed foreign keys after the indexes were applied. It reported 21 unused indexes on the empty project; these include baseline and new indexes and have not yet seen application traffic.
- Remote privilege check confirmed `private.can_view_report_media()` is SECURITY INVOKER, callable by `anon` only for policy evaluation, with no `public.can_view_report_media()` function remaining.

## Concerns

- Supabase CLI could not authenticate in this checkout (`AccessTokenRequiredError`), so migrations were applied through the connected Supabase MCP. Its API records generated remote versions instead of the checked-in versions. Reconcile migration history before a future `supabase db push` so it does not treat the checked-in migrations as unapplied.
- `private.can_view_report_media()` must remain executable by `anon` and `authenticated` for the Storage policy to invoke it. It is SECURITY INVOKER in the unexposed `private` schema, not a public Data API RPC.
