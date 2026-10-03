# FourSight team workplan

## Branch workflow

- `Yasir` is the shared integration branch containing the current demo baseline.
- `Jack`, `Ayman`, and `Preet` are feature branches based on the same `Yasir` snapshot.
- Each feature branch owns separate paths and includes its own assignment in `team-tasks/`.
- Open pull requests from `Jack`, `Ayman`, and `Preet` into `Yasir`, not directly into `main`. Rebase on the latest `Yasir` before opening a PR if shared types or the integration baseline changed.
- Keep `src/domain/types.ts` as the shared ticket contract. Propose contract changes in the PR before spreading them across feature code.
- Do not all edit `src/ui/App.tsx` or `src/ui/styles.css`. Feature owners should provide components in their owned directories; Yasir connects them to the app shell.

## Owners

| Person | Branch | Main ownership | Paths to own |
|---|---|---|---|
| Yasir | `Yasir` | Supabase auth/data integration, forum and moderation, app shell, deployment and feature integration | `src/platform/data.ts`, `src/features/auth/`, `src/features/community/`, `src/ui/App.tsx`, `src/ui/styles.css`, auth/forum migrations |
| Jack | `Jack` | Video/audio processing, transcript confirmation flow, category-to-city mapping, Boston 311 delivery | `src/platform/backend.ts`, `src/platform/video-audio.ts`, `src/features/media/`, `supabase/functions/` |
| Ayman | `Ayman` | City-admin ticket queue, team assignments, status timeline, resolution/hide workflow | `src/features/admin/`, `src/domain/workflow.ts`, a new admin workflow migration under `supabase/migrations/` |
| Preet | `Preet` | Resident-facing map, report composer, media preview, public ticket details and mobile polish | `src/ui/MapView.tsx`, `src/features/resident/`, `resident.css` inside that feature |

## Integration order

1. Everyone starts from this shared baseline and stays within their owned paths.
2. Feature owners export components and data operations from their feature folders; they should not wire routes into `App.tsx`.
3. Yasir integrates the exported components, auth state and persistence after the feature contracts are agreed.
4. Run `npm test`, `npm run build`, and the resident/admin/forum smoke checks before merging the combined work to `main`.

## Current baseline gaps

- The browser demo stores tickets and forum content locally. Auth and hosted Postgres synchronization still need wiring.
- The Supabase migration and functions are scaffolding until deployed and connected to the app.
- BOS:311 needs approved credentials, verified service codes, and the verified Boston service-boundary GeoJSON before live submission.
