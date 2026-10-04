import { useEffect, useRef, useState } from 'react';
import { requestTranscript } from '../../platform/backend';
import { readVideoDuration, validateEvidenceFile, type EvidenceFileKind } from './media-validation';

export type MediaEvidenceDraft = {
  mediaFile: File | null;
  mediaKind: EvidenceFileKind | null;
  selectedFrameFile: File | null;
  selectedFrameSeconds: number | null;
  description: string;
  transcriptDraft: string;
  transcriptConfirmed: boolean;
  confirmedTranscript: string;
};

type Props = {
  onChange: (draft: MediaEvidenceDraft) => void;
  disabled?: boolean;
};

const emptyDraft: MediaEvidenceDraft = {
  mediaFile: null,
  mediaKind: null,
  selectedFrameFile: null,
  selectedFrameSeconds: null,
  description: '',
  transcriptDraft: '',
  transcriptConfirmed: false,
  confirmedTranscript: '',
};

export default function MediaEvidenceEditor({ onChange, disabled = false }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<EvidenceFileKind | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [duration, setDuration] = useState(0);
  const [frameSeconds, setFrameSeconds] = useState(0);
  const [frameFile, setFrameFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [transcript, setTranscript] = useState('');
  const [transcriptConfirmed, setTranscriptConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    onChangeRef.current({
      mediaFile: file,
      mediaKind: kind,
      selectedFrameFile: frameFile,
      selectedFrameSeconds: frameFile ? frameSeconds : null,
      description,
      transcriptDraft: transcript,
      transcriptConfirmed: Boolean(transcript.trim()) && transcriptConfirmed,
      confirmedTranscript: transcript.trim() && transcriptConfirmed ? transcript.trim() : '',
    });
  }, [description, file, frameFile, frameSeconds, kind, transcript, transcriptConfirmed]);

  const chooseFile = async (next: File | null) => {
    if (!next) return;
    setMessage('');
    setBusy(true);
    try {
      const nextKind = validateEvidenceFile(next);
      const nextDuration = nextKind === 'video' ? await readVideoDuration(next) : 0;
      setFile(next);
      setKind(nextKind);
      setDuration(nextDuration);
      setFrameSeconds(0);
      setFrameFile(null);
      setTranscript('');
      setTranscriptConfirmed(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not use this media file.');
    } finally {
      setBusy(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setKind(null);
    setDuration(0);
    setFrameSeconds(0);
    setFrameFile(null);
    setTranscript('');
    setTranscriptConfirmed(false);
  };

  const captureFrame = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setMessage('Play or seek to a clear frame before selecting evidence.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setMessage('Could not prepare the selected evidence frame.');
      return;
    }
    context.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) {
      setMessage('Could not capture the selected evidence frame. Try another frame.');
      return;
    }
    const seconds = Math.round(video.currentTime * 100) / 100;
    setFrameSeconds(seconds);
    setFrameFile(new File([blob], `evidence-frame-${seconds.toFixed(2)}s.jpg`, { type: 'image/jpeg' }));
    setMessage(`Evidence frame selected at ${seconds.toFixed(2)} seconds.`);
  };

  const transcribe = async () => {
    if (!file || kind !== 'video') return;
    setBusy(true);
    setMessage('');
    try {
      const text = await requestTranscript(file);
      setTranscript(text);
      setTranscriptConfirmed(false);
      setMessage(text ? 'Transcript ready. Edit it if needed, then confirm it.' : 'No speech was detected. Add a typed description instead.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Transcription is unavailable. Add a typed description instead.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Photo, video, and transcript evidence">
      {!file ? (
        <label>
          Add a photo or video (up to 30 seconds)
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
            disabled={disabled || busy}
            onChange={event => { void chooseFile(event.target.files?.[0] ?? null); event.currentTarget.value = ''; }}
          />
        </label>
      ) : (
        <div>
          {kind === 'video'
            ? <video ref={videoRef} src={previewUrl} controls preload="metadata" onLoadedMetadata={event => setDuration(event.currentTarget.duration)} />
            : <img src={previewUrl} alt="Selected resident evidence" />}
          {kind === 'video' && (
            <div>
              <label>
                Choose a representative frame ({frameSeconds.toFixed(2)}s)
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, duration)}
                  step="0.1"
                  value={Math.min(frameSeconds, duration || 0)}
                  disabled={disabled || busy}
                  onChange={event => {
                    const seconds = Number(event.currentTarget.value);
                    setFrameSeconds(seconds);
                    if (videoRef.current) videoRef.current.currentTime = seconds;
                  }}
                />
              </label>
              <button type="button" disabled={disabled || busy} onClick={() => { void captureFrame(); }}>
                Select current frame
              </button>
              {frameFile && <p>Selected image frame at {frameSeconds.toFixed(2)} seconds will accompany the full video.</p>}
              <button type="button" disabled={disabled || busy} onClick={() => { void transcribe(); }}>
                {busy ? 'Transcribing…' : 'Generate transcript'}
              </button>
            </div>
          )}
          <button type="button" disabled={disabled || busy} onClick={clearFile}>Remove media</button>
        </div>
      )}
      {kind === 'video' && transcript && (
        <label>
          Edit transcript
          <textarea
            value={transcript}
            disabled={disabled || busy}
            onChange={event => { setTranscript(event.currentTarget.value); setTranscriptConfirmed(false); }}
          />
          <label>
            <input
              type="checkbox"
              checked={transcriptConfirmed}
              disabled={disabled || busy || !transcript.trim()}
              onChange={event => setTranscriptConfirmed(event.currentTarget.checked)}
            />
            I reviewed and confirm this transcript
          </label>
        </label>
      )}
      <label>
        Typed description (available even when transcription is unavailable)
        <textarea
          value={description}
          maxLength={1200}
          disabled={disabled}
          onChange={event => setDescription(event.currentTarget.value)}
        />
      </label>
      {message && <p role="status">{message}</p>}
      <p>Save the FourSight report before calling `forwardSavedReportToBoston` with its persisted id.</p>
      {file && <p>Attached {kind} stays in FourSight; the selected frame is separate evidence for city forwarding.</p>}
    </section>
  );
}

export { emptyDraft };
