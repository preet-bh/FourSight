import { createClient } from '@supabase/supabase-js';
import { extractAudioForTranscript } from './video-audio';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const supabase = url && key ? createClient(url, key) : null;
export const backendEnabled = Boolean(supabase);

export async function requestTranscript(file: File): Promise<string> {
  if (!supabase) throw new Error('Transcription service is not configured. Add a typed description instead.');
  const audio = await extractAudioForTranscript(file);
  const { data, error } = await supabase.functions.invoke('transcribe-video', { body: audio, headers: { 'Content-Type': audio.type || 'audio/webm' } });
  if (error) throw new Error(`Transcription failed: ${error.message}`);
  if (typeof data?.text !== 'string') throw new Error('The transcription service returned no transcript. Add a typed description instead.');
  return data.text;
}
