import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Coordinates = [number, number];

export default function ReportLocationPicker({ center, selected, onChange }: {
  center: Coordinates;
  selected: Coordinates | null;
  onChange: (coordinates: Coordinates) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current).setView(center, 15);
    map.current = instance;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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
    };
  }, []);

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
