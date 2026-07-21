'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  MapPin, Check, ChevronLeft, ChevronRight, Save, Send,
  Upload, X, Mic, Square, Play, Pause, Star, Plus,
  CheckCircle2, FileText, Camera, CreditCard, ClipboardList,
  Building2, BarChart3, MessageSquare, Sparkles, Vote,
  AudioLines, ArrowLeft,
} from 'lucide-react';
import { uploadSurveyFiles } from '@/lib/upload';

// ─── Types ───────────────────────────────────────────────────────────────────

interface FormData {
  // Step 1: Business Profile
  businessName: string;
  ownerName: string;
  mobile: string;
  whatsapp: string;
  whatsappSameAsMobile: boolean;
  email: string;
  address: string;
  gpsLat: number | null;
  gpsLng: number | null;
  gpsStatus: 'idle' | 'loading' | 'success' | 'error';
  category: string;

  // Step 2: Business Information
  yearsInBusiness: number | null;
  numberOfBranches: number | null;
  employees: number | null;
  seatingCapacity: number | null;
  businessHours: string;
  weeklyOff: string;
  homeDelivery: boolean;
  ownDeliveryStaff: boolean;
  ownWebsite: boolean;
  ownMobileApp: boolean;
  ownWhatsappOrdering: boolean;

  // Step 3: Online Presence
  onlinePlatforms: string[];

  // Step 4: Business Numbers
  dailyOrdersWalkIn: number | null;
  dailyOrdersOnline: number | null;
  dailyOrdersPhone: number | null;
  dailyOrdersWhatsapp: number | null;
  averageOrderValue: number | null;
  monthlyRevenue: number | null;
  peakHours: string;
  bestSellingProducts: string;

  // Step 5: Pain Points
  painPoints: Record<string, number>;

  // Step 6: Commission
  currentCommission: number | null;
  platformCommissions: Record<string, number>;
  deliveryCharges: number | null;
  whoPaysDelvery: string;
  whoPaysPackaging: string;
  whoPaysPromotions: string;
  whoPaysDiscounts: string;

  // Step 7: Settlements
  settlementFrequency: string;
  settlementProblems: string;

  // Step 8: Marketing
  marketingChannels: string[];

  // Step 9: AI Interest
  aiInterests: string[];

  // Step 10: RynOne Validation
  wouldJoinRynOne: string;

  // Step 11: Feature Voting
  featureVotes: Record<string, number>;

  // Step 12: Documents
  documents: Record<string, File | null>;
  documentPreviews: Record<string, string>;

  // Step 13: Voice of the Market
  marketFeedback: string;
  voiceNote: Blob | null;
  voiceNoteUrl: string;
  additionalNotes: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  'Restaurant', 'Kirana', 'Supermarket', 'Pharmacy', 'Bakery', 'Cafe',
  'Fruits & Vegetables', 'Meat Shop', 'Pet Shop', 'Electronics',
  'Stationery', 'Flower Shop', 'Others',
];

const WEEKLY_OFFS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'None'];

const ONLINE_PLATFORMS = [
  'Swiggy', 'Zomato', 'Magicpin', 'ONDC', 'Dunzo',
  'Blinkit', 'Zepto', 'Amazon', 'Flipkart', 'None',
];

const PAIN_POINT_LABELS = [
  'High Commission', 'Low Profit Margin', 'Rider Delay', 'Order Cancellations',
  'Fake Reviews', 'Poor Customer Support', 'Payment Delay', 'Hidden Charges',
  'App Issues', 'Promotions Too Costly', 'Customer Acquisition',
  'Inventory Management', 'Menu Updates', 'Delivery Delay', 'Packaging Issues',
];

const MARKETING_CHANNELS = [
  'Google', 'Instagram', 'Word of Mouth', 'Swiggy', 'Zomato', 'WhatsApp', 'Others',
];

const AI_INTERESTS = [
  'Inventory', 'Demand Prediction', 'Sales Analytics', 'WhatsApp Orders',
  'Customer Support', 'Marketing', 'Menu Suggestions', 'Price Suggestions',
];

const RYNONE_FEATURES = [
  'Lower Commission Rates',
  'Transparent Pricing (No Hidden Charges)',
  'Dedicated Business Support',
  'Faster Settlements (Daily/Weekly)',
  'AI-Powered Insights & Analytics',
];

const FEATURE_VOTE_LABELS = [
  'Real-time Analytics', 'Customer Database', 'WhatsApp Orders',
  'Loyalty Program', 'Subscription Orders', 'Inventory Alerts',
  'Sales Reports', 'AI Insights', 'CRM', 'Order Forecasting',
];

const DOCUMENT_FIELDS: { key: string; label: string; required: boolean }[] = [
  { key: 'gstDoc', label: 'GST Certificate', required: false },
  { key: 'fssaiDoc', label: 'FSSAI License', required: false },
  { key: 'panDoc', label: 'PAN Card', required: false },
  { key: 'visitingCard', label: 'Visiting Card', required: false },
  { key: 'menuPhoto', label: 'Menu Photo', required: false },
  { key: 'shopPhoto', label: 'Shop Photo', required: false },
  { key: 'ownerPhoto', label: 'Owner Photo', required: true },
  { key: 'shopFrontPhoto', label: 'Shop Front Photo', required: true },
];

const WHO_PAYS_OPTIONS = ['Business', 'Platform', 'Shared', 'Customer'];

const STEP_LABELS = [
  'Business Profile', 'Business Info', 'Online Presence', 'Business Numbers',
  'Pain Points', 'Commission', 'Settlements', 'Marketing',
  'AI Interest', 'RynOne', 'Feature Voting', 'Documents', 'Voice',
];

