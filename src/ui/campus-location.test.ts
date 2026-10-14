import { describe, expect, it } from 'vitest';
import { CAMPUS_MAP_CONFIG } from './campus-config';
import { haversineDistanceMeters, isWithinRadius } from './campus-location';

describe('campus location distance', () => {
  const { center, allowedRadiusMeters } = CAMPUS_MAP_CONFIG;

  it('allows a point inside the configured campus radius', () => {
    expect(isWithinRadius([42.32, -83.232], center, allowedRadiusMeters)).toBe(true);
  });

  it('rejects a point outside the configured campus radius', () => {
    expect(isWithinRadius([42.34, -83.232], center, allowedRadiusMeters)).toBe(false);
  });

  it('includes a point exactly on the radius boundary', () => {
    const boundaryLatitude = center[0]
      + allowedRadiusMeters / 6_371_000 * 180 / Math.PI;
    const boundary: [number, number] = [boundaryLatitude, center[1]];

    expect(haversineDistanceMeters(center, boundary)).toBeCloseTo(allowedRadiusMeters, 8);
    expect(isWithinRadius(boundary, center, allowedRadiusMeters)).toBe(true);
  });
});
