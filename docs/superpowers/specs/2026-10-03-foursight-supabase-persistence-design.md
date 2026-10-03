# FourSight Supabase Persistence and Community Forum Design

**Date:** 2026-10-03  
**Status:** Design approved in conversation; awaiting written-spec review  
**Repository:** FourSight

## Goal

Connect FourSight's existing civic reporting and community forum screens to Supabase so residents can create accounts, submit and follow city tickets, and discuss broader community concerns, while city staff update ticket status and moderators review flagged content.

## Decisions and requirements

- Create the Supabase project named `FourSight` in organization `yasirshah-csds`. The connected Supabase tool quoted $0/month; the user confirmed that organization and cost on 2026-10-03.
- Use Supabase Auth with email and password. Require a non-empty display name and syntactically valid email address at signup. Without mailbox verification, the app can validate address format but cannot prove the address is deliverable or controlled by the user. Disable email confirmation; do not require OTP or email-link verification.
- Require sign-in to submit reports, start forum discussions, comment, flag content, and use staff controls. Public visitors may view visible reports, status histories, report media intended for public display, and visible forum content without signing in.
- Public reports may show the reporter's display name. Never include account email in public report, map, forum, or moderation projections. Keep owner identity for authorization and private account management.
- Replace `localStorage` as the source of persisted app state with Supabase reads/writes. Keep local demo seeds available only in an explicit unconfigured/demo mode; surface backend errors instead of claiming a failed write succeeded.
- Persist report fields, media references, 311 delivery state, team assignments, and append-only public status events. Only a city admin can assign a team or transition `new -> in_progress -> resolved`; resolving requires a public resolution note. Ticket status is independent from 311 delivery status.
- Persist forum topics, posts, comments, and moderation flags. Allow a post to link to an existing report so neighbors can discuss it. Cover maintenance reports and wider local issues, including electricity/utilities, cost of living, housing, transit, public safety, public spaces, neighborhood services, and other civic or social/economic policy concerns.
- Authenticated users may create posts, comments, and flags. Only moderator/city-admin roles may review flags and hide, restore, or dismiss content. Role grants must not be user-editable through signup metadata or ordinary profile updates.
- Use row-level security on every exposed table. Keep emails and private role/profile data out of public views. Public report/forum projections contain only the display names and fields needed by the UI.
- Subscribe to relevant Supabase Realtime changes so public ticket status updates and new forum activity can appear without requiring a full reload; normal initial fetch and manual refresh remain the fallback.
- Store Supabase project URL and publishable key in local environment configuration. Never place service-role keys in browser code. Keep `.env.example` with blank placeholders and do not commit real secrets.

## Architecture

The current Vite/React app already has a Supabase JS client, a first schema migration, and report/forum TypeScript contracts, but `src/platform/data.ts` and `src/ui/App.tsx` currently persist app state in `localStorage` and use hard-coded demo identity. The implementation will introduce a Supabase-backed data/auth layer that maps database rows to the existing domain types, then make UI actions asynchronous and reflect loading and error states.

The migration will be reviewed and amended through a new migration rather than editing an already-applied remote migration. It will address safe profile/display-name reads, public reporter names without emails, account role protections, status/event consistency, and any RLS or storage rules required by the real app flows. Public query surfaces will omit private account fields. Admin status updates will use the existing constrained database function or an equivalent reviewed RPC so state changes and event history stay consistent. Moderation must support hiding/restoring a post or an individual comment while retaining it for staff review.

## Main flows

### Authentication

A visitor can browse public pages. To report or participate, the visitor creates an account with display name, email, and password or signs in with email and password. Client-side email syntax checks provide fast feedback; Supabase Auth remains responsible for account creation and password handling. Email confirmation is disabled in project Auth settings. Since confirmation is disabled by request, syntax validation does not prove mailbox ownership or deliverability. The user's email remains private.

### Civic reports

The map and report detail view load visible tickets from Supabase, with public status timeline and team name. Signed-in residents submit a report; the app uploads its media under an owner-scoped path and stores ticket/media records. The display name is included in the public report projection, but the email is never selected or returned. City-admin actions assign teams, advance valid statuses, and require resolution notes. Subscribers see updated status events from Supabase Realtime.

### Community forum

The forum loads visible posts, comments, and topics by region. Posts can optionally reference a city report. A signed-in resident can create a post, reply, or flag a post/comment. Topic choices include city maintenance and broader social/economic policy discussion (utilities and electricity prices, housing, cost of living, public services, transportation, safety, and other local government priorities). Moderator actions are permission-checked in the database and reflected in public queries/realtime updates.

## Error handling and demo behavior

Show a clear connection/setup state when Supabase URL/key are missing. In that mode, allow users to inspect sample data but do not suggest that a submitted ticket, discussion, comment, or status change was saved remotely. For configured Supabase errors, keep the user's draft where practical, show an actionable message, and refresh authoritative rows after successful writes.

## Security boundaries

- RLS is enabled on all public-schema tables exposed to the Data API.
- Residents may only write as their authenticated user. They cannot assign themselves staff roles, change their ticket status, or forge another user's author identity.
- Public policies/views return display names but never email addresses or hidden report/forum content.
- Admin and moderator permissions come from protected profile role data; signup metadata is not trusted for authorization.
- Storage reads follow report visibility; private report media stays inaccessible to public users unless linked to a visible report under the chosen disclosure policy.
- No service-role/secret key is shipped to the browser.

## Verification goals

- Build the app successfully with Supabase configured and with the demo/unconfigured configuration.
- Confirm signup and sign-in accept name/email/password without prompting for an email OTP or confirmation link.
- Confirm a submitted ticket and its media persist and appear on another session's public map without exposing the account email.
- Confirm a city-admin transition creates a public event and that resolving without a note is rejected.
- Confirm a normal resident cannot assign a team, change status, or modify roles.
- Confirm forum post/comment writes persist, broad topic categories are available, flags enter the moderation queue, and unauthorized users cannot hide/restore content.
- Confirm relevant updates propagate by Realtime, while initial fetch remains usable if Realtime is unavailable.
- Run Supabase security/performance advisors after schema changes and review any findings.

## Scope boundaries

This change connects the already-built app to Supabase and expands forum coverage. It does not create a live write-back integration to city systems, add OTP/email verification, expose email addresses publicly, or replace Boston 311's separate delivery state. Seeding or granting demo city-admin/moderator roles must use a protected administrative method, not a public signup form.
