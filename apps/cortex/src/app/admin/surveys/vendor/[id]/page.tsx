'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Building2, User, Phone, Mail, MapPin, Globe, Clock,
  Star, Zap, FileText, Loader2, AlertCircle,
  ChevronRight, Check, X, MessageSquare, PhoneCall,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AIInsightsPanel } from '@/components/ai/insights-panel';

interface VendorSurvey {
  id: string;
  businessName: string;
  ownerName: string;
  mobile: string;
  whatsapp?: string;
  email?: string;
  address: string;
  gpsLat?: number;
  gpsLng?: number;
  category: string;
  yearsInBusiness?: number;
  numberOfBranches?: number;
  employees?: number;
  seatingCapacity?: number;
  businessHours?: string;
  weeklyOff?: string;
  homeDelivery: boolean;
  ownDeliveryStaff: boolean;
  ownWebsite: boolean;
  ownMobileApp: boolean;
  onlinePlatforms: string;
  dailyOrdersWalkIn?: number;
  dailyOrdersOnline?: number;
  averageOrderValue?: number;
  monthlyRevenue?: number;
  peakHours?: string;
  painPoints: string;
  currentCommission?: number;
  platformCommissions: string;
  settlementFrequency?: string;
  marketingChannels: string;
  aiInterests: string;
  wouldJoinRynOne?: string;
  featureVotes: string;
  interestLevel?: string;
  potentialRevenue?: number;
  aiSummary?: string;
  leadScore?: number;
  leadStatus: string;
  stageChangedAt?: string;
  marketFeedback?: string;
  voiceTranscript?: string;
  createdAt: string;
  updatedAt: string;
  bde?: { id: string; name: string };
}

interface ActivityRecord {
  id: string;
  type: string;
  content: string;
  createdAt: string;
  user: { name: string };
}

const PIPELINE_STAGES = [
  { key: "new", label: "Lead", color: "bg-blue-500" },
  { key: "qualified", label: "Qualified", color: "bg-indigo-500" },
  { key: "interested", label: "Interested", color: "bg-amber-500" },
  { key: "negotiation", label: "Negotiation", color: "bg-purple-500" },
  { key: "onboarded", label: "Onboarded", color: "bg-emerald-500" },
  { key: "active_merchant", label: "Active", color: "bg-green-500" },
];

const VALID_TRANSITIONS: Record<string, string[]> = {
  new: ["qualified", "not_interested"],
  qualified: ["interested", "new", "not_interested"],
  interested: ["negotiation", "qualified", "not_interested"],
  negotiation: ["onboarded", "interested", "not_interested"],
  onboarded: ["active_merchant", "negotiation"],
  active_merchant: ["onboarded"],
  follow_up: ["qualified", "interested", "negotiation", "not_interested"],
  not_interested: ["new", "qualified"],
};

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  note: MessageSquare,
  call: PhoneCall,
  email: Mail,
  whatsapp: Phone,
  visit: MapPin,
  status_change: ChevronRight,
};

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

