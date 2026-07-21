// Rule-based AI functions for survey analysis
// These will be replaced with LLM calls later

interface VendorSurveyData {
  businessName?: string;
  ownerName?: string;
  category?: string;
  yearsInBusiness?: number | null;
  onlinePlatforms?: string;
  dailyOrdersWalkIn?: number | null;
  dailyOrdersOnline?: number | null;
  dailyOrdersPhone?: number | null;
  dailyOrdersWhatsapp?: number | null;
  averageOrderValue?: number | null;
  monthlyRevenue?: number | null;
  painPoints?: string;
  currentCommission?: number | null;
  platformCommissions?: string;
  interestLevel?: string | null;
  wouldJoinRynOne?: string | null;
  featureVotes?: string;
  homeDelivery?: boolean;
  ownDeliveryStaff?: boolean;
  businessSentiment?: string | null;
  estimatedOrders?: number | null;
  potentialRevenue?: number | null;
  riskLevel?: string | null;
  [key: string]: unknown;
}

interface RiderSurveyData {
  riderName?: string;
  vehicleType?: string | null;
  currentPlatforms?: string;
  experienceMonths?: number | null;
  dailyEarnings?: number | null;
  monthlyEarnings?: number | null;
  fuelCost?: number | null;
  maintenanceCost?: number | null;
  netSavings?: number | null;
  hoursPerDay?: number | null;
  painPoints?: string;
  averageWaiting?: number | null;
  satisfactionRating?: number | null;
  wouldRecommend?: boolean | null;
  wouldJoinRynOne?: string | null;
  professionalism?: number | null;
  communication?: number | null;
  vehicleCondition?: number | null;
  documentsComplete?: boolean;
  likelihoodToJoin?: string | null;
  [key: string]: unknown;
}

