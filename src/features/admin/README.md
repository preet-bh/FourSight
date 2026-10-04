# Admin feature integration

This feature owns the city operations queue, admin ticket controls, public status timeline, and Supabase admin RPC calls. `src/ui/App.tsx` and `src/ui/styles.css` remain owned by the app integration work; these components reuse the existing app class names.

## Components

- `AdminQueue` receives `{ reports: Report[], teams: Team[], onSelect: (report: Report) => void }`. Pass the complete admin query result, including hidden reports; it includes the hidden state in each row.
- `AdminTicketControls` receives a `Report`, the available `Team[]`, and callbacks `onAssignTeam(teamId)`, `onTransition(status, publicNote, completionPhoto)`, and `onSetVisibility(hidden, reason)`. Callbacks may return promises; reject/throw on persistence failures so the component can display the error. Update or refetch the parent report before resolving a callback so the component receives the latest props. The component requires a non-empty public note to resolve and an auditable reason to hide or restore.
- `PublicTicketTimeline` renders `Report.timeline`. After a successful status operation, update or refetch the report so the public detail view reflects the new event immediately.

The caller must gate both components and every admin data query on the authenticated `profiles.role === 'city_admin'` value returned by the database. Load `teams` from `maintenance_teams`; its database UUIDs must be used as `Team.id` values for assignment (the seeded local-demo IDs are not database IDs). Never trust client-editable auth metadata or a client-side demo role toggle as authorization.

## Persistence

`assignAdminTeam`, `transitionAdminTicket`, `resolveAdminTicket`, and `setAdminTicketVisibility` call the admin-only RPCs introduced by migration `202610030002_admin_workflow.sql`. Provide the database report UUID as `reportId`; public ticket labels such as `FS-2048` are not database IDs. For resolution, call `resolveAdminTicket(reportId, publicNote, completionPhoto)` from `onTransition`; it performs the status/timeline update and optional photo attachment atomically, and returns a signed-URL `ReportMedia` for the local model. Update the UI model or refetch the report after the RPC succeeds; use the returned media when performing an optimistic local update. `transitionAdminTicket` also uses the resolver when no photo is needed. When reading persisted report media, select its `storage_path` and create a short-lived signed URL; the migration grants path metadata only where the associated report is visible and relies on Storage RLS to protect the underlying object.

The migration appends assignment, status, hide/restore, and completion-media actions to `admin_ticket_audit`; rows include the authenticated actor, timestamp, and reason/details. Only city admins can read this audit table. Keep audit reads behind the same role gate as the queue.

The feature has no implicit local-data fallback: missing Supabase configuration and RPC/storage failures are surfaced to the UI. For the local demo, use `applyAdminStatusLocally` and the existing domain workflow operations in the owning integration layer.