const STEP_ICONS = [
  Building2, ClipboardList, BarChart3, BarChart3,
  Star, CreditCard, FileText, MessageSquare,
  Sparkles, CheckCircle2, Vote, Camera, AudioLines,
];

const INITIAL_FORM_DATA: FormData = {
  businessName: '', ownerName: '', mobile: '', whatsapp: '',
  whatsappSameAsMobile: false, email: '', address: '',
  gpsLat: null, gpsLng: null, gpsStatus: 'idle', category: '',
  yearsInBusiness: null, numberOfBranches: null, employees: null,
  seatingCapacity: null, businessHours: '', weeklyOff: '',
  homeDelivery: false, ownDeliveryStaff: false, ownWebsite: false,
  ownMobileApp: false, ownWhatsappOrdering: false,
  onlinePlatforms: [],
  dailyOrdersWalkIn: null, dailyOrdersOnline: null,
  dailyOrdersPhone: null, dailyOrdersWhatsapp: null,
  averageOrderValue: null, monthlyRevenue: null, peakHours: '', bestSellingProducts: '',
  painPoints: {},
  currentCommission: null, platformCommissions: {}, deliveryCharges: null,
  whoPaysDelvery: '', whoPaysPackaging: '', whoPaysPromotions: '', whoPaysDiscounts: '',
  settlementFrequency: '', settlementProblems: '',
  marketingChannels: [],
  aiInterests: [],
  wouldJoinRynOne: '',
  featureVotes: {},
  documents: {}, documentPreviews: {},
  marketFeedback: '', voiceNote: null, voiceNoteUrl: '', additionalNotes: '',
};

const AUTOSAVE_KEY = 'cortex_vendor_survey_draft';

// ─── Shared UI Components ────────────────────────────────────────────────────

const inputClass =
  'w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition min-h-[48px]';

const cardClass =
  'bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6';

const sectionTitleClass = 'text-lg font-semibold text-zinc-900 dark:text-zinc-100';

function SectionTitle({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h2 className={sectionTitleClass}>{children}</h2>
      {subtitle && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{subtitle}</p>
      )}
    </div>
  );
}

function FieldLabel({ children, required, htmlFor }: { children: React.ReactNode; required?: boolean; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
      {children}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-500 mt-1">{message}</p>;
}

function ToggleSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between py-3 cursor-pointer">
      <span className="text-sm text-zinc-700 dark:text-zinc-300">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-zinc-300 dark:bg-zinc-600'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  );
}

