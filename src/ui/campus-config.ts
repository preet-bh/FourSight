export type CampusCoordinates = [number, number];
export type CampusBounds = [CampusCoordinates, CampusCoordinates];

export const CAMPUS_MAP_CONFIG: {
  center: CampusCoordinates;
  campusBounds: CampusBounds;
  zoom: number;
  bounds: CampusBounds;
  minZoom: number;
  maxZoom: number;
  allowedRadiusMeters: number;
  maxLocationAccuracyMeters: number;
} = {
  center: [42.3172294, -83.2319394],
  campusBounds: [[42.3126688, -83.2385565], [42.322114, -83.2271925]],
  zoom: 16,
  bounds: [[42.304, -83.248], [42.331, -83.215]],
  minZoom: 14,
  maxZoom: 19,
  allowedRadiusMeters: 1000,
  maxLocationAccuracyMeters: 100,
};
