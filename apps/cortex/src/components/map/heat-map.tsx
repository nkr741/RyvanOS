'use client';

import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

interface SurveyPoint {
  id: string;
  businessName: string;
  ownerName: string;
  category: string;
  leadScore: number;
  leadStatus: string;
  lat: number;
  lng: number;
}

interface HeatMapProps {
  points: SurveyPoint[];
  selectedCategory: string;
  selectedStatus: string;
}

const STATUS_COLORS: Record<string, string> = {
  interested: '#22c55e',
  follow_up: '#f59e0b',
  not_interested: '#ef4444',
  new: '#3b82f6',
  onboarded: '#a855f7',
};

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  interested: 'Interested',
  follow_up: 'Follow-up',
  not_interested: 'Not Interested',
  onboarded: 'Onboarded',
};

function getStatusColor(status: string): string {
  return STATUS_COLORS[status] || '#6b7280';
}

export default function HeatMap({ points, selectedCategory, selectedStatus }: HeatMapProps) {
  const filteredPoints = points.filter((point) => {
    if (selectedCategory !== 'all' && point.category !== selectedCategory) return false;
    if (selectedStatus !== 'all' && point.leadStatus !== selectedStatus) return false;
    return true;
  });

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[20.5937, 78.9629]}
        zoom={5}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {filteredPoints.map((point) => (
          <CircleMarker
            key={point.id}
            center={[point.lat, point.lng]}
            radius={8}
            weight={2}
            opacity={0.8}
            fillOpacity={0.6}
            color={getStatusColor(point.leadStatus)}
            fillColor={getStatusColor(point.leadStatus)}
          >
            <Popup>
              <div className="min-w-[180px] space-y-1.5 text-sm">
                <p className="font-semibold text-zinc-900">{point.businessName}</p>
                <p className="text-zinc-600">{point.category}</p>
                <p className="text-zinc-600">Owner: {point.ownerName}</p>
                <p className="text-zinc-600">Lead Score: {point.leadScore}%</p>
                <span
                  className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: getStatusColor(point.leadStatus) }}
                >
                  {STATUS_LABELS[point.leadStatus] || point.leadStatus}
                </span>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 z-[1000] rounded-lg border border-zinc-200 bg-white/95 p-3 shadow-md backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95">
        <p className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">Lead Status</p>
        <div className="space-y-1.5">
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: STATUS_COLORS[key] }}
              />
              <span className="text-xs text-zinc-600 dark:text-zinc-400">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
