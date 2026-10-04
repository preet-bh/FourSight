// Retired after FourSight moved to a Dearborn-only community board.
// Keep this endpoint inert so older deployed clients cannot submit Boston 311 requests.
const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

Deno.serve((request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors });
  }
  return new Response(JSON.stringify({
    delivery: 'sandbox',
    message: 'FourSight now serves Dearborn. No city request was sent.',
  }), { headers: cors });
});
