import { describe, expect, it } from 'vitest';
import { MAX_MEDIA_SIZE_BYTES, MAX_VIDEO_DURATION_SECONDS, validateEvidenceFile, validateVideoDuration } from './media-validation';

describe('media evidence validation', () => {
  it('accepts supported photos and videos within the media size limit', () => {
    expect(validateEvidenceFile({ type: 'image/jpeg', size: 1 })).toBe('image');
    expect(validateEvidenceFile({ type: 'video/mp4', size: 1 })).toBe('video');
  });

  it('rejects empty, oversized, and unsupported files with useful messages', () => {
    expect(() => validateEvidenceFile({ type: 'image/png', size: 0 })).toThrow(/empty/i);
    expect(() => validateEvidenceFile({ type: 'video/mp4', size: MAX_MEDIA_SIZE_BYTES + 1 })).toThrow(/50 MB/i);
    expect(() => validateEvidenceFile({ type: 'application/pdf', size: 1 })).toThrow(/JPG, PNG, or WebP/i);
  });

  it('accepts videos through 30 seconds and rejects longer or unknown durations', () => {
    expect(() => validateVideoDuration(MAX_VIDEO_DURATION_SECONDS)).not.toThrow();
    expect(() => validateVideoDuration(MAX_VIDEO_DURATION_SECONDS + 0.01)).toThrow(/30 seconds or shorter/i);
    expect(() => validateVideoDuration(Number.NaN)).toThrow(/determine the video duration/i);
  });
});
