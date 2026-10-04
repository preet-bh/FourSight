import { validateEvidenceFile, validateVideoDuration } from '../features/media/media-validation';

export async function extractAudioForTranscript(file: File): Promise<Blob> {
  if (validateEvidenceFile(file) !== 'video') throw new Error('Choose a video before generating a transcript.');
  const video = document.createElement('video') as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
  const source = URL.createObjectURL(file);
  let stream: MediaStream | undefined;
  video.src = source;
  video.muted = false;
  video.playsInline = true;
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Could not read this video. Try another file.')), 10000);
      video.onloadedmetadata = () => { window.clearTimeout(timeout); resolve(); };
      video.onerror = () => { window.clearTimeout(timeout); reject(new Error('Could not read this video.')); };
    });
    validateVideoDuration(video.duration);
    const capture = video.captureStream ?? video.mozCaptureStream;
    if (!capture || typeof MediaRecorder === 'undefined') throw new Error('This browser cannot extract video audio. Add a typed description instead.');
    stream = capture.call(video);
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) throw new Error('This video has no audio track. Add a typed description instead.');
    const audio = new MediaStream(audioTracks);
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error('This browser cannot create a transcript from video audio. Add a typed description instead.');
    const recorder = new MediaRecorder(audio, { mimeType });
    const chunks: BlobPart[] = [];
    const recorded = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => reject(new Error('Could not capture this video’s audio.'));
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
    });
    const ended = new Promise<void>((resolve, reject) => {
      video.onended = () => resolve();
      video.onerror = () => reject(new Error('Could not read this video.'));
    });
    recorder.start();
    try {
      await video.play();
      await ended;
    } catch (error) {
      if (recorder.state !== 'inactive') recorder.stop();
      await recorded.catch(() => undefined);
      if (error instanceof Error && error.message === 'Could not read this video.') throw error;
      throw new Error('Allow video playback to create a transcript, or add a typed description.');
    }
    recorder.stop();
    const blob = await recorded;
    if (!blob.size) throw new Error('No audio was captured. Add a typed description instead.');
    return blob;
  } finally {
    video.pause();
    stream?.getTracks().forEach(track => track.stop());
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(source);
  }
}
