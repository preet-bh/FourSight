export const REGION_CENTERS: Record<string, [number, number]> = {
  Boston: [42.355, -71.065],
  Dearborn: [42.3223, -83.1763],
};

const nearbyRegionKilometers = 15;

export function regionNear([latitude, longitude]: [number, number]): string | null {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  for (const [region, [centerLatitude, centerLongitude]] of Object.entries(REGION_CENTERS)) {
    const latitudeDelta = radians(centerLatitude - latitude);
    const longitudeDelta = radians(centerLongitude - longitude);
    const arc = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(radians(latitude)) * Math.cos(radians(centerLatitude)) * Math.sin(longitudeDelta / 2) ** 2;
    const distance = 6371 * 2 * Math.asin(Math.sqrt(arc));
    if (distance <= nearbyRegionKilometers) return region;
  }
  return null;
}

export function savedRegion(): string {
  try {
    const value = localStorage.getItem('foursight:region') ?? '';
    return value in REGION_CENTERS ? value : '';
  } catch {
    return '';
  }
}
