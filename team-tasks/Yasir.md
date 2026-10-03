# Yasir — integration, forum, and platform

**Branch:** `Yasir`  
**Goal:** Turn the current local-first demo into the integrated team build and connect the other owners' feature modules.

## Own

- Supabase sign-in/session handling and role lookup from the protected `profiles` table.
- Hosted report/forum persistence, loading, and permissions. Keep local demo mode available when Supabase is not configured.
- Extract forum posts, comments, flags, moderation actions, and app navigation into `src/features/community/` and `src/features/auth/`.
- Own `src/ui/App.tsx` and `src/ui/styles.css` as the app-shell integration point. Connect Preet's resident components, Ayman's admin components, and Jack's media/report-delivery operations here.
- Keep feature paths separated; ask owners for their exported component/API contract before connecting it.
- Vercel build/deployment configuration and integration checks after the three feature branches are ready.

## Acceptance checks

- A resident can sign in, create and load reports/forum posts from Supabase, and cannot assign roles or change ticket status.
- Demo mode remains usable without secrets and clearly labels sandbox data.
- Forum topics/comments are region-scoped; moderators can review flags, hide/restore content, or dismiss flags.
- Feature PRs merge into `Yasir` cleanly, then the integrated build/tests pass before `Yasir` merges to `main`.

## Coordinate first

Agree on any `src/domain/types.ts` changes with Jack, Ayman, and Preet before implementing the adapter. Keep auth/forum migrations in a separate new migration file; do not rewrite a migration after it has been applied to a shared Supabase project.
