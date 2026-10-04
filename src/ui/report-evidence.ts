import type { MediaEvidenceDraft } from '../features/media/MediaEvidenceEditor';
import type { NewReportInput } from '../platform/contracts';

export type ReportEvidence = Pick<NewReportInput, 'description' | 'transcript' | 'media'>;

export function toReportEvidence(draft: MediaEvidenceDraft): ReportEvidence | null {
  if (!draft.mediaFile || !draft.mediaKind) return null;
  const description = draft.description.trim() || draft.confirmedTranscript.trim();
  if (!description) return null;

  const media: NewReportInput['media'] = [];
  if (draft.selectedFrameFile) {
    media.push({
      file: draft.selectedFrameFile,
      kind: 'image',
      label: 'Selected video evidence frame',
      ...(draft.selectedFrameSeconds == null ? {} : { selectedFrameSeconds: draft.selectedFrameSeconds }),
    });
  }
  media.push({ file: draft.mediaFile, kind: draft.mediaKind, label: draft.mediaFile.name });

  return {
    description,
    transcript: draft.confirmedTranscript.trim(),
    media,
  };
}
