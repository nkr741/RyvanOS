// Cortex AI Decision Engine
// Algorithmic intelligence: scoring, predictions, recommendations
// No external API dependency — works offline from survey data

interface MerchantData {
  id: string;
  businessName: string;
  ownerName: string;
  mobile: string;
  category: string;
  address: string;
  leadScore: number | null;
  leadStatus: string;
  interestLevel: string | null;
  potentialRevenue: number | null;
  monthlyRevenue: number | null;
  currentCommission: number | null;
  dailyOrdersOnline: number | null;
  dailyOrdersWalkIn: number | null;
  averageOrderValue: number | null;
  yearsInBusiness: number | null;
  wouldJoinRynOne: string | null;
  painPoints: string;
  platformCommissions: string;
  onlinePlatforms: string;
  businessSentiment: string | null;
  stageChangedAt: string | null;
  createdAt: string;
  bde?: { id: string; name: string } | null;
}

interface ActivityData {
  id: string;
  type: string;
  content: string;
  createdAt: string;
}

interface TransitionData {
  fromStage: string;
  toStage: string;
  createdAt: string;
}

// ─── Opportunity Score ───────────────────────────────────────────

export interface OpportunityFactor {
  label: string;
  score: number;
  maxScore: number;
  reasoning: string;
}

export interface OpportunityResult {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  factors: OpportunityFactor[];
  summary: string;
}

