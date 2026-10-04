import { createClient } from '@supabase/supabase-js';
import { extractAudioForTranscript } from './video-audio';
import type { DeliveryState } from '../domain/types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const supabase = url && key ? createClient(url, key) : null;
export const backendEnabled = Boolean(supabase);

export type BostonDeliveryResult = {
  state: Exclude<DeliveryState, 'pending'>;
  reference?: string;
  message: string;
};

export async function requestTranscript(file: File): Promise<string> {
  if (!supabase) throw new Error('Transcription service is not configured. Add a typed description instead.');
  const audio = await extractAudioForTranscript(file);
  const { data, error } = await supabase.functions.invoke('transcribe-video', { body: audio, headers: { 'Content-Type': audio.type || 'audio/webm' } });
  if (error) throw new Error(`Transcription failed: ${error.message}`);
  if (typeof data?.text !== 'string') throw new Error('The transcription service returned no transcript. Add a typed description instead.');
  return data.text;
}

export async function forwardSavedReportToBoston(reportId: string): Promise<BostonDeliveryResult> {
  if (!reportId.trim()) throw new Error('Save the FourSight report before requesting city delivery.');
  if (!supabase) return { state: 'sandbox', message: 'Boston 311 delivery is not configured; no city request was sent.' };

  const { data, error } = await supabase.functions.invoke('forward-to-boston', { body: { reportId } });
  if (error) throw new Error(`Boston 311 delivery could not be checked: ${error.message}`);
  if (!data || typeof data !== 'object') throw new Error('Boston 311 returned an ambiguous delivery result.');

  const result = data as Record<string, unknown>;
  if (!['submitted', 'sandbox', 'failed'].includes(String(result.delivery))) {
    throw new Error('Boston 311 returned an ambiguous delivery result.');
  }
  if (typeof result.message !== 'string' || !result.message.trim()) {
    throw new Error('Boston 311 returned an ambiguous delivery result.');
  }
  if (result.delivery === 'submitted') {
    if (typeof result.reference !== 'string' || !result.reference.trim()) {
      throw new Error('Boston 311 reported success without a city reference.');
    }
    return { state: 'submitted', reference: result.reference, message: result.message };
  }
  if (result.delivery === 'sandbox') return { state: 'sandbox', message: result.message };
  if (result.delivery === 'failed') return { state: 'failed', message: result.message };
  throw new Error('Boston 311 returned an ambiguous delivery result.');
}
