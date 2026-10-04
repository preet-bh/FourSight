import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const serviceMappingEnvironment: Record<string, { code: string; name: string }> = {
  'Street & sidewalk': { code: 'BOS_311_SERVICE_CODE_STREET_SIDEWALK', name: 'BOS_311_SERVICE_NAME_STREET_SIDEWALK' },
  'Trash & sanitation': { code: 'BOS_311_SERVICE_CODE_TRASH_SANITATION', name: 'BOS_311_SERVICE_NAME_TRASH_SANITATION' },
  Lighting: { code: 'BOS_311_SERVICE_CODE_LIGHTING', name: 'BOS_311_SERVICE_NAME_LIGHTING' },
  Parks: { code: 'BOS_311_SERVICE_CODE_PARKS', name: 'BOS_311_SERVICE_NAME_PARKS' },
  'Water & drainage': { code: 'BOS_311_SERVICE_CODE_WATER_DRAINAGE', name: 'BOS_311_SERVICE_NAME_WATER_DRAINAGE' },
  'Public safety': { code: 'BOS_311_SERVICE_CODE_PUBLIC_SAFETY', name: 'BOS_311_SERVICE_NAME_PUBLIC_SAFETY' },
  Other: { code: 'BOS_311_SERVICE_CODE_OTHER', name: 'BOS_311_SERVICE_NAME_OTHER' },
};

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return reply({ error: 'Boston 311 delivery is not configured.' }, 503);
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return reply({ error: 'Sign-in required.' }, 401);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return reply({ error: 'Sign-in required.' }, 401);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('reportId' in body) || typeof body.reportId !== 'string' || !body.reportId.trim()) {
    return reply({ error: 'A saved report id is required.' }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: report, error: reportError } = await adminClient
    .from('reports')
    .select('id,owner_id,region,description,latitude,longitude,category')
    .eq('id', body.reportId)
    .maybeSingle();
  if (reportError) return reply({ error: 'Could not verify the saved report.' }, 500);
  if (!report) return reply({ error: 'Saved report not found.' }, 404);
  if (report.owner_id !== user.id) {
    const { data: role, error: roleError } = await userClient.rpc('current_app_role');
    if (roleError) return reply({ error: 'Could not verify permission to forward this report.' }, 500);
    if (role !== 'city_admin') return reply({ error: 'Saved report not found.' }, 404);
  }

  const { data: previous, error: previousError } = await adminClient
    .from('report_delivery')
    .select('state,external_reference')
    .eq('report_id', report.id)
    .maybeSingle();
  if (previousError) return reply({ error: 'Could not verify the report delivery state.' }, 500);
  if (previous?.state === 'submitted') {
    if (!previous.external_reference) return reply({ delivery: 'failed', message: 'A prior submission has no saved city reference; manual review is required.' });
    return reply({ delivery: 'submitted', reference: previous.external_reference, message: 'Already submitted; duplicate prevented.' });
  }
  if (previous?.state === 'pending' || previous?.state === 'failed') {
    return reply({ delivery: 'failed', message: 'A prior delivery attempt is pending or ambiguous; check Boston 311 before retrying.' });
  }
  const claim = await claimDelivery(adminClient, report.id, previous?.state ?? null);
  if (claim.error) return reply({ error: 'Could not safely claim the city delivery attempt.' }, 500);
  if (!claim.claimed) return reply({ delivery: 'failed', message: 'Another delivery attempt has already started; check its result before retrying.' });

  if (report.region.trim().toLowerCase() !== 'boston') {
    return saveSandbox(adminClient, report.id, 'Outside Boston 311 service area; no city request was sent.');
  }
  const boundarySource = Deno.env.get('BOS_311_BOUNDARY_GEOJSON');
  if (!boundarySource) return saveSandbox(adminClient, report.id, 'Boston 311 has no verified service boundary configured; no city request was sent.');
  let boundary: unknown;
  try {
    boundary = JSON.parse(boundarySource);
  } catch {
    return saveSandbox(adminClient, report.id, 'Boston 311 boundary configuration is invalid; no city request was sent.');
  }
  if (!Number.isFinite(report.latitude) || !Number.isFinite(report.longitude) || !insideBoundary(report.longitude, report.latitude, boundary)) {
    return saveSandbox(adminClient, report.id, 'Report location is outside the verified Boston boundary; no city request was sent.');
  }

  const mappingEnvironment = serviceMappingEnvironment[report.category];
  const serviceCode = mappingEnvironment ? Deno.env.get(mappingEnvironment.code)?.trim() : undefined;
  const expectedServiceName = mappingEnvironment ? Deno.env.get(mappingEnvironment.name)?.trim() : undefined;
  const endpoint = Deno.env.get('BOS_311_ENDPOINT')?.trim();
  const apiKey = Deno.env.get('BOS_311_API_KEY')?.trim();
  if (!serviceCode || !expectedServiceName || !endpoint || !apiKey) {
    return saveSandbox(adminClient, report.id, 'Boston 311 credentials or a verified category mapping are not configured; no city request was sent.');
  }

  const baseUrl = endpoint.replace(/\/+$/, '');
  let catalogUrl: string;
  let requestUrl: string;
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== 'https:') throw new Error('HTTPS is required.');
    catalogUrl = `${baseUrl}/services.json`;
    requestUrl = `${baseUrl}/requests.json`;
  } catch {
    return saveSandbox(adminClient, report.id, 'Boston 311 endpoint is invalid; no city request was sent.');
  }

  let catalogResponse: Response;
  let catalog: unknown;
  try {
    catalogResponse = await fetch(catalogUrl, { signal: AbortSignal.timeout(15000) });
    catalog = await catalogResponse.json();
  } catch {
    return saveSandbox(adminClient, report.id, 'Boston 311 service catalog could not be verified; no city request was sent.');
  }
  if (!catalogResponse.ok || !Array.isArray(catalog)) {
    return saveSandbox(adminClient, report.id, 'Boston 311 service catalog could not be verified; no city request was sent.');
  }
  const codeMatches = catalog.filter(item =>
    item && typeof item === 'object' &&
    'service_code' in item && item.service_code === serviceCode
  );
  const catalogName = codeMatches.length === 1 && 'service_name' in codeMatches[0] && typeof codeMatches[0].service_name === 'string'
    ? codeMatches[0].service_name.trim()
    : '';
  if (codeMatches.length !== 1 || catalogName !== expectedServiceName) {
    return saveSandbox(adminClient, report.id, 'The configured category code and service name do not uniquely match the Boston 311 catalog; no city request was sent.');
  }

  const { data: selectedFrame, error: mediaError } = await adminClient
    .from('report_media')
    .select('storage_path,selected_frame_seconds')
    .eq('report_id', report.id)
    .eq('kind', 'image')
    .not('selected_frame_seconds', 'is', null)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (mediaError) return saveFailure(adminClient, report.id, 'Could not verify the selected evidence frame; no city request was sent.');

  let mediaUrl: string | undefined;
  if (selectedFrame) {
    const { data, error } = await adminClient.storage.from('report-media').createSignedUrl(selectedFrame.storage_path, 60 * 60);
    if (error || !data?.signedUrl) return saveFailure(adminClient, report.id, 'Could not create a city-accessible link for the selected evidence frame; no city request was sent.');
    mediaUrl = data.signedUrl;
  }

  const description = report.description.trim();
  if (!description) return saveFailure(adminClient, report.id, 'The saved report has no summary description; no city request was sent.');
  const form = new URLSearchParams({
    service_code: serviceCode,
    lat: String(report.latitude),
    long: String(report.longitude),
    description: `[FourSight ${report.id}] ${description}`,
    api_key: apiKey,
  });
  if (mediaUrl) form.set('media_url', mediaUrl);

  let response: Response;
  let result: unknown;
  try {
    response = await fetch(requestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(20000),
    });
    result = await response.json();
  } catch {
    return saveFailure(adminClient, report.id, 'Boston 311 response was unavailable or ambiguous. Check the city service before retrying.');
  }
  if (!response.ok || !Array.isArray(result) || result.length !== 1) {
    return saveFailure(adminClient, report.id, `Boston 311 returned an unsuccessful or ambiguous response (HTTP ${response.status}). Check before retrying.`);
  }
  const responseItem = result[0];
  const rawReference = responseItem && typeof responseItem === 'object' && 'service_request_id' in responseItem
    ? responseItem.service_request_id
    : undefined;
  const reference = typeof rawReference === 'string' || (typeof rawReference === 'number' && Number.isFinite(rawReference))
    ? String(rawReference).trim()
    : '';
  if (!reference) {
    return saveFailure(adminClient, report.id, 'Boston 311 returned no unambiguous city reference. Check before retrying.');
  }

  const submittedResult = await transitionDelivery(adminClient, report.id, 'submitted', 'Accepted by Boston 311.', reference);
  if (submittedResult.error || !submittedResult.updated) {
    return reply({ delivery: 'failed', reference, message: 'Boston 311 accepted this request, but FourSight could not save its reference. Do not retry; contact support.' });
  }
  return reply({ delivery: 'submitted', reference, message: 'Accepted by Boston 311.' });
});

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
}