export function calculateOpportunityScore(merchant: MerchantData): OpportunityResult {
  const factors: OpportunityFactor[] = [];

  // 1. Commission pain (0-20) — higher commission = more motivated to switch
  const commission = merchant.currentCommission ?? 0;
  let commissionScore = 0;
  let commissionReason = "No commission data";
  if (commission >= 28) { commissionScore = 20; commissionReason = `Paying ${commission}% — extremely high, strong incentive to switch`; }
  else if (commission >= 24) { commissionScore = 16; commissionReason = `Paying ${commission}% — above market average`; }
  else if (commission >= 20) { commissionScore = 12; commissionReason = `Paying ${commission}% — market rate, moderate switching incentive`; }
  else if (commission >= 15) { commissionScore = 8; commissionReason = `Paying ${commission}% — reasonable, low switching incentive`; }
  else if (commission > 0) { commissionScore = 4; commissionReason = `Paying ${commission}% — below average, little commission pressure`; }
  factors.push({ label: "Commission Pain", score: commissionScore, maxScore: 20, reasoning: commissionReason });

  // 2. Order volume (0-20) — higher volume = more revenue potential
  const dailyOrders = (merchant.dailyOrdersOnline ?? 0) + (merchant.dailyOrdersWalkIn ?? 0);
  let volumeScore = 0;
  let volumeReason = "No order data";
  if (dailyOrders >= 80) { volumeScore = 20; volumeReason = `${dailyOrders} orders/day — high-volume merchant, significant revenue`; }
  else if (dailyOrders >= 50) { volumeScore = 16; volumeReason = `${dailyOrders} orders/day — strong volume`; }
  else if (dailyOrders >= 25) { volumeScore = 12; volumeReason = `${dailyOrders} orders/day — moderate volume`; }
  else if (dailyOrders >= 10) { volumeScore = 8; volumeReason = `${dailyOrders} orders/day — growing business`; }
  else if (dailyOrders > 0) { volumeScore = 4; volumeReason = `${dailyOrders} orders/day — low volume, early stage`; }
  factors.push({ label: "Order Volume", score: volumeScore, maxScore: 20, reasoning: volumeReason });

  // 3. Interest signal (0-20) — direct and indirect signals
  let interestScore = 0;
  let interestReason = "No interest data";
  const interestMap: Record<string, number> = { hot: 20, warm: 12, cold: 4 };
  const joinMap: Record<string, number> = { immediately: 8, within_3_months: 5, maybe: 2, no: 0 };
  if (merchant.interestLevel) {
    interestScore += interestMap[merchant.interestLevel] ?? 0;
    interestReason = `Interest level: ${merchant.interestLevel}`;
  }
  if (merchant.wouldJoinRynOne) {
    const joinBonus = joinMap[merchant.wouldJoinRynOne] ?? 0;
    interestScore = Math.min(20, interestScore + joinBonus);
    if (merchant.wouldJoinRynOne === "immediately") interestReason += " — ready to join immediately";
    else if (merchant.wouldJoinRynOne === "within_3_months") interestReason += " — open to joining soon";
  }
  factors.push({ label: "Interest Signal", score: interestScore, maxScore: 20, reasoning: interestReason });

  // 4. Pain points severity (0-15) — more pain = more motivation
  let painScore = 0;
  let painReason = "No pain point data";
  try {
    const pains = JSON.parse(merchant.painPoints || "{}") as Record<string, number>;
    const painValues = Object.values(pains);
    if (painValues.length > 0) {
      const avgPain = painValues.reduce((a, b) => a + b, 0) / painValues.length;
      const highPainCount = painValues.filter(v => v >= 4).length;
      if (avgPain >= 4) { painScore = 15; painReason = `Average pain ${avgPain.toFixed(1)}/5, ${highPainCount} critical issues`; }
      else if (avgPain >= 3) { painScore = 10; painReason = `Average pain ${avgPain.toFixed(1)}/5 — moderate frustration`; }
      else if (avgPain >= 2) { painScore = 5; painReason = `Average pain ${avgPain.toFixed(1)}/5 — minor issues`; }
      else { painScore = 2; painReason = `Average pain ${avgPain.toFixed(1)}/5 — mostly satisfied`; }
    }
  } catch { /* ignore */ }
  factors.push({ label: "Pain Points", score: painScore, maxScore: 15, reasoning: painReason });

  // 5. Business stability (0-10) — established = reliable partner
  const years = merchant.yearsInBusiness ?? 0;
  let stabilityScore = 0;
  let stabilityReason = "No business age data";
  if (years >= 10) { stabilityScore = 10; stabilityReason = `${years} years — well-established, reliable partner`; }
  else if (years >= 5) { stabilityScore = 8; stabilityReason = `${years} years — established business`; }
  else if (years >= 3) { stabilityScore = 6; stabilityReason = `${years} years — growing business`; }
  else if (years >= 1) { stabilityScore = 4; stabilityReason = `${years} year(s) — relatively new`; }
  else if (years > 0) { stabilityScore = 2; stabilityReason = `Less than a year — startup risk`; }
  factors.push({ label: "Business Stability", score: stabilityScore, maxScore: 10, reasoning: stabilityReason });

  // 6. Revenue potential (0-15) — monetary value of the deal
  const revenue = merchant.potentialRevenue ?? merchant.monthlyRevenue ?? 0;
  let revenueScore = 0;
  let revenueReason = "No revenue data";
  if (revenue >= 500000) { revenueScore = 15; revenueReason = `₹${(revenue / 100000).toFixed(1)}L/mo — high-value merchant`; }
  else if (revenue >= 200000) { revenueScore = 12; revenueReason = `₹${(revenue / 100000).toFixed(1)}L/mo — strong revenue`; }
  else if (revenue >= 100000) { revenueScore = 8; revenueReason = `₹${(revenue / 1000).toFixed(0)}K/mo — moderate revenue`; }
  else if (revenue >= 50000) { revenueScore = 5; revenueReason = `₹${(revenue / 1000).toFixed(0)}K/mo — small merchant`; }
  else if (revenue > 0) { revenueScore = 2; revenueReason = `₹${(revenue / 1000).toFixed(0)}K/mo — micro merchant`; }
  factors.push({ label: "Revenue Potential", score: revenueScore, maxScore: 15, reasoning: revenueReason });

  const totalScore = factors.reduce((sum, f) => sum + f.score, 0);
  const grade: OpportunityResult["grade"] =
    totalScore >= 80 ? "A" : totalScore >= 65 ? "B" : totalScore >= 45 ? "C" : totalScore >= 25 ? "D" : "F";

  const topFactors = factors.filter(f => f.score >= f.maxScore * 0.7).map(f => f.label.toLowerCase());
  const summary = totalScore >= 70
    ? `High-opportunity merchant. Strengths: ${topFactors.join(", ") || "multiple factors"}.`
    : totalScore >= 45
      ? `Moderate opportunity. Consider targeted engagement based on ${topFactors[0] || "available signals"}.`
      : `Low opportunity currently. Monitor for changes in interest or business growth.`;

  return { score: totalScore, grade, factors, summary };
}

// ─── Deal Health ─────────────────────────────────────────────────

export type DealHealthStatus = "healthy" | "stalled" | "at_risk";

