import { describe, expect, it } from 'vitest';
import { regionNear } from './regions';

describe('regionNear', () => {
  it('selects a supported region near the resident', () => {
    expect(regionNear([42.3223, -83.1763])).toBe('Dearborn');
    expect(regionNear([42.355, -71.065])).toBe('Boston');
  });

  it('does not label another city as Boston or Dearborn', () => {
    expect(regionNear([40.7128, -74.006])).toBeNull();
    expect(regionNear([42.5, -71.0])).toBeNull();
  });
});
