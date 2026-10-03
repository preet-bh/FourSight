import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const cors = { 'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY'); const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const auth = request.headers.get('Authorization');
  if (!supabaseUrl || !anon || !service || !auth?.startsWith('Bearer ')) return reply({ error: 'Sign-in required' }, 401);
  const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return reply({ error: 'Sign-in required' }, 401);
  const { reportId } = await request.json().catch(() => ({}));
  if (typeof reportId !== 'string') return reply({ error: 'A report id is required.' }, 400);
  const adminClient = createClient(supabaseUrl, service);
  const { data: report } = await adminClient.from('reports').select('id,owner_id,region,description,confirmed_transcript,latitude,longitude,category').eq('id', reportId).maybeSingle();
  if (!report || (report.owner_id !== user.id && (await userClient.rpc('current_app_role')).data !== 'city_admin')) return reply({ error: 'Report not found.' }, 404);
  if (!report.region.toLowerCase().startsWith('boston')) return reply({ delivery: 'sandbox', message: 'Outside Boston 311 service area.' }, 200);
  const boundarySource = Deno.env.get('BOS_311_BOUNDARY_GEOJSON');
  if (!boundarySource) return saveSandbox(adminClient, reportId, 'Boston 311 is not configured with a verified service boundary; no city request was sent.');
  let boundary: unknown;
  try { boundary = JSON.parse(boundarySource); } catch { return saveSandbox(adminClient, reportId, 'Boston 311 boundary configuration is invalid; no city request was sent.'); }
  if (!insideBoundary(report.longitude, report.latitude, boundary)) return saveSandbox(adminClient, reportId, 'Report location is outside the verified Boston boundary; no city request was sent.');
  const { data: old } = await adminClient.from('report_delivery').select('state,external_reference').eq('report_id', reportId).maybeSingle();
  if (old?.state === 'submitted') return reply({ delivery: 'submitted', reference: old.external_reference, message: 'Already submitted; duplicate prevented.' }, 200);
  const serviceCode = Deno.env.get(`BOS_311_SERVICE_CODE_${report.category.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`);
  const endpoint = Deno.env.get('BOS_311_ENDPOINT');
  const apiKey = Deno.env.get('BOS_311_API_KEY');
  if (!serviceCode || !endpoint || !apiKey) {
    await adminClient.from('report_delivery').upsert({ report_id: reportId, state: 'sandbox', message: 'Boston 311 is not configured; no city request was sent.', updated_at: new Date().toISOString() });
    return reply({ delivery: 'sandbox', message: 'Boston 311 is not configured; no city request was sent.' }, 200);
  }
  const { data: evidence } = await adminClient.from('report_media').select('storage_path').eq('report_id', report.id).in('kind', ['image','completion']).order('created_at').limit(1).maybeSingle();
  const mediaUrl = evidence?.storage_path
    ? (await adminClient.storage.from('report-media').createSignedUrl(evidence.storage_path, 60 * 60 * 24 * 90)).data?.signedUrl
    : undefined;
  const form = new URLSearchParams({ service_code: serviceCode, lat: String(report.latitude), long: String(report.longitude), description: `[FourSight ${report.id}] ${report.confirmed_transcript || report.description}`, api_key: apiKey });
  if (mediaUrl) form.set('media_url', mediaUrl);
  await adminClient.from('report_delivery').upsert({ report_id: reportId, state: 'pending', message: 'Submitting to Boston 311.', updated_at: new Date().toISOString() });
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, '')}/requests.json`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    const body = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(body) || !body[0]?.service_request_id) throw new Error(`Boston 311 returned HTTP ${response.status}.`);
    const reference = String(body[0].service_request_id);
    await adminClient.from('report_delivery').upsert({ report_id: reportId, state: 'submitted', external_reference: reference, message: 'Accepted by Boston 311.', updated_at: new Date().toISOString() });
    return reply({ delivery: 'submitted', reference, message: 'Accepted by Boston 311.' }, 200);
  } catch (error) {
    await adminClient.from('report_delivery').upsert({ report_id: reportId, state: 'failed', message: error instanceof Error ? error.message : 'City API request failed.', updated_at: new Date().toISOString() });
    return reply({ delivery: 'failed', message: 'Boston 311 request failed. Check delivery before retrying to avoid a duplicate.' }, 502);
  }
});
function reply(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } }); }
async function saveSandbox(client: ReturnType<typeof createClient>, reportId: string, message: string) {
  await client.from('report_delivery').upsert({ report_id: reportId, state: 'sandbox', message, updated_at: new Date().toISOString() });
  return reply({ delivery: 'sandbox', message }, 200);
}
function insideBoundary(longitude: number, latitude: number, source: unknown): boolean {
  const input = source as { type?: string; coordinates?: unknown; geometry?: { type?: string; coordinates?: unknown } };
  const geometry = input?.type === 'Feature' ? input.geometry : input;
  if (geometry?.type === 'Polygon') return inPolygon(longitude, latitude, geometry.coordinates);
  if (geometry?.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) return geometry.coordinates.some(polygon => inPolygon(longitude, latitude, polygon));
  return false;
}
function inPolygon(longitude: number, latitude: number, coordinates: unknown): boolean {
  if (!Array.isArray(coordinates) || !Array.isArray(coordinates[0])) return false;
  const inRing = (ring: unknown): boolean => {
    if (!Array.isArray(ring)) return false;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i] as number[]; const b = ring[j] as number[];
      if (!Array.isArray(a) || !Array.isArray(b)) continue;
      const crosses = (a[1] > latitude) !== (b[1] > latitude) && longitude < ((b[0] - a[0]) * (latitude - a[1])) / ((b[1] - a[1]) || Number.EPSILON) + a[0];
      if (crosses) inside = !inside;
    }
    return inside;
  };
  const rings = coordinates as unknown[];
  return inRing(rings[0]) && !rings.slice(1).some(inRing);
}
