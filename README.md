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

The runnable app is a self-contained local demo. It does not currently sync ticket/forum data to Supabase, provide production sign-in, or submit reports to Boston 311. It marks every new ticket's city delivery as **sandbox** so the UI never implies that city staff received it. The Supabase migration and Edge Functions are backend foundations for the next integration pass; they are not wired into the current local-first UI. The transcription button is available only after a Supabase client is configured and the signed-in user session is available. If the service is not configured, residents can enter a typed description.

The old single-file prototype remains at [`foursight.html`](./foursight.html) for reference. The new app is under `src/`.

## Supabase setup foundations

1. Create a Supabase project and apply `supabase/migrations/202610030001_initial.sql` followed by `supabase/migrations/202610030002_admin_workflow.sql`.
2. Create a private Storage bucket named `report-media` and add Storage policies matching the migration's report ownership and city-admin rules before storing live uploads. Keep sensitive media private and use short-lived signed URLs.
3. Configure the Edge Function secrets below with `supabase secrets set`; do not put them in a `VITE_` variable or commit them.
4. Deploy with `supabase functions deploy transcribe-video` and `supabase functions deploy forward-to-boston`.
5. Add only the Supabase project URL and publishable key to local `.env` or Vercel environment variables. A trusted operator should promote the verified admin profile by UUID; never assign roles from editable user metadata.
6. Request BOS:311 API access. Configure `BOS_311_ENDPOINT`, `BOS_311_API_KEY`, and one `BOS_311_SERVICE_CODE_<CATEGORY>` value for each exact category code after matching it to Boston's live catalog. Without these values, the function returns `sandbox`. Only Boston-region reports are eligible; the city API receives an initial request, while ticket status remains FourSight-owned.

The admin queue and ticket controls are exported from [`src/features/admin/`](./src/features/admin/README.md). They are integration components and are not wired into the local demo app shell.

Server-only secrets for Supabase Edge Functions:

- `OPENAI_API_KEY`
- `APP_ORIGIN` (the deployed app origin, for example `https://foursight.example`)
- `BOS_311_ENDPOINT` (approved Open311 endpoint)
- `BOS_311_BOUNDARY_GEOJSON` (verified City of Boston Polygon/MultiPolygon GeoJSON; outside-boundary locations stay sandboxed)
- `BOS_311_API_KEY`
- `BOS_311_SERVICE_CODE_STREET_AND_SIDEWALK`, `BOS_311_SERVICE_CODE_TRASH_SANITATION`, etc. Use codes verified against the approved BOS:311 catalog.

`forward-to-boston` expects a persisted Supabase report UUID and an authenticated owner. It refuses other regions, preserves delivery as separate from app status, and does not retry an uncertain request automatically. The current browser demo uses local IDs, so it cannot call this integration yet.

## Team split

See [`TEAM_WORKPLAN.md`](./TEAM_WORKPLAN.md) for the four-owner branch split and [`team-tasks/`](./team-tasks/) for each person's handoff. Shared ticket/media/status types live in `src/domain/types.ts`. Feature branches should target `Yasir`; avoid editing another owner's paths and coordinate changes to shared contracts before implementation.

## Hosting

The repo builds as a static Vite app for Vercel. `vercel.json` rewrites app routes to `index.html`. OpenStreetMap standard tiles are loaded normally with visible attribution; do not prefetch or bulk download tiles. Geolocation is optional and falls back to the selected region.
