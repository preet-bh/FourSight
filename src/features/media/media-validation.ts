import type { MediaKind } from '../../domain/types';

export const MAX_VIDEO_DURATION_SECONDS = 30;
export const MAX_MEDIA_SIZE_BYTES = 50 * 1024 * 1024;

const supportedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const supportedVideoTypes = new Set(['video/mp4', 'video/webm']);

export type EvidenceFileKind = Extract<MediaKind, 'image' | 'video'>;

export function validateEvidenceFile(file: Pick<File, 'type' | 'size'>): EvidenceFileKind {
  if (file.size <= 0) throw new Error('This file is empty. Choose another photo or video.');
  if (file.size > MAX_MEDIA_SIZE_BYTES) throw new Error('Photos and videos must be 50 MB or smaller.');
  if (supportedImageTypes.has(file.type)) return 'image';
  if (supportedVideoTypes.has(file.type)) return 'video';
  throw new Error('Choose a JPG, PNG, or WebP photo, or an MP4 or WebM video.');
}

export function validateVideoDuration(duration: number): void {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Could not determine the video duration. Choose another video.');
  if (duration > MAX_VIDEO_DURATION_SECONDS) throw new Error('Videos must be 30 seconds or shorter. Trim this clip and try again.');
}

export async function readVideoDuration(file: File): Promise<number> {
  const video = document.createElement('video');
  const source = URL.createObjectURL(file);
  video.preload = 'metadata';
  video.src = source;
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Could not read this video. Try another file.')), 10000);
      video.onloadedmetadata = () => { window.clearTimeout(timeout); resolve(video.duration); };
      video.onerror = () => { window.clearTimeout(timeout); reject(new Error('Could not read this video. Choose another file.')); };
    });
    validateVideoDuration(duration);
    return duration;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(source);
  }
}