export interface DealHealthResult {
  status: DealHealthStatus;
  score: number;
  reasons: string[];
  daysSinceActivity: number;
  daysInStage: number;
  recommendation: string;
}

export function assessDealHealth(
  merchant: MerchantData,
  activities: ActivityData[],
): DealHealthResult {
  const reasons: string[] = [];
  let healthScore = 100;

  // Days since last activity
  const lastActivity = activities.length > 0
    ? new Date(activities[0].createdAt).getTime()
    : new Date(merchant.createdAt).getTime();
  const daysSinceActivity = Math.floor((Date.now() - lastActivity) / (1000 * 60 * 60 * 24));

  // Days in current stage
  const stageRef = merchant.stageChangedAt || merchant.createdAt;
  const daysInStage = Math.floor((Date.now() - new Date(stageRef).getTime()) / (1000 * 60 * 60 * 24));

  // Penalize inactivity
  if (daysSinceActivity >= 14) {
    healthScore -= 40;
    reasons.push(`No activity for ${daysSinceActivity} days`);
  } else if (daysSinceActivity >= 7) {
    healthScore -= 20;
    reasons.push(`No activity for ${daysSinceActivity} days`);
  } else if (daysSinceActivity >= 3) {
    healthScore -= 5;
  }

  // Penalize slow stage progression
  const stageThresholds: Record<string, number> = {
    new: 14, qualified: 10, interested: 14, negotiation: 21, onboarded: 30,
  };
  const threshold = stageThresholds[merchant.leadStatus] ?? 14;
  if (daysInStage > threshold * 2) {
    healthScore -= 30;
    reasons.push(`Stuck in "${merchant.leadStatus}" for ${daysInStage} days (expected <${threshold})`);
  } else if (daysInStage > threshold) {
    healthScore -= 15;
    reasons.push(`${daysInStage} days in current stage, above average`);
  }

  // Boost for recent positive signals
  const recentPositive = activities.filter(a =>
    a.type === "visit" || a.type === "call" || a.type === "whatsapp"
  ).length;
  if (recentPositive >= 3) healthScore = Math.min(100, healthScore + 10);

  // Terminal stages are always healthy
  if (merchant.leadStatus === "active_merchant") {
    healthScore = Math.max(healthScore, 80);
  }
  if (merchant.leadStatus === "not_interested") {
    healthScore = 20;
    reasons.push("Merchant marked as not interested");
  }

  healthScore = Math.max(0, Math.min(100, healthScore));
  const status: DealHealthStatus = healthScore >= 70 ? "healthy" : healthScore >= 40 ? "stalled" : "at_risk";

  let recommendation: string;
  if (status === "at_risk") {
    recommendation = daysSinceActivity >= 14
      ? `Urgent: Contact ${merchant.ownerName} immediately. No activity in ${daysSinceActivity} days.`
      : `Escalate: Deal is stalling in ${merchant.leadStatus}. Schedule a visit or call today.`;
  } else if (status === "stalled") {
    recommendation = `Follow up with ${merchant.ownerName}. Consider a visit or demo to re-engage.`;
  } else {
    recommendation = "Deal is progressing well. Continue current engagement cadence.";
  }

  return { status, score: healthScore, reasons, daysSinceActivity, daysInStage, recommendation };
}

// ─── Stage Prediction ────────────────────────────────────────────

export interface StagePrediction {
  nextStage: string;
  nextStageLabel: string;
  probability: number;
  estimatedDays: number;
  confidence: "high" | "medium" | "low";
}

const STAGE_LABELS: Record<string, string> = {
  new: "Lead", qualified: "Qualified", interested: "Interested",
  negotiation: "Negotiation", onboarded: "Onboarded", active_merchant: "Active Merchant",
};

const STAGE_ORDER = ["new", "qualified", "interested", "negotiation", "onboarded", "active_merchant"];

