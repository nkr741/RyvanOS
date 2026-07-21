'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { MapPin } from 'lucide-react';

const MapComponent = dynamic(() => import('@/components/map/heat-map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-zinc-100 dark:bg-zinc-900">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground" />
    </div>
  ),
});

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

const CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'kirana', label: 'Kirana' },
  { value: 'supermarket', label: 'Supermarket' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'bakery', label: 'Bakery' },
  { value: 'cafe', label: 'Cafe' },
  { value: 'fruits_vegetables', label: 'Fruits & Vegetables' },
  { value: 'meat_shop', label: 'Meat Shop' },
  { value: 'pet_shop', label: 'Pet Shop' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'stationery', label: 'Stationery' },
  { value: 'flower_shop', label: 'Flower Shop' },
  { value: 'medical', label: 'Medical' },
  { value: 'others', label: 'Others' },
];

const STATUSES = [
  { value: 'all', label: 'All Statuses' },
  { value: 'new', label: 'New' },
  { value: 'interested', label: 'Interested' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'onboarded', label: 'Onboarded' },
];

const STATUS_COLORS: Record<string, string> = {
  new: '#3b82f6',
  interested: '#22c55e',
  follow_up: '#f59e0b',
  not_interested: '#ef4444',
  onboarded: '#a855f7',
};

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function HeatmapPage() {
  const [surveys, setSurveys] = useState<SurveyPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  useEffect(() => {
    async function fetchSurveys() {
      try {
        const res = await fetch('/api/surveys/vendor?limit=500', {
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error('Failed to fetch surveys');
        const data = await res.json();
        const mapped: SurveyPoint[] = (data.surveys || [])
          .filter((s: Record<string, unknown>) => s.gpsLat != null && s.gpsLng != null)
          .map((s: Record<string, unknown>) => ({
            id: s.id as string,
            businessName: s.businessName as string,
            ownerName: s.ownerName as string,
            category: s.category as string,
            leadScore: s.leadScore as number,
            leadStatus: s.leadStatus as string,
            lat: Number(s.gpsLat),
            lng: Number(s.gpsLng),
          }));
        setSurveys(mapped);
      } catch (err) {
        console.error('Error fetching survey data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load survey data');
      } finally {
        setLoading(false);
      }
    }
    fetchSurveys();
  }, []);

  const filteredSurveys = surveys.filter((s) => {
    if (selectedCategory !== 'all' && s.category !== selectedCategory) return false;
    if (selectedStatus !== 'all' && s.leadStatus !== selectedStatus) return false;
    return true;
  });

  const statusCounts = surveys.reduce<Record<string, number>>((acc, s) => {
    acc[s.leadStatus] = (acc[s.leadStatus] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="-m-4 lg:-m-6 flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>
      {/* Top filter bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-zinc-500" />
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Survey Heat Map</h1>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>

          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {surveys.length} surveys
          </span>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/50">
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              Failed to load survey data
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{error}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main content area */}
      <div className="relative flex-1">
        {/* Stats overlay */}
        <div className="absolute right-4 top-4 z-[1000] flex flex-col gap-2">
          {STATUSES.filter((s) => s.value !== 'all').map((status) => (
            <div
              key={status.value}
              className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95"
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: STATUS_COLORS[status.value] }}
              />
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {status.label}
              </span>
              <span className="ml-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                {statusCounts[status.value] || 0}
              </span>
            </div>
          ))}
        </div>

        {/* Map */}
        {loading ? (
          <div className="flex h-full items-center justify-center bg-zinc-100 dark:bg-zinc-900">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground" />
          </div>
        ) : (
          <MapComponent
            points={surveys}
            selectedCategory={selectedCategory}
            selectedStatus={selectedStatus}
          />
        )}

        {/* Empty state overlay */}
        {filteredSurveys.length === 0 && !loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center z-[999] pointer-events-none">
            <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-lg px-6 py-4 text-center pointer-events-auto">
              <MapPin className="size-8 text-zinc-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">No survey locations found</p>
              <p className="text-xs text-zinc-400 mt-1">Try adjusting your filters</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
