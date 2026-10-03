import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: 'Sign-in required' }, 401);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const openAiKey = Deno.env.get('OPENAI_API_KEY');
  if (!supabaseUrl || !anonKey || !openAiKey) return json({ error: 'Transcription is not configured.' }, 503);
  const authResult = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, authorization: auth } });
  if (!authResult.ok) return json({ error: 'Sign-in required' }, 401);
  const blob = await request.blob();
  if (!blob.size || blob.size > 25 * 1024 * 1024) return json({ error: 'Audio must be under 25 MB.' }, 413);
  const contentType = request.headers.get('content-type') ?? 'audio/webm';
  if (!contentType.startsWith('audio/')) return json({ error: 'Send an extracted audio track.' }, 415);
  const form = new FormData();
  form.append('file', blob, contentType.includes('mp4') ? 'report-audio.mp4' : 'report-audio.webm');
  form.append('model', 'gpt-4o-mini-transcribe');
  form.append('response_format', 'json');
  const result = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { authorization: `Bearer ${openAiKey}` }, body: form,
  });
  const payload = await result.json();
  if (!result.ok) return json({ error: payload?.error?.message ?? 'Transcription failed.' }, 502);
  return json({ text: typeof payload.text === 'string' ? payload.text : '' }, 200);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
}