async function claimDelivery(
  client: ReturnType<typeof createClient>,
  reportId: string,
  previousState: string | null,
): Promise<{ claimed: boolean; error: unknown }> {
  const values = {
    report_id: reportId,
    state: 'pending',
    external_reference: null,
    message: 'Submitting to Boston 311.',
    updated_at: new Date().toISOString(),
  };
  if (previousState === 'sandbox') {
    const { data, error } = await client
      .from('report_delivery')
      .update(values)
      .eq('report_id', reportId)
      .eq('state', 'sandbox')
      .select('report_id')
      .maybeSingle();
    return { claimed: Boolean(data), error };
  }
  if (previousState !== null) return { claimed: false, error: null };
  const { data, error } = await client.from('report_delivery').insert(values).select('report_id').maybeSingle();
  if (error && error.code === '23505') return { claimed: false, error: null };
  return { claimed: Boolean(data), error };
}

async function transitionDelivery(
  client: ReturnType<typeof createClient>,
  reportId: string,
  state: 'submitted' | 'sandbox' | 'failed',
  message: string,
  reference: string | null = null,
) {
  const { data, error } = await client
    .from('report_delivery')
    .update({ state, external_reference: reference, message, updated_at: new Date().toISOString() })
    .eq('report_id', reportId)
    .eq('state', 'pending')
    .select('report_id')
    .maybeSingle();
  return { updated: Boolean(data), error };
}

