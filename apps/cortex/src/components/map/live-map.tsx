"use client";

import { MapContainer, TileLayer, CircleMarker, Popup, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export interface LiveBde {
  bdeId: string;
  name: string;
  phone: string | null;
  online: boolean;
  lastSeen: string | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  speed: number | null;
  battery: number | null;
  trail: { lat: number; lng: number; at: string }[];
}

/** Centre of India — used only when nobody has ever reported a position. */
const FALLBACK_CENTER: [number, number] = [17.385, 78.4867];

function ago(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function LiveMap({ bdes }: { bdes: LiveBde[] }) {
  const located = bdes.filter((b) => b.lat !== null && b.lng !== null);
  const center: [number, number] = located.length
    ? [located[0].lat as number, located[0].lng as number]
    : FALLBACK_CENTER;

  return (
    <MapContainer center={center} zoom={located.length ? 13 : 5} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {located.map((b) => {
        const color = b.online ? "#22c55e" : "#6b7280";
        return (
          <div key={b.bdeId}>
            {b.trail.length > 1 && (
              <Polyline
                positions={b.trail.map((t) => [t.lat, t.lng] as [number, number])}
                pathOptions={{ color, weight: 3, opacity: 0.5 }}
              />
            )}
            <CircleMarker
              center={[b.lat as number, b.lng as number]}
              radius={9}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: 2 }}
            >
              <Popup>
                <div style={{ minWidth: 170 }}>
                  <strong>{b.name}</strong>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    {b.online ? "🟢 On shift" : "⚪ Off shift"} · {ago(b.lastSeen)}
                    <br />
                    {b.accuracy != null && <>Accuracy ±{Math.round(b.accuracy)}m<br /></>}
                    {b.speed != null && b.speed > 0.5 && <>Moving {(b.speed * 3.6).toFixed(1)} km/h<br /></>}
                    {b.battery != null && <>Battery {b.battery}%<br /></>}
                    {b.phone && <>📞 {b.phone}</>}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          </div>
        );
      })}
    </MapContainer>
  );
}
