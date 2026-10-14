import type { CampusCoordinates } from './campus-config';

const EARTH_RADIUS_METERS = 6_371_000;
const DISTANCE_EPSILON_METERS = 0.000001;

export function haversineDistanceMeters(
  first: CampusCoordinates,
  second: CampusCoordinates,
): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(second[0] - first[0]);
  const longitudeDelta = radians(second[1] - first[1]);
  const firstLatitude = radians(first[0]);
  const secondLatitude = radians(second[0]);
  const arc = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, arc)));
}

export function isWithinRadius(
  point: CampusCoordinates,
  center: CampusCoordinates,
  radiusMeters: number,
): boolean {
  return haversineDistanceMeters(point, center) <= radiusMeters + DISTANCE_EPSILON_METERS;
}
