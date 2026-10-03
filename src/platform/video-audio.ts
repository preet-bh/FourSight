export async function extractAudioForTranscript(file: File): Promise<Blob> {
  const video = document.createElement('video') as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
  const source = URL.createObjectURL(file);
  video.src = source;
  video.muted = false;
  video.playsInline = true;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Could not read this video.'));
    });
    if (!video.duration || video.duration > 30.05) throw new Error('Video must be 30 seconds or shorter.');
    const capture = video.captureStream ?? video.mozCaptureStream;
    if (!capture || typeof MediaRecorder === 'undefined') throw new Error('This browser cannot extract video audio. Add a typed description instead.');
    const stream = capture.call(video);
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) throw new Error('This video has no audio track. Add a typed description instead.');
    const audio = new MediaStream(audioTracks);
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
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
    try { await video.play(); }
    catch { recorder.stop(); throw new Error('Allow video playback to create a transcript, or add a typed description.'); }
    try { await ended; } catch (error) { recorder.stop(); throw error; }
    recorder.stop();
    const blob = await recorded;
    if (!blob.size) throw new Error('No audio was captured. Add a typed description instead.');
    return blob;
  } finally {
    video.pause();
    video.src = '';
    URL.revokeObjectURL(source);
  }
}
