# FourSight.AI

See it. Report it. Track it. FourSight is a mobile-friendly civic reporting demo with a regional issue map, ticket work queue, public status timeline, and neighborhood forum.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm run dev
```

Open the URL printed by Vite. With Supabase environment variables configured, the map and forum load shared data, users can create accounts and sign in, residents can submit public reports, and city admins can work the staff queue. Email-and-password signup confirmation remains enabled. Without Supabase configuration, FourSight runs in a clearly labeled local demo with seeded reports and a resident/admin role switch; local data is stored in this browser.

Run checks with `npm test` and `npm run build`.

## Supabase and city integrations

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local` for a connected app. Never put server secrets in `VITE_` variables. The resident map and forum remain readable without signing in; creating reports or participating in forum discussions requires an account. Public reports show the resident's chosen display name but never their email. Supabase Auth email confirmation remains enabled.

### Signup email capacity

The FourSight Supabase project's custom SMTP switch is currently off. Supabase's built-in email sender allows only two Auth emails per hour per project and limits delivery to project team addresses, so it cannot support public signup with email confirmation. Configure an SMTP provider under [Authentication → Emails → SMTP Settings](https://supabase.com/dashboard/project/ahtikaimxxihoecopfzr/auth/smtp) using a verified sender address and the provider's SMTP host, port, username, and password. Keep email confirmation enabled. Once SMTP is saved, review [Authentication → Rate Limits](https://supabase.com/dashboard/project/ahtikaimxxihoecopfzr/auth/rate-limits) and set the email quota to match the provider's allowed throughput. The default custom SMTP limit is 30 emails per hour. Store SMTP credentials only in Supabase settings, never in this repository or a `VITE_` variable. Confirm delivery to an address outside the Supabase project team before opening public signup.

### Google sign-in

The account panel offers **Continue with Google** for residents who do not want to wait for a FourSight confirmation email. The FourSight Google OAuth client is configured with `https://four-sight.vercel.app` as an authorized JavaScript origin and `https://ahtikaimxxihoecopfzr.supabase.co/auth/v1/callback` as its redirect URI. The client ID and secret are stored only in [Supabase Authentication → Sign In / Providers → Google](https://supabase.com/dashboard/project/ahtikaimxxihoecopfzr/auth/providers?provider=Google), not in source control or a `VITE_` variable. The Supabase Site URL is `https://four-sight.vercel.app/`; add local development origins to the [redirect allow list](https://supabase.com/dashboard/project/ahtikaimxxihoecopfzr/auth/url-configuration) when developing locally. OAuth accounts use Google's verified email and profile name; email-and-password confirmation stays enabled for the separate password flow. Google Auth Platform's audience is External and its publishing status remains **Testing**, so only addresses listed under its [test users](https://console.cloud.google.com/auth/audience?project=project-df15ac22-9039-4c9b-8a9) can sign in. To open Google sign-in to the public later, provide a public privacy policy and publish the OAuth app.

The old single-file prototype remains at [`foursight.html`](./foursight.html) for reference. The new app is under `src/`.

## Supabase setup foundations

1. Create a Supabase project and apply the migrations in `supabase/migrations/` in timestamp order. The FourSight project used for this implementation has these migrations applied and Auth email confirmation enabled.
2. Ensure the private `report-media` bucket and policies from the migrations are deployed before storing live uploads. Media previews use short-lived signed URLs.
3. Configure the Edge Function secrets below with `supabase secrets set`; do not put them in a `VITE_` variable or commit them.
4. Deploy with `supabase functions deploy transcribe-video` and `supabase functions deploy forward-to-boston`.
5. Add only the Supabase project URL and publishable key to local `.env` or Vercel environment variables. A trusted operator should promote the verified admin profile by UUID; never assign roles from editable user metadata.
6. Request BOS:311 API access. Configure `BOS_311_ENDPOINT`, `BOS_311_API_KEY`, and one category mapping after matching its exact code to Boston's live catalog. The function checks the configured code against `{BOS_311_ENDPOINT}/services.json` before sending anything. Without credentials, a verified boundary, or a uniquely matching catalog entry, delivery remains `sandbox`. Only reports whose region is exactly Boston and whose coordinates are inside the configured boundary are eligible; FourSight ticket status remains independent.

The admin queue and ticket controls are exported from [`src/features/admin/`](./src/features/admin/README.md) and wired into the Supabase app shell. A trusted operator must promote the intended demo account's protected profile to `city_admin`; signup metadata cannot grant staff permissions.

Server-only secrets for Supabase Edge Functions:

- `OPENAI_API_KEY`
- `APP_ORIGIN` (the deployed app origin, for example `https://foursight.example`)
- `BOS_311_ENDPOINT` (approved Open311 endpoint)
- `BOS_311_BOUNDARY_GEOJSON` (verified City of Boston Polygon/MultiPolygon GeoJSON; outside-boundary locations stay sandboxed)
- `BOS_311_API_KEY`
- `BOS_311_SERVICE_CODE_STREET_SIDEWALK`, `BOS_311_SERVICE_CODE_TRASH_SANITATION`, `BOS_311_SERVICE_CODE_LIGHTING`, `BOS_311_SERVICE_CODE_PARKS`, `BOS_311_SERVICE_CODE_WATER_DRAINAGE`, `BOS_311_SERVICE_CODE_PUBLIC_SAFETY`, and `BOS_311_SERVICE_CODE_OTHER`; each needs a paired `BOS_311_SERVICE_NAME_<CATEGORY>` value (for example, `BOS_311_SERVICE_NAME_STREET_SIDEWALK`). Set only exact code/name pairs verified against the approved BOS:311 catalog.

`forward-to-boston` expects a saved Supabase report UUID and authenticated owner. Boston submissions are attempted only after the FourSight ticket is saved; other regions are not sent to Boston. Delivery status is separate from the FourSight ticket status. The local demo never sends city requests.

## Team split

See [`TEAM_WORKPLAN.md`](./TEAM_WORKPLAN.md) for the four-owner branch split and [`team-tasks/`](./team-tasks/) for each person's handoff. Shared ticket/media/status types live in `src/domain/types.ts`. Feature branches should target `Yasir`; avoid editing another owner's paths and coordinate changes to shared contracts before implementation.

## Hosting

The repo builds as a static Vite app for Vercel. `vercel.json` rewrites app routes to `index.html`. OpenStreetMap standard tiles are loaded normally with visible attribution; do not prefetch or bulk download tiles. Geolocation is optional and falls back to the selected region.