function SelectableCard({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all min-h-[48px] ${
        selected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
          : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600'
      }`}
    >
      {selected && <Check className="inline-block w-4 h-4 mr-1.5 -mt-0.5" />}
      {label}
    </button>
  );
}

function RatingSelector({
  value,
  onChange,
  max = 5,
}: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
}) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
            n <= value
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-600'
          }`}
          aria-label={`Rate ${n} of ${max}`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// ─── Step Components ─────────────────────────────────────────────────────────

function Step1BusinessProfile({
  data,
  onChange,
  errors,
}: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
  errors: Record<string, string>;
}) {
  const captureGPS = () => {
    onChange({ gpsStatus: 'loading' });
    if (!navigator.geolocation) {
      onChange({ gpsStatus: 'error' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          gpsLat: pos.coords.latitude,
          gpsLng: pos.coords.longitude,
          gpsStatus: 'success',
        });
      },
      () => onChange({ gpsStatus: 'error' }),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  return (
    <div className="space-y-5">
      <SectionTitle subtitle="Basic details about the business">Business Profile</SectionTitle>

      <div>
        <FieldLabel required htmlFor="businessName">Business Name</FieldLabel>
        <input id="businessName" type="text" className={inputClass} placeholder="Enter business name"
          value={data.businessName} onChange={(e) => onChange({ businessName: e.target.value })} />
        <FieldError message={errors.businessName} />
      </div>

      <div>
        <FieldLabel required htmlFor="ownerName">Owner Name</FieldLabel>
        <input id="ownerName" type="text" className={inputClass} placeholder="Enter owner name"
          value={data.ownerName} onChange={(e) => onChange({ ownerName: e.target.value })} />
        <FieldError message={errors.ownerName} />
      </div>

      <div>
        <FieldLabel required htmlFor="mobile">Mobile Number</FieldLabel>
        <input id="mobile" type="tel" className={inputClass} placeholder="10-digit mobile number"
          maxLength={10} value={data.mobile}
          onChange={(e) => onChange({ mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
        <FieldError message={errors.mobile} />
      </div>

      <div>
        <label className="flex items-center gap-2 mb-2 cursor-pointer">
          <input type="checkbox" checked={data.whatsappSameAsMobile}
            onChange={(e) =>
              onChange({
                whatsappSameAsMobile: e.target.checked,
                whatsapp: e.target.checked ? data.mobile : data.whatsapp,
              })
            }
            className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
          <span className="text-sm text-zinc-600 dark:text-zinc-400">WhatsApp same as mobile</span>
        </label>
        {!data.whatsappSameAsMobile && (
          <div>
            <FieldLabel htmlFor="whatsapp">WhatsApp Number</FieldLabel>
            <input id="whatsapp" type="tel" className={inputClass} placeholder="WhatsApp number"
              maxLength={10} value={data.whatsapp}
              onChange={(e) => onChange({ whatsapp: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
          </div>
        )}
      </div>

      <div>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <input id="email" type="email" className={inputClass} placeholder="Email address (optional)"
          value={data.email} onChange={(e) => onChange({ email: e.target.value })} />
      </div>

      <div>
        <FieldLabel required htmlFor="address">Address</FieldLabel>
        <textarea id="address" className={inputClass + ' min-h-[80px] resize-none'} placeholder="Full business address"
          value={data.address} onChange={(e) => onChange({ address: e.target.value })} />
        <FieldError message={errors.address} />
      </div>

      <div>
        <FieldLabel>GPS Location</FieldLabel>
        <button type="button" onClick={captureGPS}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg border transition min-h-[48px] w-full ${
            data.gpsStatus === 'success'
              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
              : data.gpsStatus === 'error'
              ? 'border-red-500 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300'
              : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-750'
          }`}
        >
          {data.gpsStatus === 'loading' ? (
            <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          ) : data.gpsStatus === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          ) : (
            <MapPin className="w-4 h-4" />
          )}
          {data.gpsStatus === 'success'
            ? `Location captured (${data.gpsLat?.toFixed(4)}, ${data.gpsLng?.toFixed(4)})`
            : data.gpsStatus === 'loading'
            ? 'Capturing location...'
            : data.gpsStatus === 'error'
            ? 'Failed - Tap to retry'
            : 'Capture GPS Location'}
        </button>
      </div>

      <div>
        <FieldLabel required htmlFor="category">Category</FieldLabel>
        <select id="category" className={inputClass}
          value={data.category} onChange={(e) => onChange({ category: e.target.value })}>
          <option value="">Select category</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <FieldError message={errors.category} />
      </div>
    </div>
  );
}

function Step2BusinessInfo({
  data,
  onChange,
}: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}) {
  const showSeating = data.category === 'Restaurant' || data.category === 'Cafe';

  return (
    <div className="space-y-5">
      <SectionTitle subtitle="Operational details">Business Information</SectionTitle>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <FieldLabel htmlFor="yearsInBusiness">Years in Business</FieldLabel>
          <input id="yearsInBusiness" type="number" className={inputClass} placeholder="0"
            min={0} value={data.yearsInBusiness ?? ''}
            onChange={(e) => onChange({ yearsInBusiness: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <div>
          <FieldLabel htmlFor="numberOfBranches">Number of Branches</FieldLabel>
          <input id="numberOfBranches" type="number" className={inputClass} placeholder="1"
            min={0} value={data.numberOfBranches ?? ''}
            onChange={(e) => onChange({ numberOfBranches: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <div>
          <FieldLabel htmlFor="employees">Employees</FieldLabel>
          <input id="employees" type="number" className={inputClass} placeholder="0"
            min={0} value={data.employees ?? ''}
            onChange={(e) => onChange({ employees: e.target.value ? Number(e.target.value) : null })} />
        </div>
        {showSeating && (
          <div>
            <FieldLabel htmlFor="seatingCapacity">Seating Capacity</FieldLabel>
            <input id="seatingCapacity" type="number" className={inputClass} placeholder="0"
              min={0} value={data.seatingCapacity ?? ''}
              onChange={(e) => onChange({ seatingCapacity: e.target.value ? Number(e.target.value) : null })} />
          </div>
        )}
      </div>

      <div>
        <FieldLabel htmlFor="businessHours">Business Hours</FieldLabel>
        <input id="businessHours" type="text" className={inputClass} placeholder="e.g. 9 AM - 10 PM"
          value={data.businessHours} onChange={(e) => onChange({ businessHours: e.target.value })} />
      </div>

      <div>
        <FieldLabel htmlFor="weeklyOff">Weekly Off</FieldLabel>
        <select id="weeklyOff" className={inputClass}
          value={data.weeklyOff} onChange={(e) => onChange({ weeklyOff: e.target.value })}>
          <option value="">Select day</option>
          {WEEKLY_OFFS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <div className={cardClass}>
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Services & Capabilities</p>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          <ToggleSwitch label="Home Delivery" checked={data.homeDelivery}
            onChange={(v) => onChange({ homeDelivery: v })} />
          <ToggleSwitch label="Own Delivery Staff" checked={data.ownDeliveryStaff}
            onChange={(v) => onChange({ ownDeliveryStaff: v })} />
          <ToggleSwitch label="Own Website" checked={data.ownWebsite}
            onChange={(v) => onChange({ ownWebsite: v })} />
          <ToggleSwitch label="Own Mobile App" checked={data.ownMobileApp}
            onChange={(v) => onChange({ ownMobileApp: v })} />
          <ToggleSwitch label="WhatsApp Ordering" checked={data.ownWhatsappOrdering}
            onChange={(v) => onChange({ ownWhatsappOrdering: v })} />
        </div>
      </div>
    </div>
  );
}

function Step3OnlinePresence({
  data,
  onChange,
}: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}) {
  const toggle = (platform: string) => {
    const current = data.onlinePlatforms;
    if (platform === 'None') {
      onChange({ onlinePlatforms: current.includes('None') ? [] : ['None'] });
      return;
    }
    const without = current.filter((p) => p !== 'None');
    onChange({
      onlinePlatforms: without.includes(platform)
        ? without.filter((p) => p !== platform)
        : [...without, platform],
    });
  };

  return (
    <div className="space-y-5">
      <SectionTitle subtitle="Which platforms is the business listed on?">Online Presence</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {ONLINE_PLATFORMS.map((p) => (
          <SelectableCard
            key={p}
            label={p}
            selected={data.onlinePlatforms.includes(p)}
            onClick={() => toggle(p)}
          />
        ))}
      </div>
    </div>
  );
}

function Step4BusinessNumbers({
  data,
  onChange,
}: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}) {
  return (
    <div className="space-y-5">
      <SectionTitle subtitle="Daily order volumes and revenue details">Business Numbers</SectionTitle>

      <div className={cardClass}>
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">Average Daily Orders</p>
        <div className="grid grid-cols-2 gap-4">
          {([
            ['dailyOrdersWalkIn', 'Walk-in'],
            ['dailyOrdersOnline', 'Online'],
            ['dailyOrdersPhone', 'Phone'],
            ['dailyOrdersWhatsapp', 'WhatsApp'],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <FieldLabel htmlFor={key}>{label}</FieldLabel>
              <input id={key} type="number" className={inputClass} placeholder="0"
                min={0} value={data[key] ?? ''}
                onChange={(e) => onChange({ [key]: e.target.value ? Number(e.target.value) : null })} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="averageOrderValue">Average Order Value</FieldLabel>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-medium">&#8377;</span>
          <input id="averageOrderValue" type="number" className={inputClass + ' pl-8'} placeholder="0"
            min={0} value={data.averageOrderValue ?? ''}
            onChange={(e) => onChange({ averageOrderValue: e.target.value ? Number(e.target.value) : null })} />
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="monthlyRevenue">Monthly Revenue <span className="text-zinc-400 font-normal">(optional)</span></FieldLabel>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-medium">&#8377;</span>
          <input id="monthlyRevenue" type="number" className={inputClass + ' pl-8'} placeholder="0"
            min={0} value={data.monthlyRevenue ?? ''}
            onChange={(e) => onChange({ monthlyRevenue: e.target.value ? Number(e.target.value) : null })} />
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="peakHours">Peak Hours</FieldLabel>
        <input id="peakHours" type="text" className={inputClass} placeholder="e.g. 12 PM - 2 PM, 7 PM - 9 PM"
          value={data.peakHours} onChange={(e) => onChange({ peakHours: e.target.value })} />
      </div>

      <div>
        <FieldLabel htmlFor="bestSellingProducts">Best Selling Products</FieldLabel>
        <textarea id="bestSellingProducts" className={inputClass + ' min-h-[80px] resize-none'}
          placeholder="List top-selling items" value={data.bestSellingProducts}
          onChange={(e) => onChange({ bestSellingProducts: e.target.value })} />
      </div>
    </div>
  );
}

function Step5PainPoints({
  data,
  onChange,
}: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}) {
  const setRating = (label: string, val: number) => {
    onChange({ painPoints: { ...data.painPoints, [label]: val } });
  };

  return (
    <div className="space-y-5">
      <SectionTitle subtitle="Rate each pain point from 1 (minor) to 5 (critical)">
        <span className="flex items-center gap-2">
          Pain Points <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
        </span>
      </SectionTitle>

      <div className="space-y-1">
        {PAIN_POINT_LABELS.map((label) => (
          <div key={label} className="flex items-center justify-between py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
            <span className="text-sm text-zinc-700 dark:text-zinc-300 flex-1 mr-3">{label}</span>
            <RatingSelector
              value={data.painPoints[label] || 0}
              onChange={(v) => setRating(label, v)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function Step6Commission({
  data,
  onChange,
}: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}) {
  const activePlatforms = data.onlinePlatforms.filter((p) => p !== 'None');

  const setCommission = (platform: string, val: number | null) => {
    onChange({ platformCommissions: { ...data.platformCommissions, [platform]: val ?? 0 } });
  };

  return (
    <div className="space-y-5">
      <SectionTitle subtitle="Commission rates and cost sharing">Commission Details</SectionTitle>

      <div>
        <FieldLabel htmlFor="currentCommission">Current Commission %</FieldLabel>
        <div className="relative">
          <input id="currentCommission" type="number" className={inputClass + ' pr-8'} placeholder="0"
            min={0} max={100} value={data.currentCommission ?? ''}
            onChange={(e) => onChange({ currentCommission: e.target.value ? Number(e.target.value) : null })} />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 font-medium">%</span>
        </div>
      </div>

      {activePlatforms.length > 0 && (
        <div className={cardClass}>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">Platform-wise Commission</p>
          <div className="space-y-3">
            {activePlatforms.map((p) => (
              <div key={p} className="flex items-center gap-3">
                <span className="text-sm text-zinc-600 dark:text-zinc-400 w-24 shrink-0">{p}</span>
                <div className="relative flex-1">
                  <input type="number" className={inputClass + ' pr-8'} placeholder="0"
                    min={0} max={100} value={data.platformCommissions[p] ?? ''}
                    onChange={(e) => setCommission(p, e.target.value ? Number(e.target.value) : null)} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <FieldLabel htmlFor="deliveryCharges">Delivery Charges</FieldLabel>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-medium">&#8377;</span>
          <input id="deliveryCharges" type="number" className={inputClass + ' pl-8'} placeholder="0"
            min={0} value={data.deliveryCharges ?? ''}
            onChange={(e) => onChange({ deliveryCharges: e.target.value ? Number(e.target.value) : null })} />
        </div>
      </div>

      <div className={cardClass}>
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">Who Pays For?</p>
        <div className="space-y-4">
          {([
            ['whoPaysDelvery', 'Delivery'],
            ['whoPaysPackaging', 'Packaging'],
            ['whoPaysPromotions', 'Promotions'],
            ['whoPaysDiscounts', 'Discounts'],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <FieldLabel htmlFor={key}>{label}</FieldLabel>
              <select id={key} className={inputClass} value={data[key]}
                onChange={(e) => onChange({ [key]: e.target.value })}>
                <option value="">Select</option>
                {WHO_PAYS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Step7Settlements({
  data,
  onChange,
}: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}) {
  return (
    <div className="space-y-5">
      <SectionTitle subtitle="How and when payments are settled">Settlements</SectionTitle>

      <div>
        <FieldLabel>Settlement Frequency</FieldLabel>
        <div className="space-y-2 mt-2">
          {['Daily', 'Weekly', 'Monthly'].map((freq) => (
            <label key={freq} className="flex items-center gap-3 py-3 px-4 rounded-lg border border-zinc-200 dark:border-zinc-700 cursor-pointer transition hover:bg-zinc-50 dark:hover:bg-zinc-800">
              <input type="radio" name="settlementFrequency"
                checked={data.settlementFrequency === freq}
                onChange={() => onChange({ settlementFrequency: freq })}
                className="w-4 h-4 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">{freq}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="settlementProblems">Settlement Problems</FieldLabel>
        <textarea id="settlementProblems" className={inputClass + ' min-h-[100px] resize-none'}
          placeholder="Any issues with payment settlements?" value={data.settlementProblems}
          onChange={(e) => onChange({ settlementProblems: e.target.value })} />
      </div>
    </div>
  );
}

function Step8Marketing({
  data,
  onChange,
}: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}) {
  const toggle = (channel: string) => {
    const current = data.marketingChannels;
    onChange({
      marketingChannels: current.includes(channel)
        ? current.filter((c) => c !== channel)
        : [...current, channel],
    });
  };

  return (
    <div className="space-y-5">
      <SectionTitle subtitle="How do customers find this business?">Marketing Channels</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {MARKETING_CHANNELS.map((ch) => (
          <SelectableCard
            key={ch}
            label={ch}
            selected={data.marketingChannels.includes(ch)}
            onClick={() => toggle(ch)}
          />
        ))}
      </div>
    </div>
  );
}

function Step9AIInterest({
  data,
  onChange,
}: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}) {
  const toggle = (interest: string) => {
    const current = data.aiInterests;
    onChange({
      aiInterests: current.includes(interest)
        ? current.filter((i) => i !== interest)
        : [...current, interest],
    });
  };

  return (
    <div className="space-y-5">
      <SectionTitle subtitle="Which AI-powered features would help this business?">AI Interest</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {AI_INTERESTS.map((ai) => (
          <SelectableCard
            key={ai}
            label={ai}
            selected={data.aiInterests.includes(ai)}
            onClick={() => toggle(ai)}
          />
        ))}
      </div>
    </div>
  );
}

function Step10RynOneValidation({
  data,
  onChange,
}: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}) {
  const options = ['Immediately', 'Within 3 Months', 'Maybe', 'No'];

  return (
    <div className="space-y-5">
      <SectionTitle subtitle="Platform interest validation">RynOne Validation</SectionTitle>

      <div className={cardClass}>
        <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-4 leading-relaxed">
          If a platform offers lower commission, transparent pricing, better support, faster
          settlements, and AI insights &mdash; would you join?
        </p>
        <div className="space-y-2 mb-6">
          {RYNONE_FEATURES.map((feature) => (
            <div key={feature} className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{feature}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {options.map((opt) => (
          <label key={opt} className={`flex items-center gap-3 py-3 px-4 rounded-lg border-2 cursor-pointer transition ${
            data.wouldJoinRynOne === opt
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
              : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'
          }`}>
            <input type="radio" name="wouldJoinRynOne"
              checked={data.wouldJoinRynOne === opt}
              onChange={() => onChange({ wouldJoinRynOne: opt })}
              className="w-4 h-4 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{opt}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function Step11FeatureVoting({
  data,
  onChange,
}: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}) {
  const setRating = (label: string, val: number) => {
    onChange({ featureVotes: { ...data.featureVotes, [label]: val } });
  };

  return (
    <div className="space-y-5">
      <SectionTitle subtitle="Rate the importance of each feature (1-5)">Feature Voting</SectionTitle>

      <div className="space-y-1">
        {FEATURE_VOTE_LABELS.map((label) => (
          <div key={label} className="flex items-center justify-between py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
            <span className="text-sm text-zinc-700 dark:text-zinc-300 flex-1 mr-3">{label}</span>
            <RatingSelector
              value={data.featureVotes[label] || 0}
              onChange={(v) => setRating(label, v)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function Step12Documents({
  data,
  onChange,
}: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}) {
  const handleFile = (key: string, file: File | null) => {
    // Revoke previous preview URL
    const prevUrl = data.documentPreviews[key];
    if (prevUrl) URL.revokeObjectURL(prevUrl);

    const newDocs = { ...data.documents, [key]: file };
    const newPreviews = { ...data.documentPreviews };

    if (file) {
      newPreviews[key] = URL.createObjectURL(file);
    } else {
      delete newPreviews[key];
    }

    onChange({ documents: newDocs, documentPreviews: newPreviews });
  };

  return (
    <div className="space-y-5">
      <SectionTitle subtitle="Upload business documents and photos">Documents &amp; Photos</SectionTitle>

      <div className="grid grid-cols-2 gap-4">
        {DOCUMENT_FIELDS.map(({ key, label, required }) => (
          <div key={key} className="relative">
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
              {label}
              {required ? (
                <span className="text-red-500 ml-1">*</span>
              ) : (
                <span className="text-zinc-400 ml-1">(optional)</span>
              )}
            </p>

            {data.documents[key] ? (
              <div className="relative w-full aspect-square rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden bg-zinc-50 dark:bg-zinc-800">
                {data.documents[key]?.type.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={data.documentPreviews[key]}
                    alt={label}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <FileText className="w-8 h-8 text-zinc-400" />
                    <p className="text-xs text-zinc-500 mt-1 text-center px-2 truncate">
                      {data.documents[key]?.name}
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleFile(key, null)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-sm"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full aspect-square rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-600 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 transition">
                <Upload className="w-6 h-6 text-zinc-400 mb-1" />
                <span className="text-xs text-zinc-500">Upload</span>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => handleFile(key, e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Step13VoiceOfMarket({
  data,
  onChange,
}: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        onChange({ voiceNote: blob, voiceNoteUrl: url });
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      alert('Could not access microphone. Please grant permission and try again.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const playAudio = () => {
    if (!data.voiceNoteUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(data.voiceNoteUrl);
      audioRef.current.onended = () => setPlaying(false);
    }
    if (playing) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  const deleteRecording = () => {
    if (data.voiceNoteUrl) URL.revokeObjectURL(data.voiceNoteUrl);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    onChange({ voiceNote: null, voiceNoteUrl: '' });
    setPlaying(false);
    setRecordingTime(0);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <div className="space-y-5">
      <SectionTitle subtitle="Capture the vendor's perspective in their own words">
        Voice of the Market
      </SectionTitle>

      <div>
        <FieldLabel htmlFor="marketFeedback">
          If you were the founder of a new delivery platform, what is the one thing you would do differently?
        </FieldLabel>
        <textarea
          id="marketFeedback"
          className={inputClass + ' min-h-[120px] resize-none'}
          placeholder="Type the vendor's response..."
          value={data.marketFeedback}
          onChange={(e) => onChange({ marketFeedback: e.target.value })}
        />
      </div>

      <div className={cardClass}>
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">
          Voice Note <span className="text-zinc-400 font-normal">(optional)</span>
        </p>

        {!data.voiceNoteUrl && !recording ? (
          <button
            type="button"
            onClick={startRecording}
            className="flex items-center gap-2 px-4 py-3 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition min-h-[48px] w-full justify-center"
          >
            <Mic className="w-4 h-4" />
            Start Recording
          </button>
        ) : recording ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-3">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-mono text-zinc-700 dark:text-zinc-300">
                Recording {formatTime(recordingTime)}
              </span>
            </div>
            {/* Simple waveform animation */}
            <div className="flex items-center justify-center gap-0.5 h-8">
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-red-500 rounded-full animate-pulse"
                  style={{
                    height: `${12 + Math.sin(i * 0.8 + recordingTime) * 10}px`,
                    animationDelay: `${i * 50}ms`,
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={stopRecording}
              className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-600 text-white font-medium text-sm hover:bg-red-700 transition min-h-[48px] w-full justify-center"
            >
              <Square className="w-4 h-4" />
              Stop Recording
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={playAudio}
                className="flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 transition min-h-[48px] flex-1 justify-center"
              >
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {playing ? 'Pause' : 'Play'}
              </button>
              <button
                type="button"
                onClick={deleteRecording}
                className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 font-medium text-sm hover:bg-red-200 dark:hover:bg-red-800 transition min-h-[48px]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-zinc-400 text-center">Recording saved ({formatTime(recordingTime)})</p>
          </div>
        )}

        <p className="text-xs text-zinc-400 mt-3 text-center">
          Recording with microphone permission
        </p>
      </div>

      <div>
        <FieldLabel htmlFor="additionalNotes">Additional Notes</FieldLabel>
        <textarea
          id="additionalNotes"
          className={inputClass + ' min-h-[100px] resize-none'}
          placeholder="Any other observations or notes..."
          value={data.additionalNotes}
          onChange={(e) => onChange({ additionalNotes: e.target.value })}
        />
      </div>
    </div>
  );
}

// ─── Success Screen ──────────────────────────────────────────────────────────

function SuccessScreen({
  result,
  onNewSurvey,
  onDashboard,
}: {
  result: { aiSummary: string; leadScore: number; leadStatus: string };
  onNewSurvey: () => void;
  onDashboard: () => void;
}) {
  const router = useRouter();
  const getPotentialLabel = (score: number) => {
    if (score >= 70) return { label: 'High Potential', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900' };
    if (score >= 40) return { label: 'Medium Potential', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900' };
    return { label: 'Low Potential', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900' };
  };

  const potential = getPotentialLabel(result.leadScore);
  const stars = Math.round(result.leadScore / 20);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Survey Submitted!</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">AI analysis complete</p>
        </div>

        <div className={cardClass}>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">AI Summary</p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{result.aiSummary}</p>
        </div>

        <div className={cardClass + ' text-center'}>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">Lead Score</p>
          <p className="text-5xl font-bold text-zinc-900 dark:text-zinc-100">{result.leadScore}</p>
          <div className="flex items-center justify-center gap-1 mt-2 mb-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`w-5 h-5 ${i < stars ? 'text-amber-500 fill-amber-500' : 'text-zinc-300 dark:text-zinc-600'}`}
              />
            ))}
          </div>
          <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${potential.color} ${potential.bg}`}>
            {potential.label}
          </span>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={onNewSurvey}
            className="flex items-center gap-2 px-4 py-3 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition min-h-[48px] w-full justify-center"
          >
            <Plus className="w-4 h-4" />
            New Survey
          </button>
          <button
            type="button"
            onClick={onDashboard}
            className="flex items-center gap-2 px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-medium text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition min-h-[48px] w-full justify-center"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <button
            type="button"
            onClick={() => router.push('/dashboard/followups')}
            className="flex items-center gap-2 px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-medium text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition min-h-[48px] w-full justify-center"
          >
            <ClipboardList className="w-4 h-4" />
            Schedule Follow-up
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Form Component ─────────────────────────────────────────────────────

export default function VendorSurveyPage() {
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ aiSummary: string; leadScore: number; leadStatus: string } | null>(null);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const [transitioning, setTransitioning] = useState(false);
  const stepContainerRef = useRef<HTMLDivElement>(null);
  const stepIndicatorRef = useRef<HTMLDivElement>(null);

  const TOTAL_STEPS = 13;

  // ─── Auto-save & restore draft ───────────────────────────────────────────

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setFormData((prev) => ({
          ...prev,
          ...parsed,
          documents: {},
          documentPreviews: {},
          voiceNote: null,
          voiceNoteUrl: '',
          gpsStatus: parsed.gpsLat ? 'success' : 'idle',
        }));
      }
    } catch { /* ignore parse errors */ }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const interval = setInterval(() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { documents, documentPreviews, voiceNote, voiceNoteUrl, gpsStatus, ...serializable } = formData;
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(serializable));
      } catch {
        // Ignore storage errors
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [formData]);

  // ─── Scroll step indicator into view ──────────────────────────────────────

  useEffect(() => {
    if (stepIndicatorRef.current) {
      const activeBtn = stepIndicatorRef.current.children[step] as HTMLElement | undefined;
      activeBtn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [step]);

  // ─── Form update helper ──────────────────────────────────────────────────

  const updateForm = useCallback((patch: Partial<FormData>) => {
    setFormData((prev) => ({ ...prev, ...patch }));
  }, []);

  // ─── Validation ──────────────────────────────────────────────────────────

  const validateStep = (stepIndex: number): boolean => {
    const errs: Record<string, string> = {};

    if (stepIndex === 0) {
      if (!formData.businessName.trim()) errs.businessName = 'Business name is required';
      if (!formData.ownerName.trim()) errs.ownerName = 'Owner name is required';
      if (!formData.mobile.trim()) errs.mobile = 'Mobile number is required';
      else if (!/^[6-9]\d{9}$/.test(formData.mobile)) errs.mobile = 'Enter a valid 10-digit Indian mobile number';
      if (!formData.address.trim()) errs.address = 'Address is required';
      if (!formData.category) errs.category = 'Please select a category';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ─── Navigation ──────────────────────────────────────────────────────────

  const goToStep = (target: number, dir: 'next' | 'prev') => {
    setDirection(dir);
    setTransitioning(true);
    setTimeout(() => {
      setStep(target);
      setTransitioning(false);
      stepContainerRef.current?.scrollTo({ top: 0 });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 150);
  };

  const handleNext = () => {
    if (!validateStep(step)) return;
    if (step < TOTAL_STEPS - 1) goToStep(step + 1, 'next');
  };

  const handlePrev = () => {
    if (step > 0) goToStep(step - 1, 'prev');
  };

  const handleStepClick = (target: number) => {
    // Allow clicking on completed or current step
    if (target < step) {
      goToStep(target, 'prev');
    } else if (target === step + 1) {
      handleNext();
    }
    // Don't allow skipping ahead more than one step
  };

  // ─── Draft save ──────────────────────────────────────────────────────────

  const saveDraft = () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { documents, documentPreviews, voiceNote, voiceNoteUrl, gpsStatus, ...serializable } = formData;
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(serializable));
      alert('Draft saved successfully!');
    } catch {
      alert('Could not save draft. Please try again.');
    }
  };

  // ─── Submit ──────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!validateStep(step)) return;
    setSubmitting(true);

    try {
      const token = localStorage.getItem('token') || '';

      // Upload documents and voice note before submission
      const { docUrls, voiceUrl } = await uploadSurveyFiles(
        formData.documents,
        formData.voiceNote,
        'vendor',
        token
      );

      // Determine interest level from wouldJoinRynOne
      let interestLevel = 'cold';
      if (formData.wouldJoinRynOne === 'Immediately') interestLevel = 'hot';
      else if (formData.wouldJoinRynOne === 'Within 3 Months') interestLevel = 'warm';
      else if (formData.wouldJoinRynOne === 'Maybe') interestLevel = 'warm';

      const body = {
        businessName: formData.businessName,
        ownerName: formData.ownerName,
        mobile: formData.mobile,
        whatsapp: formData.whatsappSameAsMobile ? formData.mobile : formData.whatsapp,
        email: formData.email,
        address: formData.address,
        gpsLat: formData.gpsLat,
        gpsLng: formData.gpsLng,
        category: formData.category,
        yearsInBusiness: formData.yearsInBusiness,
        numberOfBranches: formData.numberOfBranches,
        employees: formData.employees,
        seatingCapacity: formData.seatingCapacity,
        businessHours: formData.businessHours,
        weeklyOff: formData.weeklyOff,
        homeDelivery: formData.homeDelivery,
        ownDeliveryStaff: formData.ownDeliveryStaff,
        ownWebsite: formData.ownWebsite,
        ownMobileApp: formData.ownMobileApp,
        ownWhatsappOrdering: formData.ownWhatsappOrdering,
        onlinePlatforms: formData.onlinePlatforms,
        dailyOrdersWalkIn: formData.dailyOrdersWalkIn,
        dailyOrdersOnline: formData.dailyOrdersOnline,
        dailyOrdersPhone: formData.dailyOrdersPhone,
        dailyOrdersWhatsapp: formData.dailyOrdersWhatsapp,
        averageOrderValue: formData.averageOrderValue,
        monthlyRevenue: formData.monthlyRevenue,
        peakHours: formData.peakHours,
        bestSellingProducts: formData.bestSellingProducts,
        painPoints: formData.painPoints,
        currentCommission: formData.currentCommission,
        platformCommissions: formData.platformCommissions,
        deliveryCharges: formData.deliveryCharges,
        whoPaysDelvery: formData.whoPaysDelvery,
        whoPaysPackaging: formData.whoPaysPackaging,
        whoPaysPromotions: formData.whoPaysPromotions,
        whoPaysDiscounts: formData.whoPaysDiscounts,
        settlementFrequency: formData.settlementFrequency,
        settlementProblems: formData.settlementProblems,
        marketingChannels: formData.marketingChannels,
        aiInterests: formData.aiInterests,
        wouldJoinRynOne: formData.wouldJoinRynOne,
        featureVotes: formData.featureVotes,
        marketFeedback: formData.marketFeedback,
        additionalNotes: formData.additionalNotes,
        interestLevel,
        gstDoc: docUrls.gstDoc || null,
        fssaiDoc: docUrls.fssaiDoc || null,
        panDoc: docUrls.panDoc || null,
        visitingCard: docUrls.visitingCard || null,
        menuPhoto: docUrls.menuPhoto || null,
        shopPhoto: docUrls.shopPhoto || null,
        ownerPhoto: docUrls.ownerPhoto || null,
        shopFrontPhoto: docUrls.shopFrontPhoto || null,
        voiceNoteUrl: voiceUrl,
      };

      const res = await fetch('/api/surveys/vendor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Failed to submit survey');

      const result = await res.json();

      // Clear draft
      localStorage.removeItem(AUTOSAVE_KEY);

      setSubmitResult({
        aiSummary: result.aiSummary || 'Survey submitted successfully. AI analysis will be available shortly.',
        leadScore: result.leadScore ?? 0,
        leadStatus: result.leadStatus || 'new',
      });
      setSubmitted(true);
    } catch {
      alert('Failed to submit survey. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Reset for new survey ────────────────────────────────────────────────

  const resetForm = () => {
    setFormData(INITIAL_FORM_DATA);
    setStep(0);
    setErrors({});
    setSubmitted(false);
    setSubmitResult(null);
    localStorage.removeItem(AUTOSAVE_KEY);
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  if (submitted && submitResult) {
    return (
      <SuccessScreen
        result={submitResult}
        onNewSurvey={resetForm}
        onDashboard={() => (window.location.href = '/dashboard')}
      />
    );
  }

  const progress = ((step + 1) / TOTAL_STEPS) * 100;
  const isLastStep = step === TOTAL_STEPS - 1;

  const renderStep = () => {
    switch (step) {
      case 0: return <Step1BusinessProfile data={formData} onChange={updateForm} errors={errors} />;
      case 1: return <Step2BusinessInfo data={formData} onChange={updateForm} />;
      case 2: return <Step3OnlinePresence data={formData} onChange={updateForm} />;
      case 3: return <Step4BusinessNumbers data={formData} onChange={updateForm} />;
      case 4: return <Step5PainPoints data={formData} onChange={updateForm} />;
      case 5: return <Step6Commission data={formData} onChange={updateForm} />;
      case 6: return <Step7Settlements data={formData} onChange={updateForm} />;
      case 7: return <Step8Marketing data={formData} onChange={updateForm} />;
      case 8: return <Step9AIInterest data={formData} onChange={updateForm} />;
      case 9: return <Step10RynOneValidation data={formData} onChange={updateForm} />;
      case 10: return <Step11FeatureVoting data={formData} onChange={updateForm} />;
      case 11: return <Step12Documents data={formData} onChange={updateForm} />;
      case 12: return <Step13VoiceOfMarket data={formData} onChange={updateForm} />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        {/* Progress bar */}
        <div className="h-1 bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full bg-blue-600 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Step indicator */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Vendor Survey</h1>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Step {step + 1} of {TOTAL_STEPS} &middot; {Math.round(progress)}%
            </span>
          </div>

          {/* Scrollable step pills */}
          <div className="overflow-x-auto -mx-4 px-4 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
            <div ref={stepIndicatorRef} className="flex gap-1.5 w-max pb-1">
              {STEP_LABELS.map((label, i) => {
                const Icon = STEP_ICONS[i];
                const isCompleted = i < step;
                const isCurrent = i === step;

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleStepClick(i)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                      isCurrent
                        ? 'bg-blue-600 text-white shadow-sm'
                        : isCompleted
                        ? 'bg-emerald-500 text-white'
                        : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Icon className="w-3 h-3" />
                    )}
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sm:hidden">{i + 1}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Form body */}
      <div ref={stepContainerRef} className="max-w-lg mx-auto px-4 py-6 pb-28">
        <div
          className={`transition-all duration-150 ${
            transitioning
              ? direction === 'next'
                ? 'opacity-0 translate-x-4'
                : 'opacity-0 -translate-x-4'
              : 'opacity-100 translate-x-0'
          }`}
        >
          {renderStep()}
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 safe-area-bottom">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={handlePrev}
              className="flex items-center gap-1.5 px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-750 transition min-h-[48px]"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          )}

          <button
            type="button"
            onClick={saveDraft}
            className="flex items-center gap-1.5 px-3 py-3 rounded-lg text-zinc-500 dark:text-zinc-400 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition min-h-[48px]"
          >
            <Save className="w-4 h-4" />
            <span className="hidden sm:inline">Save Draft</span>
          </button>

          <div className="flex-1" />

          {isLastStep ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-1.5 px-6 py-3 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition min-h-[48px] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {submitting ? 'Submitting...' : 'Submit Survey'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-1.5 px-6 py-3 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition min-h-[48px]"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
