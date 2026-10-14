import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CAMPUS_MAP_CONFIG } from './campus-config';

type Coordinates = [number, number];

export default function ReportLocationPicker({ selected, onChange, userLocation }: {
  selected: Coordinates | null;
  onChange: (coordinates: Coordinates) => void;
  userLocation: { lat: number; lng: number; accuracy: number } | null;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const userMarker = useRef<L.CircleMarker | null>(null);
  const accuracyCircle = useRef<L.Circle | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current, {
      minZoom: CAMPUS_MAP_CONFIG.minZoom,
      maxZoom: CAMPUS_MAP_CONFIG.maxZoom,
      maxBounds: CAMPUS_MAP_CONFIG.bounds,
      maxBoundsViscosity: 0.9,
    }).setView(CAMPUS_MAP_CONFIG.center, CAMPUS_MAP_CONFIG.zoom);
    instance.fitBounds(CAMPUS_MAP_CONFIG.campusBounds, {
      padding: [18, 18],
      maxZoom: CAMPUS_MAP_CONFIG.zoom,
    });
    map.current = instance;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: CAMPUS_MAP_CONFIG.maxZoom,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(instance);
    L.circle(CAMPUS_MAP_CONFIG.center, {
      radius: CAMPUS_MAP_CONFIG.allowedRadiusMeters,
      color: '#72d5cb',
      fillColor: '#72d5cb',
      fillOpacity: 0.1,
      weight: 2,
    }).addTo(instance);

    const placePin = (coordinates: Coordinates) => {
      if (!marker.current) {
        const icon = L.divIcon({
          className: 'map-marker-wrap',
          html: '<span class="map-marker report-location-marker"><i></i></span>',
          iconSize: [26, 34],
          iconAnchor: [13, 30],
        });
        marker.current = L.marker(coordinates, { icon, draggable: true, keyboard: true }).addTo(instance);
        marker.current.on('drag', () => {
          const point = marker.current?.getLatLng();
          if (point) onChangeRef.current([point.lat, point.lng]);
        });
      } else {
        marker.current.setLatLng(coordinates);
      }
      onChangeRef.current(coordinates);
    };

    instance.on('click', event => placePin([event.latlng.lat, event.latlng.lng]));
    window.setTimeout(() => instance.invalidateSize(), 100);
    return () => {
      instance.remove();
      map.current = null;
      marker.current = null;
      userMarker.current = null;
      accuracyCircle.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    userMarker.current?.remove();
    accuracyCircle.current?.remove();
    userMarker.current = null;
    accuracyCircle.current = null;
    if (!userLocation) return;

    if (Number.isFinite(userLocation.accuracy) && userLocation.accuracy > 0) {
      accuracyCircle.current = L.circle([userLocation.lat, userLocation.lng], {
        radius: userLocation.accuracy,
        color: '#a895ff',
        fillColor: '#a895ff',
        fillOpacity: 0.12,
        weight: 1,
      }).addTo(map.current);
    }
    userMarker.current = L.circleMarker([userLocation.lat, userLocation.lng], {
      radius: 7,
      color: '#fff',
      fillColor: '#a895ff',
      fillOpacity: 1,
      weight: 2,
    }).addTo(map.current);
  }, [userLocation]);

  return <div className="report-location-picker">
    <div ref={element} className="report-location-map" aria-label="Issue location map" />
    <div className="report-location-help">
      <span role="status" aria-live="polite">
        {selected ? `Pin set at ${selected[0].toFixed(5)}, ${selected[1].toFixed(5)}. Drag it to adjust.` : 'Click or tap the issue location to place a pin, then drag it to adjust.'}
      </span>
      <button type="button" className="secondary-button" onClick={() => {
        const point = map.current?.getCenter();
        if (point) {
          const coordinates: Coordinates = [point.lat, point.lng];
          if (marker.current) {
            marker.current.setLatLng(coordinates);
            onChangeRef.current(coordinates);
          } else map.current?.fire('click', { latlng: point });
        }
      }}>Pin map center</button>
    </div>
  </div>;
}
