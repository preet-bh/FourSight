# Preet — resident-facing front end

**Branch:** `Preet`  
**Goal:** Make finding and reporting a local issue feel clear and fast on phones and desktop.

## Own

- Resident map and location behavior in `src/ui/MapView.tsx` and `src/features/resident/`.
- Report composer for photo or short video, typed description, category, editable issue location, and public-media disclosure.
- Media preview, representative-frame selection UI, anonymous public ticket detail, status filters, and status timeline presentation.
- Responsive/accessibility polish for resident surfaces. Keep resident CSS inside `src/features/resident/resident.css`.
- Do not edit `src/ui/App.tsx` or global styles. Export components and tell Yasir what props/events are required for app-shell integration.

## Acceptance checks

- Map centers on user location when granted and selected region when denied/unavailable; user can adjust the issue location.
- Pins display ticket state, filters work, and selecting a pin opens the matching public detail.
- Residents can submit a photo with a description or video up to 30 seconds; the UI explains public location/media before submission.
- Public details omit account email and reporter identity, show the assigned team and timeline, and hide sensitive tickets/media.
- All resident flows work at narrow phone widths and keyboard controls remain usable.

## Coordinate first

Build against `src/domain/types.ts`; sync with Jack on transcript/frame fields and Ayman on the public ticket detail shape before changing shared contracts.