export function predictStageProgression(
  merchant: MerchantData,
  transitions: TransitionData[],
): StagePrediction | null {
  const currentIdx = STAGE_ORDER.indexOf(merchant.leadStatus);
  if (currentIdx === -1 || currentIdx >= STAGE_ORDER.length - 1) return null;
  if (merchant.leadStatus === "not_interested") return null;

  const nextStage = STAGE_ORDER[currentIdx + 1];
  const leadScore = merchant.leadScore ?? 0;
  const interestLevel = merchant.interestLevel;

  // Base probability from lead score
  let probability = Math.min(95, Math.max(10, leadScore));

  // Adjust by interest level
  if (interestLevel === "hot") probability = Math.min(95, probability + 15);
  else if (interestLevel === "warm") probability = Math.min(95, probability + 5);
  else if (interestLevel === "cold") probability = Math.max(10, probability - 20);

  // Adjust by current stage — later stages have higher completion probability
  probability = Math.min(95, probability + currentIdx * 5);

  // Adjust by momentum (has transitions = momentum)
  if (transitions.length >= 2) probability = Math.min(95, probability + 10);
  else if (transitions.length === 0) probability = Math.max(10, probability - 10);

  // Estimated days based on stage
  const avgDaysPerStage: Record<string, number> = {
    new: 7, qualified: 5, interested: 10, negotiation: 14, onboarded: 7,
  };
  let estimatedDays = avgDaysPerStage[merchant.leadStatus] ?? 10;

  // Faster for high-score leads
  if (leadScore >= 80) estimatedDays = Math.max(2, Math.floor(estimatedDays * 0.6));
  else if (leadScore >= 60) estimatedDays = Math.max(3, Math.floor(estimatedDays * 0.8));

  const confidence: StagePrediction["confidence"] =
    probability >= 75 ? "high" : probability >= 50 ? "medium" : "low";

  return {
    nextStage,
    nextStageLabel: STAGE_LABELS[nextStage] || nextStage,
    probability: Math.round(probability),
    estimatedDays,
    confidence,
  };
}

// ─── Revenue Forecast ────────────────────────────────────────────

export interface RevenueForecast {
  expectedRevenue: number;
  confidence: number;
  breakdown: { stage: string; label: string; count: number; revenue: number; conversionRate: number }[];
}

export function forecastRevenue(merchants: MerchantData[]): RevenueForecast {
  const stageConversionRates: Record<string, number> = {
    new: 0.15, qualified: 0.30, interested: 0.55,
    negotiation: 0.75, onboarded: 0.90, active_merchant: 1.0,
    follow_up: 0.25, not_interested: 0.02,
  };

  let totalExpected = 0;
  let totalWeightedConfidence = 0;
  let totalWeight = 0;
  const breakdown: RevenueForecast["breakdown"] = [];

  for (const stage of STAGE_ORDER) {
    const stageMerchants = merchants.filter(m =>
      m.leadStatus === stage || (stage === "qualified" && m.leadStatus === "follow_up")
    );
    const convRate = stageConversionRates[stage] ?? 0.1;
    const stageRevenue = stageMerchants.reduce((sum, m) =>
      sum + (m.potentialRevenue ?? m.monthlyRevenue ?? 0), 0
    );
    const expectedStageRevenue = stageRevenue * convRate;
    totalExpected += expectedStageRevenue;
    totalWeightedConfidence += convRate * stageMerchants.length;
    totalWeight += stageMerchants.length;

    if (stageMerchants.length > 0) {
      breakdown.push({
        stage,
        label: STAGE_LABELS[stage] || stage,
        count: stageMerchants.length,
        revenue: expectedStageRevenue,
        conversionRate: convRate,
      });
    }
  }

  const confidence = totalWeight > 0
    ? Math.round((totalWeightedConfidence / totalWeight) * 100)
    : 0;

  return { expectedRevenue: Math.round(totalExpected), confidence, breakdown };
}

// ─── Next Best Actions ───────────────────────────────────────────

export interface NextAction {
  type: "visit" | "call" | "proposal" | "follow_up" | "escalate" | "celebrate";
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  merchantId: string;
  merchantName: string;
  score: number;
}

