'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Building2, Globe, MapPin, Users, Target, Mail,
  Plus, ChevronRight, CheckCircle2, Clock, AlertCircle,
  Briefcase, Phone, Link2, Edit2, Zap, ExternalLink,
  Send, SkipForward, Eye, EyeOff, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Contact {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  role: string | null;
  notes: string | null;
}

interface Opportunity {
  id: string;
  title: string;
  description: string | null;
  services: string;
  estimatedValue: number | null;
  probability: number | null;
  stage: string;
  createdBy: { id: string; name: string };
  createdAt: string;
}

interface OutreachStep {
  id: string;
  stepOrder: number;
  type: string;
  subject: string | null;
  content: string | null;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  openedAt: string | null;
  repliedAt: string | null;
  contactId: string | null;
  contact: { id: string; name: string; email: string | null } | null;
}

interface OutreachSequence {
  id: string;
  type: string;
  status: string;
  steps: OutreachStep[];
  createdBy: { id: string; name: string };
  createdAt: string;
}

interface GrowthActivity {
  id: string;
  type: string;
  content: string;
  user: { id: string; name: string } | null;
  createdAt: string;
}

interface Company {
  id: string;
  name: string;
  website: string | null;
  industry: string;
  size: string | null;
  employees: number | null;
  location: string | null;
  country: string;
  description: string | null;
  techStack: string;
  cloudProvider: string | null;
  qualificationScore: number | null;
  qualificationGrade: string | null;
  qualificationData: string | null;
  status: string;
  source: string | null;
  painPoints: string;
  growthSignals: string;
  recommendedServices: string;
  aiSummary: string | null;
  confidence: number | null;
  assignedTo: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string | null;
  contacts: Contact[];
  opportunities: Opportunity[];
  outreachSequences: OutreachSequence[];
  growthActivities: GrowthActivity[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  discovered: { label: 'Discovered', color: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400' },
  researching: { label: 'Researching', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  qualified: { label: 'Qualified', color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
  outreach: { label: 'Outreach', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  engaged: { label: 'Engaged', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' },
  meeting: { label: 'Meeting', color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400' },
  proposal: { label: 'Proposal', color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
  won: { label: 'Won', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  lost: { label: 'Lost', color: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  dormant: { label: 'Dormant', color: 'bg-zinc-500/10 text-zinc-500' },
};

const GRADE_COLORS: Record<string, string> = {
  A: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  B: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  C: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  D: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  F: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
};

const ROLE_LABELS: Record<string, string> = {
  decision_maker: 'Decision Maker',
  influencer: 'Influencer',
  user: 'User',
  champion: 'Champion',
  gatekeeper: 'Gatekeeper',
};

const ACTIVITY_ICONS: Record<string, string> = {
  discovery: '🔍', qualification: '✅', outreach: '📧', research: '🔬',
  opportunity: '🎯', note: '📝', meeting: '🤝', status_change: '🔄',
};

function formatCurrency(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n}`;
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function safeJSON<T>(str: string, fallback: T): T {
  try { return JSON.parse(str); } catch { return fallback; }
}

export default function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddOpportunity, setShowAddOpportunity] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const fetchCompany = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) { router.replace('/'); return; }
    try {
      const res = await fetch(`/api/growth/companies/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setError('Company not found'); return; }
      const data = await res.json();
      setCompany(data.company);
    } catch {
      setError('Failed to load company');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { fetchCompany(); }, [fetchCompany]);

  async function updateStatus(newStatus: string) {
    setStatusUpdating(true);
    const token = localStorage.getItem('token');
    try {
      await fetch(`/api/growth/companies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchCompany();
    } catch (err) { console.error("[admin/growth] Failed to update company status", err); }
    setStatusUpdating(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground" />
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{error || 'Company not found'}</p>
        <Link href="/admin/growth" className="text-sm text-primary underline">Back to Growth Engine</Link>
      </div>
    );
  }

  const techStack = safeJSON<string[]>(company.techStack, []);
  const painPoints = safeJSON<string[]>(company.painPoints, []);
  const growthSignals = safeJSON<string[]>(company.growthSignals, []);
  const recommendedServices = safeJSON<string[]>(company.recommendedServices, []);
  const statusCfg = STATUS_CONFIG[company.status] || STATUS_CONFIG.discovered;

  const STATUSES = ['discovered', 'researching', 'qualified', 'outreach', 'engaged', 'meeting', 'proposal', 'won', 'lost', 'dormant'];

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div>
        <Link href="/admin/growth" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4" /> Growth Engine
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-muted text-xl font-bold text-muted-foreground">
              {company.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-foreground">{company.name}</h1>
                {company.qualificationGrade && (
                  <span className={cn('inline-flex h-7 w-7 items-center justify-center rounded-lg border text-sm font-bold', GRADE_COLORS[company.qualificationGrade])}>
                    {company.qualificationGrade}
                  </span>
                )}
                <span className={cn('rounded-full px-3 py-1 text-xs font-medium', statusCfg.color)}>
                  {statusCfg.label}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="capitalize">{company.industry}</span>
                {company.size && <><span>·</span><span className="capitalize">{company.size}</span></>}
                {company.employees && <><span>·</span><span>{company.employees} employees</span></>}
                {company.location && <><span>·</span><span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{company.location}</span></>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {company.website && (
              <a href={company.website} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted">
                <Globe className="h-3.5 w-3.5" /> Website <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <select
              value={company.status}
              onChange={e => updateStatus(e.target.value)}
              disabled={statusUpdating}
              className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              {STATUSES.map(s => (
                <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* AI Summary + Score */}
      {(company.aiSummary || company.qualificationScore != null) && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" /> AI Intelligence
          </h3>
          {company.aiSummary && (
            <p className="text-sm text-muted-foreground leading-relaxed">{company.aiSummary}</p>
          )}
          {company.qualificationScore != null && (
            <div className="mt-3 flex items-center gap-4">
              <span className="text-xs text-muted-foreground">Score</span>
              <div className="flex-1 h-2 rounded-full bg-muted">
                <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${company.qualificationScore}%` }} />
              </div>
              <span className="text-sm font-semibold text-foreground">{company.qualificationScore}/100</span>
              {company.confidence != null && (
                <span className="text-xs text-muted-foreground">({company.confidence}% confidence)</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Info Grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Tech & Pain Points */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          {techStack.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">Tech Stack</h4>
              <div className="flex flex-wrap gap-1.5">
                {techStack.map(t => (
                  <span key={t} className="rounded-lg bg-blue-500/10 px-2 py-1 text-xs text-blue-600 dark:text-blue-400">{t}</span>
                ))}
              </div>
            </div>
          )}
          {company.cloudProvider && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-1">Cloud</h4>
              <span className="text-sm text-foreground uppercase">{company.cloudProvider}</span>
            </div>
          )}
          {painPoints.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">Pain Points</h4>
              <div className="flex flex-wrap gap-1.5">
                {painPoints.map(p => (
                  <span key={p} className="rounded-lg bg-red-500/10 px-2 py-1 text-xs text-red-600 dark:text-red-400">{p}</span>
                ))}
              </div>
            </div>
          )}
          {growthSignals.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">Growth Signals</h4>
              <div className="flex flex-wrap gap-1.5">
                {growthSignals.map(g => (
                  <span key={g} className="rounded-lg bg-emerald-500/10 px-2 py-1 text-xs text-emerald-600 dark:text-emerald-400">{g}</span>
                ))}
              </div>
            </div>
          )}
          {recommendedServices.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">Recommended Services</h4>
              <div className="flex flex-wrap gap-1.5">
                {recommendedServices.map(s => (
                  <span key={s} className="rounded-lg bg-purple-500/10 px-2 py-1 text-xs text-purple-600 dark:text-purple-400">{s}</span>
                ))}
              </div>
            </div>
          )}
          {techStack.length === 0 && painPoints.length === 0 && !company.cloudProvider && (
            <p className="text-xs text-muted-foreground">No intelligence data yet. Run a research mission to populate.</p>
          )}
        </div>

        {/* Contacts */}
        <div className="rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-cyan-500" /> Contacts ({company.contacts.length})
            </h3>
            <button onClick={() => setShowAddContact(true)}
              className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="divide-y divide-border max-h-80 overflow-y-auto">
            {company.contacts.length === 0 ? (
              <div className="py-8 text-center">
                <Users className="h-6 w-6 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">No contacts yet</p>
                <button onClick={() => setShowAddContact(true)}
                  className="mt-2 text-xs text-primary underline">Add contact</button>
              </div>
            ) : (
              company.contacts.map(contact => (
                <div key={contact.id} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{contact.name}</p>
                      {contact.title && <p className="text-xs text-muted-foreground">{contact.title}</p>}
                    </div>
                    {contact.role && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {ROLE_LABELS[contact.role] || contact.role}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                        <Mail className="h-3 w-3" />{contact.email}
                      </a>
                    )}
                    {contact.phone && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" />{contact.phone}
                      </span>
                    )}
                    {contact.linkedin && (
                      <a href={contact.linkedin} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600">
                        <Link2 className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Activity Timeline */}
        <div className="rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" /> Activity
            </h3>
          </div>
          <div className="divide-y divide-border max-h-80 overflow-y-auto">
            {company.growthActivities.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-xs text-muted-foreground">No activity yet</p>
              </div>
            ) : (
              company.growthActivities.map(a => (
                <div key={a.id} className="px-5 py-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-sm">{ACTIVITY_ICONS[a.type] || '📋'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground leading-snug">{a.content}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        {a.user && <span>{a.user.name}</span>}
                        <span>·</span>
                        <span>{timeAgo(a.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Opportunities */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Target className="h-4 w-4 text-amber-500" /> Opportunities ({company.opportunities.length})
          </h3>
          <button onClick={() => setShowAddOpportunity(true)}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {company.opportunities.length === 0 ? (
          <div className="py-8 text-center">
            <Target className="h-6 w-6 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">No opportunities identified</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {company.opportunities.map(opp => {
              const services = safeJSON<string[]>(opp.services, []);
              return (
                <div key={opp.id} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{opp.title}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground capitalize">{opp.stage}</span>
                        {opp.probability != null && (
                          <span className="text-[10px] text-muted-foreground">{opp.probability}% probability</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {opp.estimatedValue != null && (
                        <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(opp.estimatedValue)}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground">{timeAgo(opp.createdAt)}</p>
                    </div>
                  </div>
                  {services.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {services.map(s => (
                        <span key={s} className="rounded-md bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-600 dark:text-purple-400">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Outreach Sequences */}
      {company.outreachSequences.length > 0 && (
        <div className="rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Mail className="h-4 w-4 text-blue-500" /> Outreach Sequences ({company.outreachSequences.length})
            </h3>
          </div>
          <div className="divide-y divide-border">
            {company.outreachSequences.map(seq => (
              <OutreachSequenceCard key={seq.id} sequence={seq} contacts={company.contacts} onUpdate={fetchCompany} />
            ))}
          </div>
        </div>
      )}

      {/* Add Contact Modal */}
      {showAddContact && (
        <AddContactModal companyId={company.id}
          onClose={() => setShowAddContact(false)}
          onSuccess={() => { setShowAddContact(false); fetchCompany(); }} />
      )}

      {/* Add Opportunity Modal */}
      {showAddOpportunity && (
        <AddOpportunityModal companyId={company.id}
          onClose={() => setShowAddOpportunity(false)}
          onSuccess={() => { setShowAddOpportunity(false); fetchCompany(); }} />
      )}
    </div>
  );
}

function AddContactModal({ companyId, onClose, onSuccess }: { companyId: string; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ name: '', title: '', email: '', phone: '', linkedin: '', role: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) { setError('Name is required'); return; }
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/growth/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId, ...form }),
      });
      if (!res.ok) { setError('Failed to add contact'); return; }
      onSuccess();
    } catch { setError('Failed to add contact'); } finally { setSaving(false); }
  }

  const roles = ['decision_maker', 'influencer', 'user', 'champion', 'gatekeeper'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-foreground mb-4">Add Contact</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Full name *" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Job title" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          <div className="grid grid-cols-2 gap-3">
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="Email" className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="Phone" className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <input type="text" value={form.linkedin} onChange={e => setForm(f => ({ ...f, linkedin: e.target.value }))}
            placeholder="LinkedIn URL" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">Select role...</option>
            {roles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50">
              {saving ? 'Adding...' : 'Add Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddOpportunityModal({ companyId, onClose, onSuccess }: { companyId: string; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ title: '', description: '', estimatedValue: '', probability: '20' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title) { setError('Title is required'); return; }
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/growth/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          companyId,
          title: form.title,
          description: form.description || undefined,
          estimatedValue: form.estimatedValue ? parseFloat(form.estimatedValue) : undefined,
          probability: form.probability ? parseInt(form.probability) : 20,
        }),
      });
      if (!res.ok) { setError('Failed to create opportunity'); return; }
      onSuccess();
    } catch { setError('Failed to create opportunity'); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-foreground mb-4">Add Opportunity</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Opportunity title *" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={2} placeholder="Description" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" value={form.estimatedValue} onChange={e => setForm(f => ({ ...f, estimatedValue: e.target.value }))}
              placeholder="Estimated value (₹)" className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            <input type="number" value={form.probability} onChange={e => setForm(f => ({ ...f, probability: e.target.value }))}
              placeholder="Probability %" min="0" max="100" className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Opportunity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OutreachSequenceCard({ sequence: seq, contacts, onUpdate }: {
  sequence: OutreachSequence; contacts: Contact[]; onUpdate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [sendEmails, setSendEmails] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const pendingSteps = seq.steps.filter(s => s.status === 'pending');
  const sentSteps = seq.steps.filter(s => ['sent', 'delivered', 'opened', 'replied'].includes(s.status));

  async function handleAction(stepId: string, action: string, recipientEmail?: string) {
    setActionLoading(stepId);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/growth/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, stepId, recipientEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Action failed');
        return;
      }
      onUpdate();
    } catch {
      setError('Action failed');
    } finally {
      setActionLoading(null);
    }
  }

  function stepStatusBadge(status: string) {
    switch (status) {
      case 'sent': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
      case 'delivered': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
      case 'opened': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
      case 'replied': return 'bg-purple-500/10 text-purple-600 dark:text-purple-400';
      case 'bounced': return 'bg-red-500/10 text-red-600 dark:text-red-400';
      case 'approved': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
      default: return 'bg-zinc-500/10 text-zinc-500';
    }
  }

  return (
    <div className="px-5 py-3">
      <button onClick={() => setExpanded(!expanded)} className="flex w-full items-center justify-between text-left">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground capitalize">{seq.type}</span>
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium',
            seq.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
            seq.status === 'completed' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
            'bg-zinc-500/10 text-zinc-500'
          )}>{seq.status}</span>
          {pendingSteps.length > 0 && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              {pendingSteps.length} pending
            </span>
          )}
          {sentSteps.length > 0 && (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              {sentSteps.length} sent
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{seq.steps.length} steps</span>
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
        </div>
      </button>

      {/* Progress bar */}
      <div className="mt-2 flex gap-1">
        {seq.steps.map(step => (
          <div key={step.id} className={cn('h-1.5 flex-1 rounded-full',
            ['sent', 'delivered', 'opened', 'replied'].includes(step.status) ? 'bg-emerald-500' :
            step.status === 'approved' ? 'bg-blue-500' :
            step.status === 'bounced' ? 'bg-red-500' :
            step.status === 'skipped' ? 'bg-zinc-300 dark:bg-zinc-700' :
            'bg-muted'
          )} />
        ))}
      </div>

      {/* Expanded step list */}
      {expanded && (
        <div className="mt-3 space-y-2">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
          {seq.steps.map(step => {
            const contactEmail = step.contact?.email || contacts.find(c => c.id === step.contactId)?.email || '';
            const emailVal = sendEmails[step.id] ?? contactEmail;

            return (
              <div key={step.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground">#{step.stepOrder}</span>
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground capitalize">{step.type}</span>
                      <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-semibold capitalize', stepStatusBadge(step.status))}>{step.status}</span>
                      {step.contact && <span className="text-[10px] text-muted-foreground">→ {step.contact.name}</span>}
                    </div>
                    {step.subject && <p className="mt-1 text-xs font-medium text-foreground truncate">{step.subject}</p>}
                    {step.sentAt && <p className="text-[10px] text-muted-foreground mt-0.5">Sent {new Date(step.sentAt).toLocaleDateString()}</p>}
                    {step.openedAt && <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">Opened {new Date(step.openedAt).toLocaleDateString()}</p>}
                    {step.repliedAt && <p className="text-[10px] text-purple-600 dark:text-purple-400 mt-0.5">Replied {new Date(step.repliedAt).toLocaleDateString()}</p>}
                  </div>

                  {/* Actions for pending/approved steps */}
                  {(step.status === 'pending' || step.status === 'approved') && (
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="email"
                          value={emailVal}
                          onChange={e => setSendEmails(prev => ({ ...prev, [step.id]: e.target.value }))}
                          placeholder="recipient@email.com"
                          className="w-44 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
                          onClick={e => e.stopPropagation()}
                        />
                        <button
                          onClick={() => handleAction(step.id, 'approve_and_send', emailVal || undefined)}
                          disabled={actionLoading === step.id || !emailVal}
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                        >
                          <Send className="h-3 w-3" /> Send
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => handleAction(step.id, 'approve_step')}
                          disabled={actionLoading === step.id}
                          className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3 w-3" /> Approve
                        </button>
                        <button
                          onClick={() => handleAction(step.id, 'skip_step')}
                          disabled={actionLoading === step.id}
                          className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          <SkipForward className="h-3 w-3" /> Skip
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Email content preview */}
                {step.content && step.status === 'pending' && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[10px] font-medium text-muted-foreground hover:text-foreground">
                      Preview email content
                    </summary>
                    <div className="mt-1.5 rounded-lg border border-border bg-muted/30 p-2.5">
                      <p className="whitespace-pre-wrap text-[11px] text-foreground/80 leading-relaxed">{step.content}</p>
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