function InfoRow({ label, value, icon: Icon }: { label: string; value?: string | number | null; icon?: React.ElementType }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start gap-3 py-2">
      {Icon && <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{String(value)}</p>
      </div>
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

export default function VendorSurveyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [survey, setSurvey] = useState<VendorSurvey | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState('');
  const [moveNotes, setMoveNotes] = useState('');
  const [moving, setMoving] = useState(false);
  const [userRole, setUserRole] = useState('');

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/surveys/vendor/${params.id}`, {
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

    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      setUserRole(u.role || '');
    } catch { /* ignore */ }
  }, [params.id]);

  useEffect(() => {
    if (!survey) return;
    async function loadActivities() {
      try {
        const res = await fetch(`/api/activities?vendorSurveyId=${survey!.id}&limit=10`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (res.ok) {
          const data = await res.json();
          setActivities(data.activities ?? []);
        }
      } catch { /* ignore */ }
    }
    loadActivities();
  }, [survey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleMoveStage() {
    if (!survey || !moveTarget) return;
    setMoving(true);
    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          surveyId: survey.id,
          toStage: moveTarget,
          notes: moveNotes || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSurvey((prev) => prev ? { ...prev, leadStatus: data.survey.leadStatus, stageChangedAt: data.survey.stageChangedAt } : prev);
        setMoveOpen(false);
        setMoveTarget('');
        setMoveNotes('');
        const actRes = await fetch(`/api/activities?vendorSurveyId=${survey.id}&limit=10`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (actRes.ok) {
          const actData = await actRes.json();
          setActivities(actData.activities ?? []);
        }
      }
    } catch { /* ignore */ }
    setMoving(false);
  }

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

  const platforms = parseJSON(survey.onlinePlatforms, []) as string[];
  const painPoints = parseJSON(survey.painPoints, {}) as Record<string, number>;
  const commissions = parseJSON(survey.platformCommissions, {}) as Record<string, number>;
  const features = parseJSON(survey.featureVotes, {}) as Record<string, number>;

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
          <h1 className="text-xl font-bold text-foreground">{survey.businessName}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Surveyed by {survey.bde?.name ?? 'Unknown'} &middot; {new Date(survey.createdAt).toLocaleDateString()}
          </p>
        </div>
        <ScoreBadge score={survey.leadScore ?? 0} />
      </div>

      {/* AI Intelligence Panel */}
      <AIInsightsPanel surveyId={survey.id} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Business Profile */}
        <Section title="Business Profile">
          <div className="grid gap-1 sm:grid-cols-2">
            <InfoRow label="Owner" value={survey.ownerName} icon={User} />
            <InfoRow label="Phone" value={survey.mobile} icon={Phone} />
            <InfoRow label="WhatsApp" value={survey.whatsapp} icon={Phone} />
            <InfoRow label="Email" value={survey.email} icon={Mail} />
            <InfoRow label="Address" value={survey.address} icon={MapPin} />
            <InfoRow label="Category" value={survey.category?.replace(/_/g, ' ')} icon={Building2} />
            <InfoRow label="Years in Business" value={survey.yearsInBusiness} icon={Clock} />
            <InfoRow label="Employees" value={survey.employees} icon={User} />
          </div>
        </Section>

        {/* Business Numbers */}
        <Section title="Business Numbers">
          <div className="grid gap-1 sm:grid-cols-2">
            <InfoRow label="Walk-in Orders/Day" value={survey.dailyOrdersWalkIn} />
            <InfoRow label="Online Orders/Day" value={survey.dailyOrdersOnline} />
            <InfoRow label="Avg Order Value" value={survey.averageOrderValue ? `₹${survey.averageOrderValue}` : null} />
            <InfoRow label="Monthly Revenue" value={survey.monthlyRevenue ? `₹${survey.monthlyRevenue.toLocaleString()}` : null} />
            <InfoRow label="Peak Hours" value={survey.peakHours} />
            <InfoRow label="Business Hours" value={survey.businessHours} />
          </div>
        </Section>
      </div>

      {/* Online Platforms */}
      {platforms.length > 0 && (
        <Section title="Online Platforms">
          <div className="flex flex-wrap gap-2">
            {platforms.map((p) => (
              <span key={p} className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
                <Globe className="h-3 w-3" />
                {p}
              </span>
            ))}
          </div>
        </Section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
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

        {/* Commissions */}
        {Object.keys(commissions).length > 0 && (
          <Section title="Platform Commissions">
            <div className="space-y-3">
              {Object.entries(commissions).map(([platform, pct]) => (
                <div key={platform} className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{platform}</span>
                  <span className={`text-sm font-bold tabular-nums ${pct > 20 ? 'text-red-500' : pct >= 10 ? 'text-amber-500' : 'text-emerald-500'}`}>
                    {pct}%
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>

      {/* Feature Votes */}
      {Object.keys(features).length > 0 && (
        <Section title="Feature Importance Ratings">
          <div className="space-y-3">
            {Object.entries(features).sort((a, b) => b[1] - a[1]).map(([feature, score]) => (
              <div key={feature} className="flex items-center gap-3">
                <span className="text-sm text-foreground flex-1">{feature}</span>
                <div className="w-32 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${(score / 5) * 100}%` }} />
                </div>
                <span className="text-xs font-semibold tabular-nums text-foreground w-8">{score}/5</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Pipeline Stage Progress */}
      <Section title="Pipeline Stage">
        <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-2">
          {PIPELINE_STAGES.map((stage, idx) => {
            const currentIdx = PIPELINE_STAGES.findIndex((s) => s.key === (survey.leadStatus === 'follow_up' ? 'qualified' : survey.leadStatus));
            const stageIdx = idx;
            const isActive = stageIdx === currentIdx;
            const isPast = stageIdx < currentIdx;
            const isLost = survey.leadStatus === 'not_interested';

            return (
              <div key={stage.key} className="flex items-center gap-1 shrink-0">
                <div
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                    isLost
                      ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
                      : isActive
                        ? `${stage.color} text-white`
                        : isPast
                          ? `${stage.color}/20 text-foreground`
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
                  )}
                >
                  {isPast && !isLost && <Check className="h-3 w-3" />}
                  {stage.label}
                </div>
                {idx < PIPELINE_STAGES.length - 1 && (
                  <ChevronRight className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-600 shrink-0" />
                )}
              </div>
            );
          })}
          {survey.leadStatus === 'not_interested' && (
            <div className="flex items-center gap-1 shrink-0 ml-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-500 text-white">
                <X className="h-3 w-3" />
                Lost
              </div>
            </div>
          )}
        </div>

        {/* Move Stage Action */}
        {userRole === 'admin' && (
          <div>
            {!moveOpen ? (
              <button
                onClick={() => setMoveOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <ChevronRight className="h-4 w-4" />
                Move Stage
              </button>
            ) : (
              <div className="flex flex-wrap items-end gap-3 p-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Move to</label>
                  <select
                    value={moveTarget}
                    onChange={(e) => setMoveTarget(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-foreground"
                  >
                    <option value="">Select stage...</option>
                    {(VALID_TRANSITIONS[survey.leadStatus] || []).map((s) => {
                      const stage = PIPELINE_STAGES.find((p) => p.key === s);
                      return (
                        <option key={s} value={s}>
                          {stage?.label || s.replace(/_/g, ' ')}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Notes (optional)</label>
                  <input
                    type="text"
                    value={moveNotes}
                    onChange={(e) => setMoveNotes(e.target.value)}
                    placeholder="Reason for stage change..."
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-foreground"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleMoveStage}
                    disabled={!moveTarget || moving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                  >
                    {moving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Confirm
                  </button>
                  <button
                    onClick={() => { setMoveOpen(false); setMoveTarget(''); setMoveNotes(''); }}
                    className="px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* RynOne Interest */}
        <Section title="RynOne Interest">
          <p className="text-sm font-medium text-foreground capitalize">
            {survey.wouldJoinRynOne?.replace(/_/g, ' ') || 'Not specified'}
          </p>
          <p className="text-xs text-muted-foreground mt-1 capitalize">
            Interest Level: {survey.interestLevel || 'N/A'}
          </p>
        </Section>

        {/* Settlement */}
        <Section title="Settlement Info">
          <InfoRow label="Current Commission" value={survey.currentCommission ? `${survey.currentCommission}%` : null} />
          <InfoRow label="Settlement Frequency" value={survey.settlementFrequency} />
        </Section>

        {/* Potential Revenue */}
        <Section title="Revenue Potential">
          <p className="text-lg font-bold text-foreground tabular-nums">
            {survey.potentialRevenue ? `₹${survey.potentialRevenue.toLocaleString()}` : 'Not estimated'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Monthly estimated potential</p>
        </Section>
      </div>

      {/* Market Feedback */}
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

      {/* Activity Timeline */}
      {activities.length > 0 && (
        <Section title="Activity Timeline">
          <div className="space-y-0">
            {activities.map((act, idx) => {
              const Icon = ACTIVITY_ICONS[act.type] || MessageSquare;
              return (
                <div key={act.id} className={cn("flex items-start gap-3 py-3", idx > 0 && "border-t border-zinc-100 dark:border-zinc-800")}>
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 shrink-0 mt-0.5">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{act.content}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {act.user.name} &middot; {new Date(act.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}
