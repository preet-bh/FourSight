# FourSight Supabase and Community Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Tasks 2–4 may run in parallel after Task 1 publishes the shared contracts. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Yasir's assigned Supabase auth/data integration, community forum and moderation, app-shell composition, and Vercel configuration in the `Yasir` branch.

**Architecture:** Provision the confirmed Supabase project, define stable contracts for parallel owners, then have separate workers own the database/data adapter, auth feature, and community feature. After those deliverables land, integrate them through the app shell, align the contracts with available Jack/Ayman/Preet feature exports, and finish Vercel configuration and integration checks.

**Tech Stack:** React 18, TypeScript, Vite, `@supabase/supabase-js` 2.57.0, Supabase Auth/Postgres/Storage/Realtime, Vitest, Vercel.

**Spec:** `docs/superpowers/specs/2026-10-03-foursight-supabase-persistence-design.md`

## Global Constraints

- Require email/password sign-up with a display name and syntactically valid email; keep Supabase email confirmation enabled and use its link flow, with no OTP codes.
- Public users may view visible reports, public status histories, disclosed media, and visible forum content; sign-in is required to submit or participate.
- Public records may show display names but never account email; keep emails and protected roles out of public projections.
- Use RLS on every exposed table and trust only protected profile role data for admin/moderator authorization.
- Keep Supabase URL and publishable key in local environment config; never ship service-role/secret keys.
- Keep demo mode explicit when Supabase is unconfigured; never report an offline write as remotely saved.
- Store Yasir's schema work in a new migration; do not rewrite migrations already applied to a shared database.
- Keep feature implementation out of `src/ui/App.tsx`; compose exported feature APIs there.
- Coordinate changes to `src/domain/types.ts` with Jack, Ayman, and Preet before changing shared ticket contracts.
- Merge Jack/Ayman/Preet feature branches into `Yasir`; treat `Yasir` as the integration branch and do not merge to `main` in this task.
- Vercel work is configuration/documentation only; do not publish/deploy or commit secrets.

## Review Focus

- Valid-looking but unverified email: signup works without an OTP, and the UI does not claim mailbox ownership is proven. Pin in the auth task with pure validation and signup option checks.
- Public identity leakage: map, report details, posts, comments, and public views include display names but never email. Pin in data/auth/forum task checks.
- Role escalation: resident signup/profile updates cannot create admin or moderator roles. Pin in migration/RLS review and role lookup checks.
- Invalid or forged ticket updates: resident attempts fail; only valid admin transitions append status events, and resolve requires a note. Pin in migration/data task database checks.
- Hidden or flagged forum content: normal users cannot see hidden content or moderate; moderators can hide/restore/dismiss posts and comments while retaining the audit trail. Pin in migration/community task checks.

---

### Task 1: Provision Supabase and publish shared feature contracts (root)

**Files:**
- Create: `src/platform/contracts.ts`
- Modify: `README.md` only if project setup instructions need a shared contract note
- External: create Supabase project `FourSight` in organization `yasirshah-csds`, region `us-east-1` (Boston pilot)

**Interfaces:**
- Consumes: Existing `src/domain/types.ts`, `src/platform/backend.ts`, and the Yasir/feature-owner paths in `TEAM_WORKPLAN.md`.
- Produces: Exact `AuthState`, `AuthApi`, `CivicDataApi`, and `CommunityDataApi` interfaces in `src/platform/contracts.ts`; Supabase project ref, URL, and publishable key available through local environment configuration. Do not write secret values to tracked files.

The shared interfaces are fixed as follows:

