# Ayman — city-admin ticket operations

**Branch:** `Ayman`  
**Goal:** Give city staff a reliable queue to assign, update, resolve, or safely hide community tickets.

## Own

- Extract the operations queue and ticket admin controls into `src/features/admin/`.
- Team assignment, New → In progress → Resolved status flow, public timeline, required resolution note, and optional completion photo.
- Hide/restore controls with an auditable reason while leaving hidden reports in the staff queue.
- Admin-only status/assignment/hide database operations and RLS. Add a new migration; do not edit an already shared/applied migration.
- Keep changes out of `src/ui/App.tsx` and `src/ui/styles.css`; export feature components and integration requirements for Yasir.

## Acceptance checks

- Only a city admin can assign teams or change a ticket's status.
- Transitions follow New → In progress → Resolved; resolving requires a public note.
- Public timeline updates immediately; optional completion media is attached to the ticket.
- A hidden report disappears from public map/detail queries, remains available in the admin queue, and records who hid it and why.
- Residents cannot elevate their role via client-editable profile metadata.

## Coordinate first

Use the ticket/media types in `src/domain/types.ts`; agree on admin component props with Yasir and resident detail expectations with Preet before changing shared types.
