import { describe, expect, it } from 'vitest';
import type { MediaEvidenceDraft } from '../features/media/MediaEvidenceEditor';
import { toReportEvidence } from './report-evidence';

describe('toReportEvidence', () => {
  it('keeps the full video, selected frame timestamp, and only the confirmed transcript', () => {
    const video = new File(['video'], 'street.webm', { type: 'video/webm' });
    const frame = new File(['frame'], 'evidence.jpg', { type: 'image/jpeg' });
    const draft: MediaEvidenceDraft = {
      mediaFile: video,
      mediaKind: 'video',
      selectedFrameFile: frame,
      selectedFrameSeconds: 4.25,
      description: 'A broken traffic light at the corner.',
      transcriptDraft: 'The traffic light is broken at the corner.',
      transcriptConfirmed: true,
      confirmedTranscript: 'The traffic light is broken at the corner.',
    };

    expect(toReportEvidence(draft)).toEqual({
      description: 'A broken traffic light at the corner.',
      transcript: 'The traffic light is broken at the corner.',
      media: [
        { file: frame, kind: 'image', label: 'Selected video evidence frame', selectedFrameSeconds: 4.25 },
        { file: video, kind: 'video', label: 'street.webm' },
      ],
    });
  });

  it('uses typed description fallback without saving an unconfirmed transcript', () => {
    const video = new File(['video'], 'street.webm', { type: 'video/webm' });
    const result = toReportEvidence({
      mediaFile: video,
      mediaKind: 'video',
      selectedFrameFile: null,
      selectedFrameSeconds: null,
      description: 'The crossing signal is out.',
      transcriptDraft: 'Maybe the signal is broken.',
      transcriptConfirmed: false,
      confirmedTranscript: '',
    });

    expect(result).toEqual({
      description: 'The crossing signal is out.',
      transcript: '',
      media: [{ file: video, kind: 'video', label: 'street.webm' }],
    });
  });

  it('rejects a missing attachment or description', () => {
    const empty: MediaEvidenceDraft = {
      mediaFile: null,
      mediaKind: null,
      selectedFrameFile: null,
      selectedFrameSeconds: null,
      description: '',
      transcriptDraft: '',
      transcriptConfirmed: false,
      confirmedTranscript: '',
    };
    expect(toReportEvidence(empty)).toBeNull();
  });
});
