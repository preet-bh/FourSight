import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (request) => {
  if (request.method === 'OPTIONS') return json({ ok: true });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const openAiKey = Deno.env.get('OPENAI_API_KEY');
  if (!supabaseUrl || !anonKey || !openAiKey) return json({ error: 'Transcription is not configured.' }, 503);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign-in required.' }, 401);
  let authResponse: Response;
  try {
    authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, authorization },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return json({ error: 'Could not verify sign-in. Try again later.' }, 503);
  }
  if (!authResponse.ok) return json({ error: 'Sign-in required.' }, 401);

  let audio: Blob;
  try {
    audio = await request.blob();
  } catch {
    return json({ error: 'Could not read the extracted audio.' }, 400);
  }
  if (!audio.size) return json({ error: 'The extracted audio is empty. Add a typed description instead.' }, 400);
  if (audio.size > 25 * 1024 * 1024) return json({ error: 'Extracted audio must be 25 MB or smaller.' }, 413);

  const contentType = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const extensionByType: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
  };
  const extension = extensionByType[contentType];
  if (!extension) return json({ error: 'Send an extracted audio track in a supported format.' }, 415);

  const form = new FormData();
  form.append('file', audio, `report-audio.${extension}`);
  form.append('model', 'gpt-4o-mini-transcribe');
  form.append('response_format', 'json');

  let response: Response;
  let payload: unknown;
  try {
    response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${openAiKey}` },
      body: form,
      signal: AbortSignal.timeout(60000),
    });
    payload = await response.json();
  } catch {
    return json({ error: 'Transcription service did not return a readable response. Add a typed description instead.' }, 502);
  }

  if (!response.ok) {
    const apiError = payload && typeof payload === 'object' && 'error' in payload ? payload.error : undefined;
    const message = apiError && typeof apiError === 'object' && 'message' in apiError && typeof apiError.message === 'string'
      ? apiError.message
      : 'Transcription failed. Add a typed description instead.';
    return json({ error: message }, 502);
  }
  if (!payload || typeof payload !== 'object' || !('text' in payload) || typeof payload.text !== 'string') {
    return json({ error: 'Transcription service returned an invalid response. Add a typed description instead.' }, 502);
  }

  const transcript = payload.text.trim();
  if (!transcript) return json({ text: '', summary: '' });

  let summaryResponse: Response;
  let summaryPayload: unknown;
  try {
    summaryResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${openAiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 250,
        messages: [
          {
            role: 'system',
            content: 'Write a concise, factual civic-service report description from the resident video transcript. Include the issue and location only if explicitly stated. Do not invent details, causes, urgency, or locations. Return only the description, in at most two sentences and 1200 characters.',
          },
          { role: 'user', content: transcript },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
    summaryPayload = await summaryResponse.json();
  } catch {
    return json({ error: 'Could not create a report draft from the transcript. You can enter a description instead.' }, 502);
  }

  if (!summaryResponse.ok) {
    return json({ error: 'Could not create a report draft from the transcript. You can enter a description instead.' }, 502);
  }
  const choices = summaryPayload && typeof summaryPayload === 'object' && 'choices' in summaryPayload
    ? summaryPayload.choices
    : undefined;
  const firstChoice = Array.isArray(choices) ? choices[0] : undefined;
  const message = firstChoice && typeof firstChoice === 'object' && 'message' in firstChoice
    ? firstChoice.message
    : undefined;
  const summary = message && typeof message === 'object' && 'content' in message && typeof message.content === 'string'
    ? message.content.trim()
    : '';
  if (!summary || summary.length > 1200) {
    return json({ error: 'The report draft was empty or too long. You can enter a description instead.' }, 502);
  }
  return json({ text: transcript, summary });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}
