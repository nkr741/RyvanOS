'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Bike,
  Star, Zap, TrendingUp, FileText, Loader2, AlertCircle,
} from 'lucide-react';

interface RiderSurvey {
  id: string;
  riderName: string;
  age?: number;
  gender?: string;
  phone: string;
  address?: string;
  vehicleType?: string;
  licenseNo?: string;
  rcNumber?: string;
  insurance: boolean;
  currentPlatforms: string;
  experienceMonths?: number;
  dailyEarnings?: number;
  monthlyEarnings?: number;
  fuelCost?: number;
  maintenanceCost?: number;
  netSavings?: number;
  hoursPerDay?: number;
  peakHours?: string;
  preferredArea?: string;
  nightShift: boolean;
  painPoints: string;
  averageWaiting?: number;
  understandsPayout?: string;
  satisfactionRating?: number;
  wouldRecommend?: boolean;
  wantedBenefits: string;
  wouldJoinRynOne?: string;
  featureVotes: string;
  professionalism?: number;
  communication?: number;
  vehicleCondition?: number;
  riskLevel?: string;
  likelihoodToJoin?: string;
  aiSummary?: string;
  leadScore?: number;
  leadStatus: string;
  marketFeedback?: string;
  createdAt: string;
  bde?: { id: string; name: string };
}

function getToken() {
  return localStorage.getItem('token') || '';
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70
      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
      : score >= 40
        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
        : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold tabular-nums ${color}`}>
      <Zap className="h-3.5 w-3.5" />
      {score}%
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{String(value)}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">{title}</h3>
      </div>
      <div className="px-6 py-4">{children}</div>
    </div>
  );
}

function parseJSON(val: string, fallback: unknown = {}) {
  try { return JSON.parse(val); } catch { return fallback; }
}

export default function RiderSurveyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [survey, setSurvey] = useState<RiderSurvey | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/surveys/rider/${params.id}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) throw new Error('Not found');
        setSurvey(await res.json());
      } catch {
        setError('Survey not found');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !survey) {
    return (
      <div className="space-y-4 py-12 text-center">
        <AlertCircle className="h-12 w-12 mx-auto text-red-400" />
        <p className="text-lg font-medium text-foreground">{error || 'Survey not found'}</p>
        <Link href="/admin/surveys" className="text-sm text-blue-500 hover:underline">
          Back to Surveys
        </Link>
      </div>
    );
  }

  const platforms = parseJSON(survey.currentPlatforms, []) as string[];
  const painPoints = parseJSON(survey.painPoints, {}) as Record<string, number>;
  const benefits = parseJSON(survey.wantedBenefits, []) as string[];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => router.back()}
          className="mt-1 flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-700 text-muted-foreground hover:text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">{survey.riderName}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Surveyed by {survey.bde?.name ?? 'Unknown'} &middot; {new Date(survey.createdAt).toLocaleDateString()}
          </p>
        </div>
        <ScoreBadge score={survey.leadScore ?? 0} />
      </div>

      {/* AI Summary */}
      {survey.aiSummary && (
        <div className="bg-gradient-to-r from-violet-500/5 to-blue-500/5 border border-violet-200 dark:border-violet-800/50 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-violet-500" />
            <span className="text-sm font-semibold text-foreground">AI Summary</span>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">{survey.aiSummary}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Personal Info">
          <div className="grid gap-1 sm:grid-cols-2">
            <InfoRow label="Phone" value={survey.phone} />
            <InfoRow label="Age" value={survey.age} />
            <InfoRow label="Gender" value={survey.gender} />
            <InfoRow label="Address" value={survey.address} />
            <InfoRow label="Vehicle Type" value={survey.vehicleType} />
            <InfoRow label="Experience" value={survey.experienceMonths ? `${survey.experienceMonths} months` : null} />
          </div>
        </Section>

        <Section title="Earnings">
          <div className="grid gap-1 sm:grid-cols-2">
            <InfoRow label="Daily Earnings" value={survey.dailyEarnings ? `₹${survey.dailyEarnings}` : null} />
            <InfoRow label="Monthly Earnings" value={survey.monthlyEarnings ? `₹${survey.monthlyEarnings.toLocaleString()}` : null} />
            <InfoRow label="Fuel Cost" value={survey.fuelCost ? `₹${survey.fuelCost}` : null} />
            <InfoRow label="Maintenance" value={survey.maintenanceCost ? `₹${survey.maintenanceCost}` : null} />
            <InfoRow label="Net Savings" value={survey.netSavings ? `₹${survey.netSavings.toLocaleString()}` : null} />
            <InfoRow label="Hours/Day" value={survey.hoursPerDay} />
          </div>
        </Section>
      </div>

      {/* Platforms */}
      {platforms.length > 0 && (
        <Section title="Current Platforms">
          <div className="flex flex-wrap gap-2">
            {platforms.map((p) => (
              <span key={p} className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 dark:bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/50">
                <Bike className="h-3 w-3" />
                {p}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Pain Points */}
      {Object.keys(painPoints).length > 0 && (
        <Section title="Pain Points">
          <div className="space-y-3">
            {Object.entries(painPoints).sort((a, b) => b[1] - a[1]).map(([point, rating]) => (
              <div key={point}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-foreground">{point}</span>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star key={i} className={`h-3 w-3 ${i < rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-300 dark:text-zinc-600'}`} />
                    ))}
                  </div>
                </div>
                <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${(rating / 5) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Benefits Wanted */}
      {benefits.length > 0 && (
        <Section title="Benefits Wanted">
          <div className="flex flex-wrap gap-2">
            {benefits.map((b) => (
              <span key={b} className="rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
                {b}
              </span>
            ))}
          </div>
        </Section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="RynOne Interest">
          <p className="text-sm font-medium text-foreground capitalize">
            {survey.wouldJoinRynOne || 'Not specified'}
          </p>
          <p className="text-xs text-muted-foreground mt-1 capitalize">
            Likelihood: {survey.likelihoodToJoin || 'N/A'}
          </p>
        </Section>

        <Section title="Assessment">
          <InfoRow label="Professionalism" value={survey.professionalism ? `${survey.professionalism}/5` : null} />
          <InfoRow label="Communication" value={survey.communication ? `${survey.communication}/5` : null} />
          <InfoRow label="Vehicle Condition" value={survey.vehicleCondition ? `${survey.vehicleCondition}/5` : null} />
        </Section>

        <Section title="Lead Status">
          <p className="text-sm font-medium text-foreground capitalize">
            {survey.leadStatus?.replace(/_/g, ' ')}
          </p>
          <p className="text-xs text-muted-foreground mt-1 capitalize">
            Risk Level: {survey.riskLevel || 'N/A'}
          </p>
        </Section>
      </div>

      {survey.marketFeedback && (
        <Section title="Voice of the Market">
          <div className="flex items-start gap-3">
            <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <p className="text-sm text-foreground/80 leading-relaxed italic">
              &ldquo;{survey.marketFeedback}&rdquo;
            </p>
          </div>
        </Section>
      )}
    </div>
  );
}