export function generateNextActions(
  merchants: MerchantData[],
  activitiesMap: Map<string, ActivityData[]>,
  limit: number = 10,
): NextAction[] {
  const actions: NextAction[] = [];

  for (const m of merchants) {
    if (m.leadStatus === "not_interested" || m.leadStatus === "active_merchant") continue;

    const activities = activitiesMap.get(m.id) || [];
    const health = assessDealHealth(m, activities);
    const opportunity = calculateOpportunityScore(m);

    // At-risk high-value deals need immediate attention
    if (health.status === "at_risk" && opportunity.score >= 50) {
      actions.push({
        type: "escalate",
        priority: "critical",
        title: `Urgent: Re-engage ${m.businessName}`,
        description: health.recommendation,
        merchantId: m.id,
        merchantName: m.businessName,
        score: opportunity.score + (100 - health.score),
      });
    }

    // Stalled deals in active pipeline stages
    if (health.status === "stalled" && ["interested", "negotiation"].includes(m.leadStatus)) {
      actions.push({
        type: "follow_up",
        priority: "high",
        title: `Follow up with ${m.businessName}`,
        description: `${health.daysInStage} days in ${STAGE_LABELS[m.leadStatus] || m.leadStatus}. ${health.recommendation}`,
        merchantId: m.id,
        merchantName: m.businessName,
        score: opportunity.score + health.daysInStage,
      });
    }

    // High-opportunity leads not yet contacted enough
    if (opportunity.score >= 70 && m.leadStatus === "new" && activities.length < 2) {
      actions.push({
        type: "visit",
        priority: "high",
        title: `Visit ${m.businessName}`,
        description: `High-opportunity lead (${opportunity.score}%). ${opportunity.summary}`,
        merchantId: m.id,
        merchantName: m.businessName,
        score: opportunity.score,
      });
    }

    // Ready for proposal
    if (m.leadStatus === "negotiation" && health.status === "healthy") {
      actions.push({
        type: "proposal",
        priority: "high",
        title: `Send proposal to ${m.businessName}`,
        description: `In negotiation stage with healthy engagement. Revenue potential: ₹${((m.potentialRevenue ?? 0) / 1000).toFixed(0)}K/mo`,
        merchantId: m.id,
        merchantName: m.businessName,
        score: opportunity.score + 20,
      });
    }

    // Qualified leads needing a call
    if (m.leadStatus === "qualified" && health.daysSinceActivity >= 3) {
      actions.push({
        type: "call",
        priority: "medium",
        title: `Call ${m.ownerName} at ${m.businessName}`,
        description: `Qualified lead, last activity ${health.daysSinceActivity} days ago. Move toward interest confirmation.`,
        merchantId: m.id,
        merchantName: m.businessName,
        score: opportunity.score,
      });
    }
  }

  return actions
    .sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      return pDiff !== 0 ? pDiff : b.score - a.score;
    })
    .slice(0, limit);
}

// ─── Territory Intelligence ──────────────────────────────────────

export interface TerritoryInsight {
  area: string;
  totalMerchants: number;
  activePipeline: number;
  interested: number;
  needFollowUp: number;
  atRisk: number;
  avgCommission: number;
  totalRevenuePotential: number;
  topCategory: string;
  recommendation: string;
  score: number;
}

export function analyzeTerritories(
  merchants: MerchantData[],
  activitiesMap: Map<string, ActivityData[]>,
): TerritoryInsight[] {
  // Group by address locality (extract area from address)
  const areaMap = new Map<string, MerchantData[]>();
  for (const m of merchants) {
    const area = extractArea(m.address);
    if (!areaMap.has(area)) areaMap.set(area, []);
    areaMap.get(area)!.push(m);
  }

  const insights: TerritoryInsight[] = [];

  for (const [area, areaMerchants] of areaMap) {
    if (areaMerchants.length < 2) continue;

    const active = areaMerchants.filter(m => m.leadStatus !== "not_interested");
    const interested = areaMerchants.filter(m => ["interested", "negotiation"].includes(m.leadStatus));
    const needFollowUp = areaMerchants.filter(m => {
      const acts = activitiesMap.get(m.id) || [];
      return assessDealHealth(m, acts).status !== "healthy" && m.leadStatus !== "not_interested";
    });
    const atRisk = areaMerchants.filter(m => {
      const acts = activitiesMap.get(m.id) || [];
      return assessDealHealth(m, acts).status === "at_risk";
    });

    const commissions = areaMerchants
      .map(m => m.currentCommission)
      .filter((c): c is number => c !== null && c > 0);
    const avgCommission = commissions.length > 0
      ? Math.round(commissions.reduce((a, b) => a + b, 0) / commissions.length)
      : 0;

    const totalRevenue = areaMerchants.reduce((sum, m) =>
      sum + (m.potentialRevenue ?? m.monthlyRevenue ?? 0), 0
    );

    const categoryCounts = new Map<string, number>();
    for (const m of areaMerchants) {
      categoryCounts.set(m.category, (categoryCounts.get(m.category) ?? 0) + 1);
    }
    const topCategory = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mixed";

    let recommendation: string;
    const score = interested.length * 30 + active.length * 10 + (avgCommission > 25 ? 20 : 0);
    if (interested.length >= 3 && avgCommission >= 25) {
      recommendation = `High-potential cluster. ${interested.length} interested merchants paying ${avgCommission}% avg commission. Deploy BDE for concentrated outreach.`;
    } else if (atRisk.length >= 2) {
      recommendation = `${atRisk.length} at-risk deals. Schedule urgent follow-ups to prevent churn.`;
    } else if (active.length >= 5) {
      recommendation = `Active territory with ${active.length} merchants in pipeline. Maintain engagement cadence.`;
    } else {
      recommendation = `${active.length} merchants in area. Monitor for growth opportunities.`;
    }

    insights.push({
      area,
      totalMerchants: areaMerchants.length,
      activePipeline: active.length,
      interested: interested.length,
      needFollowUp: needFollowUp.length,
      atRisk: atRisk.length,
      avgCommission,
      totalRevenuePotential: totalRevenue,
      topCategory,
      recommendation,
      score,
    });
  }

  return insights.sort((a, b) => b.score - a.score);
}