```ts
type AuthRole = 'resident' | 'city_admin' | 'moderator';
type AuthState = {
  status: 'loading' | 'signed_out' | 'signed_in' | 'demo';
  user: { id: string; displayName: string; role: AuthRole } | null;
};
type PublicReportRecord = Omit<Report, 'reporterId' | 'hideReason'> & { databaseId: string; reporterName: string };
type StaffReportRecord = Omit<Report, 'reporterId'> & { databaseId: string; reporterName: string };
type ReportMediaUpload = {
  file: File; kind: ReportMedia['kind']; label?: string; selectedFrameSeconds?: number;
};
type NewReportInput = Pick<Report, 'title' | 'description' | 'category' | 'region' | 'location'> & {
  transcript?: string; media: ReportMediaUpload[];
};
type CommunityComment = { id: string; body: string; author: string; at: string; hidden: boolean };
type CommunityPost = Omit<ForumPost, 'comments'> & { reportId: string | null; comments: CommunityComment[] };
type ModerationTarget = { kind: 'post' | 'comment'; id: string };

interface AuthApi {
  getState(): Promise<AuthState>;
  subscribe(listener: (state: AuthState) => void): () => void;
  signUp(input: { displayName: string; email: string; password: string }): Promise<{ confirmationRequired: true }>;
  signIn(input: { email: string; password: string }): Promise<void>;
  signOut(): Promise<void>;
}
interface CivicDataApi {
  listReports(region: string): Promise<PublicReportRecord[]>;
  listStaffReports(region: string): Promise<StaffReportRecord[]>;
  getReport(publicId: string): Promise<PublicReportRecord | null>;
  createReport(input: NewReportInput): Promise<PublicReportRecord>;
  listTeams(): Promise<Team[]>;
  assignTeam(databaseId: string, teamId: string | null): Promise<void>;
  transitionReport(databaseId: string, status: TicketStatus, note?: string): Promise<void>;
  setReportVisibility(databaseId: string, hidden: boolean, reason: string): Promise<void>;
  subscribeReports(region: string, listener: (reports: PublicReportRecord[]) => void): () => void;
}
interface CommunityDataApi {
  listPosts(region: string): Promise<CommunityPost[]>;
  createPost(input: { region: string; topic: string; title: string; body: string; reportId?: string }): Promise<CommunityPost>;
  addComment(postId: string, body: string): Promise<CommunityComment>;
  flagContent(target: ModerationTarget, reason?: string): Promise<void>;
  reviewFlag(flagId: string, action: 'hide' | 'restore' | 'dismiss'): Promise<void>;
  subscribeCommunity(region: string, listener: (posts: CommunityPost[]) => void): () => void;
}
```

Adapters map the existing UI-facing `Report`/`ForumPost` contracts at this boundary. `Report.id` remains the public ticket label; `databaseId` is the UUID required by admin RPCs. `PublicReportRecord` omits account id and staff-only hide reason; `StaffReportRecord` may include hide reason. Email and role data must never be part of report or community records.

- [ ] Reconfirm the known $0/month project estimate using the Supabase tool and create `FourSight` in `yasirshah-csds`, US East.
- [ ] Wait for project initialization and retrieve its URL and publishable key; put values only in ignored local environment configuration and preserve blank `.env.example` placeholders.
- [ ] Verify the project's Auth settings keep email confirmation enabled; use confirmation links and do not enable OTP codes.
- [ ] Define the auth, civic data, and community API signatures from the existing domain types. Include async loading/error contracts and public/private response distinctions.
- [ ] Review the contract against the existing Jack/Ayman/Preet branch exports when available; record compatibility adapters instead of silently changing shared ticket types.

### Task 2: Supabase schema, persistence adapter, and status/event rules (parallel agent A)

**Files:**
- Create: migration generated by `supabase migration new civic_persistence_security` (use the exact generated path)
- Modify: `src/platform/data.ts`
- Modify: `src/domain/types.ts` only if Task 1 documents agreement/compatibility
- Create: `src/platform/data.test.ts`

**Interfaces:**
- Consumes: `AuthApi`, `CivicDataApi`, and `CommunityDataApi` from `src/platform/contracts.ts`; current Supabase client in `src/platform/backend.ts`.
- Produces: concrete Supabase-backed adapters for report, media, delivery, status-event, forum, and moderation reads/writes, mapped to existing `Report`/`ForumPost` domain types.

- [ ] Add focused failing tests for row-to-domain mapping, public/private field selection, and failure behavior; run those tests before implementation.
- [ ] Create a new migration adding public reporter display-name projection, optional report links on posts, comment hide state, required indexes/constraints, and safe RLS/RPC policies without rewriting the initial migration.
- [ ] Seed the existing maintenance teams idempotently and enable Realtime publication for the report/event/forum tables required by the app.
- [ ] Ensure status changes and event insertion are atomic; enforce admin-only transitions, valid ordering, and mandatory non-empty resolution notes in the database.
- [ ] Implement the `CivicDataApi` and `CommunityDataApi` adapters; upload media with owner-scoped paths and read public media only for visible reports.
- [ ] Add subscriptions for public ticket/status and forum changes with cleanup and fetch fallback.
- [ ] Run focused adapter tests, apply the migration to the new Supabase project, inspect the resulting schema, and run Supabase security/performance advisors.

### Task 3: Auth feature and protected role/session handling (parallel agent B)

**Files:**
- Create: `src/features/auth/AuthPanel.tsx`
- Create: `src/features/auth/auth-service.ts`
- Create: `src/features/auth/auth-service.test.ts`
- Create: `src/features/auth/auth.css`