async function saveSandbox(client: ReturnType<typeof createClient>, reportId: string, message: string) {
  const result = await transitionDelivery(client, reportId, 'sandbox', message);
  if (result.error || !result.updated) return reply({ error: 'Could not save the sandbox delivery result.' }, 500);
  return reply({ delivery: 'sandbox', message });
}

async function saveFailure(client: ReturnType<typeof createClient>, reportId: string, message: string) {
  const result = await transitionDelivery(client, reportId, 'failed', message);
  if (result.error || !result.updated) return reply({ error: 'Delivery failed and FourSight could not save its delivery state. Do not retry until reviewed.' }, 500);
  return reply({ delivery: 'failed', message });
}

function insideBoundary(longitude: number, latitude: number, source: unknown): boolean {
  if (!source || typeof source !== 'object') return false;
  const value = source as { type?: unknown; coordinates?: unknown; geometry?: unknown };
  const geometry = value.type === 'Feature' ? value.geometry : source;
  if (!geometry || typeof geometry !== 'object') return false;
  const candidate = geometry as { type?: unknown; coordinates?: unknown };
  if (candidate.type === 'Polygon') return inPolygon(longitude, latitude, candidate.coordinates);
  if (candidate.type === 'MultiPolygon' && Array.isArray(candidate.coordinates)) {
    return candidate.coordinates.some(polygon => inPolygon(longitude, latitude, polygon));
  }
  return false;
}

function inPolygon(longitude: number, latitude: number, coordinates: unknown): boolean {
  if (!Array.isArray(coordinates) || !Array.isArray(coordinates[0])) return false;
  const inRing = (ring: unknown): boolean => {
    if (!Array.isArray(ring) || ring.length < 4) return false;
    const points = ring.filter((point): point is number[] =>
      Array.isArray(point) && point.length >= 2 &&
      typeof point[0] === 'number' && Number.isFinite(point[0]) &&
      typeof point[1] === 'number' && Number.isFinite(point[1])
    );
    if (points.length !== ring.length) return false;
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i];
      const b = points[j];
      const crosses = (a[1] > latitude) !== (b[1] > latitude) &&
        longitude < ((b[0] - a[0]) * (latitude - a[1])) / ((b[1] - a[1]) || Number.EPSILON) + a[0];
      if (crosses) inside = !inside;
    }
    return inside;
  };
  const rings = coordinates as unknown[];
  return inRing(rings[0]) && !rings.slice(1).some(inRing);
}
