'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Send,
  Check,
  Star,
  MapPin,
  Mic,
  Square,
  Play,
  Pause,
  Upload,
  X,
  FileText,
  Award,
  ArrowLeft,
  Plus,
  Clock,
  Bike,
} from 'lucide-react';
import { uploadSurveyFiles } from '@/lib/upload';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormData {
  // Step 1 - Basic
  riderName: string;
  age: number | null;
  gender: string;
  phone: string;
  address: string;
  vehicleType: string;
  licenseNo: string;
  rcNumber: string;
  insurance: boolean;
  aadhaar: string;
  pan: string;
  gpsLat: number | null;
  gpsLng: number | null;

  // Step 2 - Experience
  currentPlatforms: string[];
  experienceValue: number | null;
  experienceUnit: 'months' | 'years';

  // Step 3 - Earnings
  dailyEarnings: number | null;
  monthlyEarnings: number | null;
  fuelCost: number | null;
  maintenanceCost: number | null;

  // Step 4 - Working Pattern
  hoursPerDay: number | null;
  peakHours: string;
  preferredArea: string;
  nightShift: boolean;

  // Step 5 - Pain Points
  painPoints: Record<string, number>;

  // Step 6 - Waiting & Payments
  averageWaiting: number | null;
  whoShouldPayWait: string;
  understandsPayout: string;
  satisfactionRating: number;
  wouldRecommend: boolean;

  // Step 7 - Benefits & Switching
  wantedBenefits: string[];
  wouldJoinRynOne: string;
  featureVotes: Record<string, number>;

  // Step 8 - Documents & Voice
  documents: Record<string, File | null>;
  audioBlob: Blob | null;
  marketFeedback: string;

  // Step 9 - AI Observation
  professionalism: number;
  communication: number;
  vehicleCondition: number;
  documentsComplete: boolean;
  riskLevel: string;
  likelihoodToJoin: string;
  additionalNotes: string;
}

interface SubmitResult {
  aiSummary: string;
  leadScore: number;
  overallScore: number;
  leadStatus: string;
  riderName: string;
  wouldJoinRynOne: string | null;
  likelihoodToJoin: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = [
  'Basic Info',
  'Experience',
  'Earnings',
  'Work Pattern',
  'Pain Points',
  'Waiting & Pay',
  'Benefits',
  'Documents',
  'AI Observation',
];

const PLATFORMS = [
  'Swiggy',
  'Zomato',
  'Blinkit',
  'Shadowfax',
  'Rapido',
  'Porter',
  'Others',
];

const PAIN_POINT_LABELS: Record<string, string> = {
  low_earnings: 'Low Earnings',
  long_waiting: 'Long Waiting',
  traffic: 'Traffic',
  support_issues: 'Support Issues',
  unfair_ratings: 'Unfair Ratings',
  incentive_problems: 'Incentive Problems',
  long_distance: 'Long Distance',
  app_issues: 'App Issues',
  difficult_customers: 'Difficult Customers',
  restaurant_issues: 'Restaurant Issues',
};

const BENEFITS = [
  'Insurance',
  'Health Checkups',
  'Fuel Discounts',
  'Bike Service Discounts',
  'Emergency Loans',
  'Education Support',
  'Family Insurance',
  'Weekly Payout',
  'Daily Withdrawal',
];

const FEATURE_LABELS: Record<string, string> = {
  live_earnings: 'Live Earnings',
  income_forecast: 'Income Forecast',
  heat_map: 'Heat Map',
  nearby_orders: 'Nearby Orders',
  fuel_tracker: 'Fuel Tracker',
  expense_tracker: 'Expense Tracker',
  daily_goals: 'Daily Goals',
  leaderboard: 'Leaderboard',
  rewards: 'Rewards',
};

const DOCUMENT_TYPES = [
  { key: 'license', label: 'License' },
  { key: 'rc_book', label: 'RC Book' },
  { key: 'insurance_doc', label: 'Insurance' },
  { key: 'aadhaar_doc', label: 'Aadhaar' },
  { key: 'pan_doc', label: 'PAN' },
];

const STORAGE_KEY = 'rider_survey_draft';

const defaultFormData: FormData = {
  riderName: '',
  age: null,
  gender: '',
  phone: '',
  address: '',
  vehicleType: '',
  licenseNo: '',
  rcNumber: '',
  insurance: false,
  aadhaar: '',
  pan: '',
  gpsLat: null,
  gpsLng: null,
  currentPlatforms: [],
  experienceValue: null,
  experienceUnit: 'months',
  dailyEarnings: null,
  monthlyEarnings: null,
  fuelCost: null,
  maintenanceCost: null,
  hoursPerDay: null,
  peakHours: '',
  preferredArea: '',
  nightShift: false,
  painPoints: {},
  averageWaiting: null,
  whoShouldPayWait: '',
  understandsPayout: '',
  satisfactionRating: 5,
  wouldRecommend: false,
  wantedBenefits: [],
  wouldJoinRynOne: '',
  featureVotes: {},
  documents: {},
  audioBlob: null,
  marketFeedback: '',
  professionalism: 0,
  communication: 0,
  vehicleCondition: 0,
  documentsComplete: false,
  riskLevel: '',
  likelihoodToJoin: '',
  additionalNotes: '',
};

// ---------------------------------------------------------------------------
// CSS class tokens
// ---------------------------------------------------------------------------

const cardCls =
  'bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6';
const inputCls =
  'w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition';
const labelCls = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5';
const btnPrimary =
  'inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 active:scale-[0.98] transition disabled:opacity-50 disabled:pointer-events-none min-h-[48px]';
const btnSecondary =
  'inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-[0.98] transition disabled:opacity-50 disabled:pointer-events-none min-h-[48px]';

// ---------------------------------------------------------------------------
// StarRating component
// ---------------------------------------------------------------------------

function StarRating({
  value,
  onChange,
  max = 5,
}: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
}) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }, (_, i) => i + 1).map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="p-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label={`${star} star${star > 1 ? 's' : ''}`}
        >
          <Star
            size={24}
            className={
              star <= value
                ? 'fill-amber-400 text-amber-400'
                : 'text-zinc-300 dark:text-zinc-600'
            }
          />
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle switch component
// ---------------------------------------------------------------------------

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer min-h-[48px]">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-12 h-7 rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-zinc-300 dark:bg-zinc-600'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
      <span className="text-sm text-zinc-700 dark:text-zinc-300">{label}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// AudioRecorder component