**Interfaces:**
- Consumes: `AuthApi`/`AuthState` from `src/platform/contracts.ts` and the configured Supabase client.
- Produces: email/password signup and sign-in, display-name collection, session observation/sign-out, and protected profile role lookup for app-shell composition.

- [ ] Add failing tests for email-format validation, signup metadata construction, confirmation-required signup behavior, and safe role defaults; run them to demonstrate the expected failures.
- [ ] Implement signup with name/email/password and user-facing validation; show a check-your-email state after signup and do not use OTP codes.
- [ ] Implement sign-in, session restore/listener, sign-out, and profile role lookup. Ignore user-editable metadata when deciding staff permissions.
- [ ] Build an accessible auth panel for app-shell use and add focused auth-service tests.
- [ ] Run auth tests and confirm no email address is rendered into public report/forum props.

### Task 4: Community forum and moderation feature (parallel agent C)

**Files:**
- Create: `src/features/community/ForumPage.tsx`
- Create: `src/features/community/ForumPage.test.ts`
- Create: `src/features/community/community.css`
- Modify: `src/domain/types.ts` only if Task 1 has recorded agreement/compatibility

**Interfaces:**
- Consumes: `CommunityDataApi`, `AuthState`, and `ForumPost` from the shared contracts/domain types.
- Produces: region-scoped forum view with report-linked and general civic topics, post/comment/flag actions, and moderator queue controls; component receives API/session/region via props and does not import app-shell state.

- [ ] Add failing tests for topic coverage, region filtering, post/comment submission, flags, and moderator-only hide/restore/dismiss actions.
- [ ] Extract the forum behavior currently embedded in `src/ui/App.tsx` into `ForumPage.tsx` without editing `App.tsx`.
- [ ] Add report discussion and broad social/economic topics including electricity/utilities, housing, cost of living, transit, safety, and public services; allow optional report reference.
- [ ] Connect all writes/reads to `CommunityDataApi`, render loading/empty/error states, and keep email out of public post/comment models.
- [ ] Run focused community tests and confirm only moderator/admin sessions see the moderation queue.

### Task 5: App-shell integration and team feature composition (root, after Tasks 2–4)

**Files:**
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/styles.css`
- Modify: `src/platform/data.ts` only for integration adapters agreed with Task 2

**Interfaces:**
- Consumes: auth panel/service, forum page, persisted data APIs, and exported resident/admin/media modules from Jack/Ayman/Preet when present.
- Produces: integrated navigation, auth gating, public report/map queries, ticket detail/status refresh, forum route/view, and explicit unconfigured demo behavior.

- [ ] Replace fake identity and localStorage as the configured app's source of truth with the auth/session and Supabase APIs.
- [ ] Compose auth/community/resident/admin/media modules from their public APIs; when a teammate's module is not available, use a minimal typed adapter without duplicating its feature implementation.
- [ ] Preserve public map/report access, display reporter names without email, gate report/forum writes by sign-in, and present truthful backend loading/error states.
- [ ] Ensure ticket and forum Realtime subscriptions update visible screens and always clean up on navigation/unmount.
- [ ] Build the application after integration and resolve TypeScript/Vite errors.

### Task 6: Vercel configuration, environment docs, and integration review (root)

**Files:**
- Modify: `vercel.json` only if required by observed Vite deployment behavior
- Modify: `.env.example`
- Modify: `README.md`
- Review: `TEAM_WORKPLAN.md`, `team-tasks/Yasir.md`

**Interfaces:**
- Consumes: integrated Vite build, public Supabase URL/publishable key names, and existing branch workflow.
- Produces: documented Vercel build settings and environment variable names, no credentials, and a clean integration checklist for `Yasir`.

- [ ] Document local Supabase setup, Auth confirmation setting, public/private key handling, data migration application, demo mode, and the protected one-time procedure for granting the initial city-admin/moderator roles.
- [ ] Confirm `.env.example` contains only empty browser-safe placeholders and `.gitignore` excludes local environment files.
- [ ] Review Vercel configuration against `npm run build`; change config only for a reproduced deployment requirement.
- [ ] Run `npm test` and `npm run build`, then smoke-check resident, ticket status, forum, and moderation flows against the configured project and demo mode.
- [ ] Review migration/RLS, confirm Supabase security/performance advisors are addressed, inspect `git diff`, and leave all integration changes on `Yasir` without merging to `main`.

## Parallel execution order

Task 1 is sequential. After `src/platform/contracts.ts` is committed and Supabase settings are available, start Tasks 2, 3, and 4 simultaneously with strict ownership of their listed paths. Root may prepare Vercel/environment documentation during that parallel work, but must not edit agent-owned files. Run Task 5 after the three agents return their exports, then complete Task 6.
