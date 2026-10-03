# Jack — media, transcripts, and Boston 311

**Branch:** `Jack`  
**Goal:** Make resident photo/video evidence reviewable and prepare safe, honest city-service forwarding.

## Own

- Video duration validation, audio extraction, transcript generation/edit/confirmation, and representative-frame evidence.
- Typed-description fallback when a video has no speech or transcription is unavailable.
- Category mapping to the verified Boston 311 service catalog.
- Server-side OpenAI transcription and BOS:311 Edge Functions in `supabase/functions/`; keep secrets out of browser code.
- A distinct delivery result (`submitted`, `sandbox`, or `failed`) with any city reference, separate from FourSight ticket status.
- New UI in `src/features/media/` and platform helpers `src/platform/backend.ts` / `src/platform/video-audio.ts`. Avoid editing `src/ui/App.tsx` and global styles; hand Yasir a component/API contract.

## Acceptance checks

- Accept photos and videos up to 30 seconds; reject longer clips with a useful message.
- For videos, show an editable transcript and require resident confirmation before treating it as confirmed. Keep typed-description fallback available.
- Keep full video in the app and identify a selected evidence frame for the 311 payload when supported.
- Save a FourSight ticket before delivery; Boston-only reports can be forwarded, other regions remain app-only/sandbox.
- Missing credentials, unverified category codes, missing boundary data, API errors, and ambiguous responses never appear as successful submissions.

## Coordinate first

Use the shared contract in `src/domain/types.ts`. Do not edit Ayman's admin migration or Yasir's auth/forum migration; add any needed media/delivery schema as a new migration and agree with Yasir first.