// ---------------------------------------------------------------------------

function AudioRecorder({
  audioBlob,
  onRecorded,
}: {
  audioBlob: Blob | null;
  onRecorded: (blob: Blob | null) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onRecorded(blob);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start();
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch {
      alert('Microphone access denied.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const playAudio = () => {
    if (!audioBlob) return;
    const url = URL.createObjectURL(audioBlob);
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlaying(false);
    audio.play();
    setPlaying(true);
  };

  const pauseAudio = () => {
    audioRef.current?.pause();
    setPlaying(false);
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)
      .toString()
      .padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className={`${cardCls} flex flex-col items-center gap-4`}>
      <p className={labelCls}>Voice Feedback</p>
      <div className="flex items-center gap-3">
        {!recording && !audioBlob && (
          <button type="button" onClick={startRecording} className={btnPrimary}>
            <Mic size={20} /> Start Recording
          </button>
        )}
        {recording && (
          <>
            <span className="flex items-center gap-2 text-red-500 font-mono text-lg">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              {formatTime(duration)}
            </span>
            <button type="button" onClick={stopRecording} className="p-3 rounded-full bg-red-600 text-white min-w-[48px] min-h-[48px] flex items-center justify-center">
              <Square size={20} />
            </button>
          </>
        )}
        {audioBlob && !recording && (
          <>
            <button
              type="button"
              onClick={playing ? pauseAudio : playAudio}
              className={btnSecondary}
            >
              {playing ? <Pause size={20} /> : <Play size={20} />}
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              onClick={() => {
                onRecorded(null);
                setDuration(0);
              }}
              className="p-3 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 min-w-[48px] min-h-[48px] flex items-center justify-center"
            >
              <X size={20} />
            </button>
            <button type="button" onClick={startRecording} className={btnSecondary}>
              <Mic size={20} /> Re-record
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function RiderSurveyPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<FormData>(defaultFormData);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const stepScrollRef = useRef<HTMLDivElement>(null);

  // ---- Helpers ----
  const update = useCallback(
    <K extends keyof FormData>(key: K, value: FormData[K]) => {
      setFormData((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const draft = localStorage.getItem(STORAGE_KEY);
      if (draft) {
        const parsed = JSON.parse(draft);
        delete parsed.documents;
        delete parsed.audioBlob;
        setFormData((prev) => ({ ...prev, ...parsed }));
      }
    } catch { /* no draft */ }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const timer = setInterval(() => {
      try {
        const serialisable = { ...formData } as Record<string, unknown>;
        delete serialisable.documents;
        delete serialisable.audioBlob;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serialisable));
      } catch {
        /* quota exceeded */
      }
    }, 30_000);
    return () => clearInterval(timer);
  }, [formData]);

  // ---- Scroll active step into view ----
  useEffect(() => {
    const el = stepScrollRef.current;
    if (!el) return;
    const active = el.querySelector('[data-active="true"]');
    active?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [currentStep]);

  // ---- Computed ----
  const netSavings =
    (formData.monthlyEarnings ?? 0) -
    (formData.fuelCost ?? 0) -
    (formData.maintenanceCost ?? 0);

  const experienceMonths =
    formData.experienceUnit === 'years'
      ? (formData.experienceValue ?? 0) * 12
      : formData.experienceValue ?? 0;

  // ---- GPS ----
  const captureGps = () => {
    if (!navigator.geolocation) {
      alert('Geolocation not supported');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        update('gpsLat', pos.coords.latitude);
        update('gpsLng', pos.coords.longitude);
        setGpsLoading(false);
      },
      () => {
        alert('Unable to get location');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true },
    );
  };

  // ---- Validation per step ----
  const canProceed = (): boolean => {
    switch (currentStep) {
      case 0:
        return formData.riderName.trim().length > 0 && /^[6-9]\d{9}$/.test(formData.phone);
      default:
        return true;
    }
  };

  // ---- Submit ----
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token') || '';

      // Upload documents and voice note before submission
      const { docUrls, voiceUrl } = await uploadSurveyFiles(
        formData.documents,
        formData.audioBlob,
        'rider',
        token
      );

      const payload = {
        riderName: formData.riderName,
        age: formData.age,
        gender: formData.gender || null,
        phone: formData.phone,
        address: formData.address || null,
        vehicleType: formData.vehicleType || null,
        licenseNo: formData.licenseNo || null,
        rcNumber: formData.rcNumber || null,
        insurance: formData.insurance,
        aadhaar: formData.aadhaar || null,
        pan: formData.pan || null,
        gpsLat: formData.gpsLat,
        gpsLng: formData.gpsLng,
        currentPlatforms: formData.currentPlatforms,
        experienceMonths,
        dailyEarnings: formData.dailyEarnings,
        monthlyEarnings: formData.monthlyEarnings,
        fuelCost: formData.fuelCost,
        maintenanceCost: formData.maintenanceCost,
        netSavings,
        hoursPerDay: formData.hoursPerDay,
        peakHours: formData.peakHours || null,
        preferredArea: formData.preferredArea || null,
        nightShift: formData.nightShift,
        painPoints: formData.painPoints,
        averageWaiting: formData.averageWaiting,
        whoShouldPayWait: formData.whoShouldPayWait || null,
        understandsPayout: formData.understandsPayout || null,
        satisfactionRating: formData.satisfactionRating,
        wouldRecommend: formData.wouldRecommend,
        wantedBenefits: formData.wantedBenefits,
        wouldJoinRynOne: formData.wouldJoinRynOne || null,
        featureVotes: formData.featureVotes,
        professionalism: formData.professionalism || null,
        communication: formData.communication || null,
        vehicleCondition: formData.vehicleCondition || null,
        documentsComplete: formData.documentsComplete,
        riskLevel: formData.riskLevel || null,
        likelihoodToJoin: formData.likelihoodToJoin || null,
        marketFeedback: formData.marketFeedback || null,
        voiceNoteUrl: voiceUrl,
        voiceTranscript: null,
        documentFiles: docUrls,
      };

      const res = await fetch('/api/surveys/rider', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to submit');
      const data = await res.json();
      setResult({
        aiSummary: data.aiSummary ?? '',
        leadScore: data.leadScore ?? 0,
        overallScore: data.overallScore ?? 0,
        leadStatus: data.leadStatus ?? 'new',
        riderName: data.riderName ?? formData.riderName,
        wouldJoinRynOne: data.wouldJoinRynOne,
        likelihoodToJoin: data.likelihoodToJoin,
      });
      setSubmitted(true);
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      alert('Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Save Draft ----
  const saveDraft = () => {
    try {
      const serialisable = { ...formData } as Record<string, unknown>;
      delete serialisable.documents;
      delete serialisable.audioBlob;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serialisable));
      alert('Draft saved!');
    } catch {
      alert('Unable to save draft.');
    }
  };

  // ---- Aadhaar masked display ----
  const maskedAadhaar =
    formData.aadhaar.length > 4
      ? 'XXXX XXXX ' + formData.aadhaar.slice(-4)
      : formData.aadhaar;

  // =========================================================================
  // Success Screen
  // =========================================================================

  if (submitted && result) {
    const scoreColor =
      result.leadScore >= 70
        ? 'text-emerald-600'
        : result.leadScore >= 40
          ? 'text-amber-500'
          : 'text-red-500';
    const ringColor =
      result.leadScore >= 70
        ? 'stroke-emerald-500'
        : result.leadScore >= 40
          ? 'stroke-amber-500'
          : 'stroke-red-500';

    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-4 py-8">
        <div className="mx-auto max-w-lg space-y-6">
          {/* Header */}
          <div className={`${cardCls} text-center`}>
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
              <Check size={32} className="text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              Survey Submitted!
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">
              {result.riderName}&apos;s rider survey has been recorded.
            </p>
          </div>

          {/* Score Ring */}
          <div className={`${cardCls} flex flex-col items-center`}>
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-4">
              Overall Score
            </p>
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  className="stroke-zinc-200 dark:stroke-zinc-700"
                  strokeWidth="10"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  className={ringColor}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${(result.leadScore / 100) * 327} 327`}
                />
              </svg>
              <span
                className={`absolute inset-0 flex items-center justify-center text-3xl font-bold ${scoreColor}`}
              >
                {result.leadScore}
              </span>
            </div>
          </div>

          {/* AI Summary */}
          <div className={cardCls}>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-3">
              <Award size={18} className="text-blue-500" /> AI Summary
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {result.aiSummary}
            </p>
          </div>

          {/* Badges */}
          <div className={`${cardCls} flex flex-wrap gap-2`}>
            <span
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                result.leadStatus === 'interested'
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                  : result.leadStatus === 'follow_up'
                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {result.leadStatus === 'interested'
                ? 'Interested'
                : result.leadStatus === 'follow_up'
                  ? 'Follow-up'
                  : 'New Lead'}
            </span>
            {result.wouldJoinRynOne === 'yes' && (
              <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                Ready to Join
              </span>
            )}
            {result.likelihoodToJoin === 'high' && (
              <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                High Likelihood
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setSubmitted(false);
                setResult(null);
                setFormData(defaultFormData);
                setCurrentStep(0);
              }}
              className={`${btnPrimary} flex-1`}
            >
              <Plus size={18} /> New Survey
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className={`${btnSecondary} flex-1`}
            >
              <ArrowLeft size={18} /> Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Step Renderers
  // =========================================================================

  const renderStep = () => {
    switch (currentStep) {
      // ---- Step 1: Basic Information ----
      case 0:
        return (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Bike size={22} className="text-blue-500" /> Basic Information
            </h2>

            {/* Rider Name */}
            <div>
              <label className={labelCls}>
                Rider Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className={inputCls}
                placeholder="Full name"
                value={formData.riderName}
                onChange={(e) => update('riderName', e.target.value)}
              />
            </div>

            {/* Age & Gender */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Age</label>
                <input
                  type="number"
                  className={inputCls}
                  placeholder="Age"
                  value={formData.age ?? ''}
                  onChange={(e) =>
                    update('age', e.target.value ? parseInt(e.target.value) : null)
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Gender</label>
                <select
                  className={inputCls}
                  value={formData.gender}
                  onChange={(e) => update('gender', e.target.value)}
                >
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className={labelCls}>
                Phone <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                className={inputCls}
                placeholder="10-digit number"
                maxLength={10}
                value={formData.phone}
                onChange={(e) => update('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
              />
              {formData.phone.length > 0 && !/^[6-9]\d{9}$/.test(formData.phone) && (
                <p className="text-xs text-red-500 mt-1">Enter a valid 10-digit Indian mobile number</p>
              )}
            </div>

            {/* Address */}
            <div>
              <label className={labelCls}>Address</label>
              <textarea
                className={inputCls}
                rows={2}
                placeholder="Area / Locality"
                value={formData.address}
                onChange={(e) => update('address', e.target.value)}
              />
            </div>

            {/* Vehicle Type */}
            <div>
              <label className={labelCls}>Vehicle Type</label>
              <select
                className={inputCls}
                value={formData.vehicleType}
                onChange={(e) => update('vehicleType', e.target.value)}
              >
                <option value="">Select</option>
                <option value="bike">Bike</option>
                <option value="scooter">Scooter</option>
                <option value="bicycle">Bicycle</option>
                <option value="ev">EV</option>
              </select>
            </div>

            {/* License & RC */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>License Number</label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="DL number"
                  value={formData.licenseNo}
                  onChange={(e) => update('licenseNo', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>RC Number</label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="RC number"
                  value={formData.rcNumber}
                  onChange={(e) => update('rcNumber', e.target.value)}
                />
              </div>
            </div>

            {/* Insurance toggle */}
            <Toggle
              checked={formData.insurance}
              onChange={(v) => update('insurance', v)}
              label="Has Insurance"
            />

            {/* Aadhaar */}
            <div>
              <label className={labelCls}>Aadhaar Number</label>
              <input
                type="text"
                className={inputCls}
                placeholder="12-digit Aadhaar"
                maxLength={12}
                value={formData.aadhaar}
                onChange={(e) => update('aadhaar', e.target.value.replace(/\D/g, '').slice(0, 12))}
              />
              {formData.aadhaar.length > 4 && (
                <p className="text-xs text-zinc-500 mt-1">Masked: {maskedAadhaar}</p>
              )}
            </div>

            {/* PAN */}
            <div>
              <label className={labelCls}>PAN</label>
              <input
                type="text"
                className={inputCls}
                placeholder="PAN number"
                maxLength={10}
                value={formData.pan}
                onChange={(e) => update('pan', e.target.value.toUpperCase().slice(0, 10))}
              />
            </div>

            {/* GPS */}
            <div>
              <label className={labelCls}>GPS Location</label>
              <button
                type="button"
                onClick={captureGps}
                disabled={gpsLoading}
                className={btnSecondary}
              >
                <MapPin size={18} />
                {gpsLoading
                  ? 'Capturing...'
                  : formData.gpsLat
                    ? `${formData.gpsLat.toFixed(4)}, ${formData.gpsLng?.toFixed(4)}`
                    : 'Capture Location'}
              </button>
            </div>
          </div>
        );

      // ---- Step 2: Experience & Platforms ----
      case 1:
        return (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Experience & Platforms
            </h2>

            {/* Platform cards */}
            <div>
              <label className={labelCls}>Current Platforms</label>
              <div className="grid grid-cols-2 gap-3">
                {PLATFORMS.map((p) => {
                  const selected = formData.currentPlatforms.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        const next = selected
                          ? formData.currentPlatforms.filter((x) => x !== p)
                          : [...formData.currentPlatforms, p];
                        update('currentPlatforms', next);
                      }}
                      className={`px-4 py-3 rounded-lg border text-sm font-medium transition min-h-[48px] ${
                        selected
                          ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 text-blue-700 dark:text-blue-300'
                          : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-blue-400'
                      }`}
                    >
                      {selected && <Check size={14} className="inline mr-1.5" />}
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Experience */}
            <div>
              <label className={labelCls}>Experience</label>
              <div className="flex gap-3">
                <input
                  type="number"
                  className={`${inputCls} flex-1`}
                  placeholder="Duration"
                  value={formData.experienceValue ?? ''}
                  onChange={(e) =>
                    update(
                      'experienceValue',
                      e.target.value ? parseInt(e.target.value) : null,
                    )
                  }
                />
                <div className="flex rounded-lg border border-zinc-300 dark:border-zinc-700 overflow-hidden">
                  {(['months', 'years'] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => update('experienceUnit', unit)}
                      className={`px-4 py-3 text-sm font-medium transition min-h-[48px] ${
                        formData.experienceUnit === unit
                          ? 'bg-blue-600 text-white'
                          : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {unit.charAt(0).toUpperCase() + unit.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      // ---- Step 3: Earnings ----
      case 2:
        return (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Earnings
            </h2>

            {[
              { key: 'dailyEarnings' as const, label: 'Daily Earnings' },
              { key: 'monthlyEarnings' as const, label: 'Monthly Earnings' },
              { key: 'fuelCost' as const, label: 'Fuel Cost (Monthly)' },
              { key: 'maintenanceCost' as const, label: 'Maintenance Cost (Monthly)' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className={labelCls}>{label}</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">
                    &#8377;
                  </span>
                  <input
                    type="number"
                    className={`${inputCls} pl-8`}
                    placeholder="0"
                    value={formData[key] ?? ''}
                    onChange={(e) =>
                      update(key, e.target.value ? parseFloat(e.target.value) : null)
                    }
                  />
                </div>
              </div>
            ))}

            {/* Net Savings (auto-calculated) */}
            <div>
              <label className={labelCls}>Net Savings (auto-calculated)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">
                  &#8377;
                </span>
                <input
                  type="text"
                  readOnly
                  className={`${inputCls} pl-8 bg-zinc-50 dark:bg-zinc-800/50 cursor-not-allowed`}
                  value={netSavings.toLocaleString('en-IN')}
                />
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Monthly Earnings - Fuel Cost - Maintenance Cost
              </p>
            </div>
          </div>
        );

      // ---- Step 4: Working Pattern ----
      case 3:
        return (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Clock size={22} className="text-blue-500" /> Working Pattern
            </h2>

            <div>
              <label className={labelCls}>Hours per Day</label>
              <input
                type="number"
                className={inputCls}
                placeholder="e.g. 8"
                value={formData.hoursPerDay ?? ''}
                onChange={(e) =>
                  update('hoursPerDay', e.target.value ? parseInt(e.target.value) : null)
                }
              />
            </div>

            <div>
              <label className={labelCls}>Peak Hours</label>
              <input
                type="text"
                className={inputCls}
                placeholder="e.g. 12 PM - 2 PM, 7 PM - 10 PM"
                value={formData.peakHours}
                onChange={(e) => update('peakHours', e.target.value)}
              />
            </div>

            <div>
              <label className={labelCls}>Preferred Area</label>
              <input
                type="text"
                className={inputCls}
                placeholder="Area / Zone"
                value={formData.preferredArea}
                onChange={(e) => update('preferredArea', e.target.value)}
              />
            </div>

            <Toggle
              checked={formData.nightShift}
              onChange={(v) => update('nightShift', v)}
              label="Night Shift?"
            />
          </div>
        );

      // ---- Step 5: Pain Points ----
      case 4:
        return (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Pain Points
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Rate each pain point from 1 (low) to 5 (high)
            </p>

            <div className="space-y-4">
              {Object.entries(PAIN_POINT_LABELS).map(([key, label]) => (
                <div key={key} className={cardCls}>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      {label}
                    </span>
                    <StarRating
                      value={formData.painPoints[key] ?? 0}
                      onChange={(v) =>
                        update('painPoints', { ...formData.painPoints, [key]: v })
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      // ---- Step 6: Waiting & Payments ----
      case 5:
        return (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Waiting & Payments
            </h2>

            <div>
              <label className={labelCls}>Average Waiting Time (minutes)</label>
              <input
                type="number"
                className={inputCls}
                placeholder="Minutes"
                value={formData.averageWaiting ?? ''}
                onChange={(e) =>
                  update(
                    'averageWaiting',
                    e.target.value ? parseInt(e.target.value) : null,
                  )
                }
              />
            </div>

            {/* Who should pay */}
            <div>
              <label className={labelCls}>Who Should Pay for Wait?</label>
              <div className="space-y-2">
                {['Restaurant', 'Platform', 'Nobody'].map((opt) => (
                  <label
                    key={opt}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition min-h-[48px] ${
                      formData.whoShouldPayWait === opt.toLowerCase()
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-zinc-300 dark:border-zinc-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="whoShouldPayWait"
                      className="accent-blue-600 w-5 h-5"
                      checked={formData.whoShouldPayWait === opt.toLowerCase()}
                      onChange={() => update('whoShouldPayWait', opt.toLowerCase())}
                    />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">{opt}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Understands payout */}
            <div>
              <label className={labelCls}>Do you understand payout structure?</label>
              <div className="space-y-2">
                {['Yes', 'No', 'Sometimes'].map((opt) => (
                  <label
                    key={opt}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition min-h-[48px] ${
                      formData.understandsPayout === opt.toLowerCase()
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-zinc-300 dark:border-zinc-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="understandsPayout"
                      className="accent-blue-600 w-5 h-5"
                      checked={formData.understandsPayout === opt.toLowerCase()}
                      onChange={() => update('understandsPayout', opt.toLowerCase())}
                    />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">{opt}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Satisfaction slider */}
            <div>
              <label className={labelCls}>
                Current Company Satisfaction: {formData.satisfactionRating}/10
              </label>
              <input
                type="range"
                min={1}
                max={10}
                value={formData.satisfactionRating}
                onChange={(e) => update('satisfactionRating', parseInt(e.target.value))}
                className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-xs text-zinc-400 mt-1">
                <span>1</span>
                <span>5</span>
                <span>10</span>
              </div>
            </div>

            {/* Recommend */}
            <Toggle
              checked={formData.wouldRecommend}
              onChange={(v) => update('wouldRecommend', v)}
              label="Would recommend to a friend?"
            />
          </div>
        );

      // ---- Step 7: Benefits & Switching ----
      case 6:
        return (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Benefits & Switching
            </h2>

            {/* Desired Benefits */}
            <div>
              <label className={labelCls}>Desired Benefits</label>
              <div className="grid grid-cols-2 gap-3">
                {BENEFITS.map((b) => {
                  const selected = formData.wantedBenefits.includes(b);
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => {
                        const next = selected
                          ? formData.wantedBenefits.filter((x) => x !== b)
                          : [...formData.wantedBenefits, b];
                        update('wantedBenefits', next);
                      }}
                      className={`px-4 py-3 rounded-lg border text-sm font-medium transition text-left min-h-[48px] ${
                        selected
                          ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 text-blue-700 dark:text-blue-300'
                          : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-blue-400'
                      }`}
                    >
                      {selected && <Check size={14} className="inline mr-1.5" />}
                      {b}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Would join RynOne */}
            <div>
              <label className={labelCls}>
                Would you join RynOne if it offers transparent earnings, 100% delivery fee,
                waiting compensation, better support, predictable income?
              </label>
              <div className="space-y-2">
                {[
                  { value: 'yes', label: 'Yes' },
                  { value: 'no', label: 'No' },
                  { value: 'maybe', label: 'Maybe' },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition min-h-[48px] ${
                      formData.wouldJoinRynOne === opt.value
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-zinc-300 dark:border-zinc-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="wouldJoinRynOne"
                      className="accent-blue-600 w-5 h-5"
                      checked={formData.wouldJoinRynOne === opt.value}
                      onChange={() => update('wouldJoinRynOne', opt.value)}
                    />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">
                      {opt.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Feature Voting */}
            <div>
              <label className={labelCls}>Feature Voting (rate 1-5)</label>
              <div className="space-y-4">
                {Object.entries(FEATURE_LABELS).map(([key, label]) => (
                  <div key={key} className={cardCls}>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        {label}
                      </span>
                      <StarRating
                        value={formData.featureVotes[key] ?? 0}
                        onChange={(v) =>
                          update('featureVotes', { ...formData.featureVotes, [key]: v })
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      // ---- Step 8: Documents & Voice ----
      case 7:
        return (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <FileText size={22} className="text-blue-500" /> Documents & Voice
            </h2>

            {/* File uploads */}
            <div className="space-y-3">
              {DOCUMENT_TYPES.map(({ key, label }) => (
                <div key={key} className={cardCls}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      {label}
                    </span>
                    <label className={`${btnSecondary} text-sm cursor-pointer`}>
                      <Upload size={16} />
                      {formData.documents[key] ? formData.documents[key]!.name : 'Upload'}
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*,.pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          update('documents', { ...formData.documents, [key]: file });
                        }}
                      />
                    </label>
                  </div>
                  {formData.documents[key] && (
                    <button
                      type="button"
                      onClick={() =>
                        update('documents', { ...formData.documents, [key]: null })
                      }
                      className="text-xs text-red-500 mt-2 flex items-center gap-1"
                    >
                      <X size={12} /> Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Audio recorder */}
            <AudioRecorder
              audioBlob={formData.audioBlob}
              onRecorded={(blob) => update('audioBlob', blob)}
            />

            {/* Market feedback */}
            <div>
              <label className={labelCls}>
                If you were building a delivery platform, what would you do differently?
              </label>
              <textarea
                className={inputCls}
                rows={4}
                placeholder="Share your thoughts..."
                value={formData.marketFeedback}
                onChange={(e) => update('marketFeedback', e.target.value)}
              />
            </div>
          </div>
        );

      // ---- Step 9: AI Observation ----
      case 8:
        return (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Award size={22} className="text-blue-500" /> AI Observation (BDE)
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              BDE assessment of the rider
            </p>

            {/* Ratings */}
            {[
              { key: 'professionalism' as const, label: 'Professionalism' },
              { key: 'communication' as const, label: 'Communication' },
              { key: 'vehicleCondition' as const, label: 'Vehicle Condition' },
            ].map(({ key, label }) => (
              <div key={key} className={cardCls}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {label}
                  </span>
                  <StarRating
                    value={formData[key]}
                    onChange={(v) => update(key, v)}
                  />
                </div>
              </div>
            ))}

            {/* Documents Complete */}
            <Toggle
              checked={formData.documentsComplete}
              onChange={(v) => update('documentsComplete', v)}
              label="Documents Complete?"
            />

            {/* Risk Level */}
            <div>
              <label className={labelCls}>Risk Level</label>
              <select
                className={inputCls}
                value={formData.riskLevel}
                onChange={(e) => update('riskLevel', e.target.value)}
              >
                <option value="">Select</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            {/* Likelihood to Join */}
            <div>
              <label className={labelCls}>Likelihood to Join</label>
              <select
                className={inputCls}
                value={formData.likelihoodToJoin}
                onChange={(e) => update('likelihoodToJoin', e.target.value)}
              >
                <option value="">Select</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            {/* Additional Notes */}
            <div>
              <label className={labelCls}>Additional Notes</label>
              <textarea
                className={inputCls}
                rows={4}
                placeholder="Any observations..."
                value={formData.additionalNotes}
                onChange={(e) => update('additionalNotes', e.target.value)}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // =========================================================================
  // Main Render
  // =========================================================================

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Step indicator */}
      <div className="sticky top-0 z-20 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="px-4 py-3">
          <div
            ref={stepScrollRef}
            className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
            style={{ scrollbarWidth: 'none' }}
          >
            {STEPS.map((label, i) => {
              const done = i < currentStep;
              const active = i === currentStep;
              return (
                <button
                  key={i}
                  type="button"
                  data-active={active}
                  onClick={() => {
                    if (i <= currentStep) setCurrentStep(i);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition min-h-[40px] ${
                    active
                      ? 'bg-blue-600 text-white'
                      : done
                        ? 'bg-emerald-500 text-white'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  {done ? (
                    <Check size={14} />
                  ) : (
                    <span className="w-5 h-5 flex items-center justify-center rounded-full bg-white/20 text-[10px]">
                      {i + 1}
                    </span>
                  )}
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Form content */}
      <div className="px-4 py-6 max-w-2xl mx-auto">{renderStep()}</div>

      {/* Bottom navigation */}
      <div className="sticky bottom-0 z-20 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {currentStep > 0 && (
            <button
              type="button"
              onClick={() => setCurrentStep((s) => s - 1)}
              className={btnSecondary}
            >
              <ChevronLeft size={18} /> Back
            </button>
          )}

          <button type="button" onClick={saveDraft} className={`${btnSecondary} ml-auto`}>
            <Save size={18} />
            <span className="hidden sm:inline">Save Draft</span>
          </button>

          {currentStep < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setCurrentStep((s) => s + 1)}
              disabled={!canProceed()}
              className={btnPrimary}
            >
              Next <ChevronRight size={18} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !canProceed()}
              className={btnPrimary}
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send size={18} /> Submit
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
