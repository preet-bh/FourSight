# FourSight.AI

See it. Report it. Track it. FourSight is a mobile-friendly civic reporting demo with a regional issue map, ticket work queue, public status timeline, and neighborhood forum.

## Run the hackathon demo

Requires Node.js 20 or newer.

```sh
npm install
npm run dev
```

Open the URL printed by Vite. Use **Switch to admin** in the sidebar to review tickets, assign a seeded team, advance a ticket, resolve it with a public note, or hide/restore it with an audit reason. Switch back to resident mode to submit reports, view map details, and post in the forum. The Boston and Dearborn regions have seeded sample tickets. Reports and discussions persist in this browser using localStorage; uploaded media is retained in IndexedDB.

Run checks with `npm test` and `npm run build`.

## Current integration boundary

The runnable app is a self-contained local demo. It does not currently sync ticket/forum data to Supabase, provide production sign-in, or submit reports to Boston 311. It marks every new ticket's city delivery as **sandbox** so the UI never implies that city staff received it. The Supabase migration and Edge Functions are backend foundations for the next integration pass; they are not wired into the current local-first UI. `src/features/media/MediaEvidenceEditor.tsx` is the reusable media contract for that integration. Its `MediaEvidenceDraft` emits the original photo/video, an optional frame image and timestamp (persist the latter as `ReportMedia.selectedFrameSeconds`), a typed description, and both the editable transcript and a `confirmedTranscript` that is non-empty only after resident confirmation. Keep the full video attached, persist the selected frame separately, save the FourSight report first, and only then pass its persisted Supabase UUID to `forwardSavedReportToBoston`.

The old single-file prototype remains at [`foursight.html`](./foursight.html) for reference. The new app is under `src/`.

## Supabase setup foundations

1. Create a Supabase project and apply `supabase/migrations/202610030001_initial.sql` followed by `supabase/migrations/202610030002_admin_workflow.sql`.
2. Create a private Storage bucket named `report-media` and add Storage policies matching the migration's report ownership and city-admin rules before storing live uploads. Keep sensitive media private and use short-lived signed URLs.
3. Configure the Edge Function secrets below with `supabase secrets set`; do not put them in a `VITE_` variable or commit them.
4. Deploy with `supabase functions deploy transcribe-video` and `supabase functions deploy forward-to-boston`.
5. Add only the Supabase project URL and publishable key to local `.env` or Vercel environment variables. A trusted operator should promote the verified admin profile by UUID; never assign roles from editable user metadata.
6. Request BOS:311 API access. Configure `BOS_311_ENDPOINT`, `BOS_311_API_KEY`, and one category mapping after matching its exact code to Boston's live catalog. The function checks the configured code against `{BOS_311_ENDPOINT}/services.json` before sending anything. Without credentials, a verified boundary, or a uniquely matching catalog entry, delivery remains `sandbox`. Only reports whose region is exactly Boston and whose coordinates are inside the configured boundary are eligible; FourSight ticket status remains independent.

The admin queue and ticket controls are exported from [`src/features/admin/`](./src/features/admin/README.md). They are integration components and are not wired into the local demo app shell.

Server-only secrets for Supabase Edge Functions:

- `OPENAI_API_KEY`
- `APP_ORIGIN` (the deployed app origin, for example `https://foursight.example`)
- `BOS_311_ENDPOINT` (approved Open311 endpoint)
- `BOS_311_BOUNDARY_GEOJSON` (verified City of Boston Polygon/MultiPolygon GeoJSON; outside-boundary locations stay sandboxed)
- `BOS_311_API_KEY`
- `BOS_311_SERVICE_CODE_STREET_SIDEWALK`, `BOS_311_SERVICE_CODE_TRASH_SANITATION`, `BOS_311_SERVICE_CODE_LIGHTING`, `BOS_311_SERVICE_CODE_PARKS`, `BOS_311_SERVICE_CODE_WATER_DRAINAGE`, `BOS_311_SERVICE_CODE_PUBLIC_SAFETY`, and `BOS_311_SERVICE_CODE_OTHER`. Set only mappings verified against the approved BOS:311 catalog.

`forward-to-boston` expects a persisted Supabase report UUID and an authenticated owner. It verifies each configured service code against the live catalog, uses a selected evidence frame for `media_url` when one is attached, preserves delivery as separate from app status, and will not automatically retry pending or ambiguous requests. The current browser demo uses local IDs, so it cannot call this integration yet.

## Team split

See [`TEAM_WORKPLAN.md`](./TEAM_WORKPLAN.md) for the four-owner branch split and [`team-tasks/`](./team-tasks/) for each person's handoff. Shared ticket/media/status types live in `src/domain/types.ts`. Feature branches should target `Yasir`; avoid editing another owner's paths and coordinate changes to shared contracts before implementation.

## Hosting

The repo builds as a static Vite app for Vercel. `vercel.json` rewrites app routes to `index.html`. OpenStreetMap standard tiles are loaded normally with visible attribution; do not prefetch or bulk download tiles. Geolocation is optional and falls back to the selected region.
