import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PublicReport } from '../domain/types';
import { REGION_CENTERS } from './regions';

export default function MapView({ region, reports, onSelect }: { region: string; reports: PublicReport[]; onSelect: (id: string) => void }) {
  const element = useRef<HTMLDivElement>(null); const map = useRef<L.Map | null>(null); const markers = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    const center = REGION_CENTERS[region];
    if (!element.current || map.current || !center) return;
    map.current = L.map(element.current, { zoomControl: false }).setView(center, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map.current);
    L.control.zoom({ position: 'bottomright' }).addTo(map.current);
    markers.current = L.layerGroup().addTo(map.current);
    setTimeout(() => map.current?.invalidateSize(), 100);
    return () => { map.current?.remove(); map.current = null; };
  }, [region]);
  useEffect(() => {
    if (!map.current || !markers.current) return;
    markers.current.clearLayers();
    reports.filter(report => report.region === region).forEach(report => {
      const tone = report.status === 'resolved' ? 'green' : report.status === 'in_progress' ? 'amber' : 'red';
      const icon = L.divIcon({ className: 'map-marker-wrap', html: `<span class="map-marker ${tone}"><i></i></span>`, iconSize: [26, 34], iconAnchor: [13, 30] });
      L.marker([report.location.lat, report.location.lng], { icon }).addTo(markers.current!).on('click', () => onSelect(report.id));
    });
  }, [reports, region, onSelect]);
  return <div className="map-wrap"><div ref={element} className="map-canvas"/><div className="map-attribution-note">Map data © OpenStreetMap</div></div>;
}