function extractArea(address: string): string {
  if (!address) return "Unknown";
  const parts = address.split(",").map(p => p.trim());
  // Take second-to-last part as locality (last is usually city/state)
  if (parts.length >= 3) return parts[parts.length - 3];
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0] || "Unknown";
}

// ─── Suggested Offer ─────────────────────────────────────────────

export interface SuggestedOffer {
  commissionRate: string;
  rationale: string;
  incentives: string[];
  urgency: "high" | "medium" | "low";
}

export function generateSuggestedOffer(merchant: MerchantData): SuggestedOffer {
  const commission = merchant.currentCommission ?? 20;
  const dailyOrders = (merchant.dailyOrdersOnline ?? 0) + (merchant.dailyOrdersWalkIn ?? 0);

  // Suggest 30-50% lower commission than current
  const suggestedRate = Math.max(5, Math.round(commission * 0.6));
  let rationale: string;
  const incentives: string[] = [];

  if (commission >= 28) {
    rationale = `Currently paying ${commission}%. Offer ${suggestedRate}% to show immediate savings of ${commission - suggestedRate}% per order.`;
    incentives.push(`Save ₹${Math.round(((commission - suggestedRate) / 100) * (merchant.averageOrderValue ?? 200) * dailyOrders * 30)} per month`);
  } else if (commission >= 20) {
    rationale = `Market rate of ${commission}%. Offer ${suggestedRate}% with volume-based tiers.`;
  } else {
    rationale = `Low current commission of ${commission}%. Focus on value-adds over price.`;
  }

  if (dailyOrders >= 30) incentives.push("Volume discount: additional 2% off after 1000 orders/month");
  if (merchant.interestLevel === "hot") incentives.push("Priority onboarding within 48 hours");
  incentives.push(`${suggestedRate}% commission for first 3 months, then review`);

  const urgency: SuggestedOffer["urgency"] =
    merchant.interestLevel === "hot" ? "high"
      : merchant.interestLevel === "warm" ? "medium"
        : "low";

  return { commissionRate: `${suggestedRate}%`, rationale, incentives, urgency };
}

// ─── Follow-up Message Generator ─────────────────────────────────

export function generateFollowUpMessage(merchant: MerchantData): string {
  const name = merchant.ownerName.split(" ")[0];
  const business = merchant.businessName;

  if (merchant.leadStatus === "new" || merchant.leadStatus === "qualified") {
    return `Hi ${name}, this is from Ryvan Technologies. We recently visited ${business} and would love to discuss how we can help grow your online orders while reducing commission costs. When would be a good time to talk?`;
  }

  if (merchant.leadStatus === "interested") {
    const commission = merchant.currentCommission;
    if (commission) {
      return `Hi ${name}, following up on our conversation about ${business}. With your current ${commission}% commission, we can offer significantly better rates while providing better technology. Shall I prepare a detailed proposal?`;
    }
    return `Hi ${name}, following up on our discussion about ${business}. I'd like to share our detailed proposal — when works for a quick 15-minute call?`;
  }

  if (merchant.leadStatus === "negotiation") {
    return `Hi ${name}, just checking in on the proposal for ${business}. Happy to address any questions or adjust terms. We're confident this partnership will be great for your business.`;
  }

  return `Hi ${name}, checking in about ${business}. Would love to connect and discuss how we can help. Let me know a convenient time!`;
}