function safeParseJSON(value: string | undefined | null, fallback: unknown = {}): unknown {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function generateAISummary(surveyData: VendorSurveyData): string {
  const parts: string[] = [];

  // Platforms used
  const platforms = safeParseJSON(surveyData.onlinePlatforms, []) as string[];
  if (platforms.length > 0) {
    const platformNames = platforms.map(
      (p: string) => p.charAt(0).toUpperCase() + p.slice(1)
    );
    parts.push(`Owner currently uses ${platformNames.join(" and ")}.`);
  } else {
    parts.push("Owner is not currently on any online platform.");
  }

  // Commission
  if (surveyData.currentCommission) {
    parts.push(
      `Paying approximately ${surveyData.currentCommission}% commission.`
    );
  }

  // Daily orders
  const totalOnline = (surveyData.dailyOrdersOnline ?? 0);
  const totalWalkIn = (surveyData.dailyOrdersWalkIn ?? 0);
  if (totalOnline > 0) {
    parts.push(`Receives ${totalOnline} online orders daily.`);
  }
  if (totalWalkIn > 0) {
    parts.push(`Gets approximately ${totalWalkIn} walk-in orders daily.`);
  }

  // Pain points
  const painPoints = safeParseJSON(surveyData.painPoints, {}) as Record<string, number>;
  const highPainPoints = Object.entries(painPoints)
    .filter(([, rating]) => rating >= 4)
    .map(([point]) =>
      point
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .toLowerCase()
    );
  if (highPainPoints.length > 0) {
    parts.push(`Main concerns are ${highPainPoints.join(" and ")}.`);
  }

  // Interest level
  if (surveyData.interestLevel) {
    const levelMap: Record<string, string> = {
      hot: "highly interested",
      warm: "moderately interested",
      cold: "not very interested",
    };
    parts.push(
      `${levelMap[surveyData.interestLevel] ?? surveyData.interestLevel} in switching.`
    );
  }

  // Would join
  if (surveyData.wouldJoinRynOne) {
    const joinMap: Record<string, string> = {
      immediately: "Interested in switching if onboarding is simple.",
      within_3_months: "Open to joining within the next 3 months.",
      maybe: "Might consider joining but needs more convincing.",
      no: "Not interested in joining at this time.",
    };
    parts.push(
      joinMap[surveyData.wouldJoinRynOne] ??
        `Joining preference: ${surveyData.wouldJoinRynOne}.`
    );
  }

  // Years in business
  if (surveyData.yearsInBusiness) {
    parts.push(
      `Business has been operating for ${surveyData.yearsInBusiness} years.`
    );
  }

  // Monthly revenue
  if (surveyData.monthlyRevenue) {
    parts.push(
      `Estimated monthly revenue: Rs ${surveyData.monthlyRevenue.toLocaleString()}.`
    );
  }

  return parts.join(" ") || "Survey data insufficient for summary generation.";
}

export function calculateLeadScore(surveyData: VendorSurveyData): number {
  let score = 0;

  // Interest level (0-25 points)
  const interestScores: Record<string, number> = {
    hot: 25,
    warm: 15,
    cold: 5,
  };
  if (surveyData.interestLevel) {
    score += interestScores[surveyData.interestLevel] ?? 0;
  }

  // Would join RynOne (0-20 points)
  const joinScores: Record<string, number> = {
    immediately: 20,
    within_3_months: 15,
    maybe: 8,
    no: 0,
  };
  if (surveyData.wouldJoinRynOne) {
    score += joinScores[surveyData.wouldJoinRynOne] ?? 0;
  }

  // Daily online orders (0-15 points)
  const onlineOrders = surveyData.dailyOrdersOnline ?? 0;
  if (onlineOrders >= 50) score += 15;
  else if (onlineOrders >= 30) score += 12;
  else if (onlineOrders >= 15) score += 8;
  else if (onlineOrders >= 5) score += 5;
  else if (onlineOrders > 0) score += 2;

  // Pain points severity (0-15 points)
  const painPoints = safeParseJSON(surveyData.painPoints, {}) as Record<string, number>;
  const painValues = Object.values(painPoints);
  if (painValues.length > 0) {
    const avgPain =
      painValues.reduce((a: number, b: number) => a + b, 0) / painValues.length;
    if (avgPain >= 4) score += 15;
    else if (avgPain >= 3) score += 10;
    else if (avgPain >= 2) score += 5;
  }

  // Current commission - higher means more motivated to switch (0-10 points)
  const commission = surveyData.currentCommission ?? 0;
  if (commission >= 30) score += 10;
  else if (commission >= 25) score += 8;
  else if (commission >= 20) score += 5;
  else if (commission >= 15) score += 3;

  // Years in business - stability indicator (0-10 points)
  const years = surveyData.yearsInBusiness ?? 0;
  if (years >= 5) score += 10;
  else if (years >= 3) score += 7;
  else if (years >= 1) score += 4;
  else if (years > 0) score += 2;

  // Business sentiment bonus (0-5 points)
  if (surveyData.businessSentiment === "positive") score += 5;
  else if (surveyData.businessSentiment === "neutral") score += 2;

  return Math.min(100, Math.max(0, score));
}

export function calculateRiderScore(riderData: RiderSurveyData): number {
  let score = 0;

  // Would join RynOne (0-20 points)
  const joinScores: Record<string, number> = {
    yes: 20,
    maybe: 10,
    no: 0,
  };
  if (riderData.wouldJoinRynOne) {
    score += joinScores[riderData.wouldJoinRynOne] ?? 0;
  }

  // Experience (0-15 points)
  const months = riderData.experienceMonths ?? 0;
  if (months >= 24) score += 15;
  else if (months >= 12) score += 12;
  else if (months >= 6) score += 8;
  else if (months >= 3) score += 4;

  // Professionalism (0-10 points)
  if (riderData.professionalism) {
    score += riderData.professionalism * 2;
  }

  // Communication (0-10 points)
  if (riderData.communication) {
    score += riderData.communication * 2;
  }

  // Vehicle condition (0-10 points)
  if (riderData.vehicleCondition) {
    score += riderData.vehicleCondition * 2;
  }

  // Documents complete (0-10 points)
  if (riderData.documentsComplete) {
    score += 10;
  }

  // Satisfaction with current platform - lower = more likely to switch (0-10 points)
  if (riderData.satisfactionRating != null) {
    const dissatisfaction = 10 - riderData.satisfactionRating;
    score += dissatisfaction;
  }

  // Pain points severity (0-10 points)
  const painPoints = safeParseJSON(riderData.painPoints, {}) as Record<string, number>;
  const painValues = Object.values(painPoints);
  if (painValues.length > 0) {
    const avgPain =
      painValues.reduce((a: number, b: number) => a + b, 0) / painValues.length;
    if (avgPain >= 4) score += 10;
    else if (avgPain >= 3) score += 7;
    else if (avgPain >= 2) score += 4;
  }

  // Likelihood to join (0-5 points)
  const likelihoodScores: Record<string, number> = {
    high: 5,
    medium: 3,
    low: 1,
  };
  if (riderData.likelihoodToJoin) {
    score += likelihoodScores[riderData.likelihoodToJoin] ?? 0;
  }

  return Math.min(100, Math.max(0, score));
}

export function generateRiderAISummary(riderData: RiderSurveyData): string {
  const parts: string[] = [];

  // Current platforms
  const platforms = safeParseJSON(riderData.currentPlatforms, []) as string[];
  if (platforms.length > 0) {
    const platformNames = platforms.map(
      (p: string) => p.charAt(0).toUpperCase() + p.slice(1)
    );
    parts.push(`Currently riding for ${platformNames.join(" and ")}.`);
  }

  // Experience
  if (riderData.experienceMonths) {
    const years = Math.floor(riderData.experienceMonths / 12);
    const months = riderData.experienceMonths % 12;
    if (years > 0) {
      parts.push(
        `Has ${years} year${years > 1 ? "s" : ""}${months > 0 ? ` and ${months} month${months > 1 ? "s" : ""}` : ""} of delivery experience.`
      );
    } else {
      parts.push(`Has ${months} month${months > 1 ? "s" : ""} of delivery experience.`);
    }
  }

  // Earnings
  if (riderData.dailyEarnings) {
    parts.push(`Earns approximately Rs ${riderData.dailyEarnings} per day.`);
  }

  // Vehicle
  if (riderData.vehicleType) {
    parts.push(
      `Rides a ${riderData.vehicleType}.`
    );
  }

  // Satisfaction
  if (riderData.satisfactionRating != null) {
    if (riderData.satisfactionRating <= 4) {
      parts.push("Not satisfied with current platform.");
    } else if (riderData.satisfactionRating <= 6) {
      parts.push("Moderately satisfied with current platform.");
    } else {
      parts.push("Fairly satisfied with current platform.");
    }
  }

  // Pain points
  const painPoints = safeParseJSON(riderData.painPoints, {}) as Record<string, number>;
  const highPains = Object.entries(painPoints)
    .filter(([, rating]) => rating >= 4)
    .map(([point]) => point.replace(/_/g, " "));
  if (highPains.length > 0) {
    parts.push(`Key pain points: ${highPains.join(", ")}.`);
  }

  // Would join
  if (riderData.wouldJoinRynOne) {
    const joinMap: Record<string, string> = {
      yes: "Willing to join RynOne.",
      maybe: "Might consider joining RynOne.",
      no: "Not interested in joining RynOne at this time.",
    };
    parts.push(joinMap[riderData.wouldJoinRynOne] ?? "");
  }

  return parts.join(" ") || "Survey data insufficient for summary generation.";
}
