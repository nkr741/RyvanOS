"""Cortex Growth -- Python FastAPI backend for AI/analytics processing."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Any

from ai_engine import (
    generate_vendor_summary,
    generate_rider_summary,
    calculate_lead_score,
    calculate_rider_score,
)
from analytics import (
    aggregate_pain_points,
    competitor_market_share,
    category_distribution,
    commission_analysis,
    interest_distribution,
    feature_demand,
    daily_trend,
    generate_daily_report,
)


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Cortex Growth AI Service",
    description="AI summary generation, lead scoring, and analytics for Cortex Growth.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class SurveyData(BaseModel):
    """Generic survey payload -- all fields optional to support partial data."""
    model_config = {"extra": "allow"}

    # Business identity
    businessName: str | None = None
    name: str | None = None
    category: str | None = None
    businessCategory: str | None = None
    yearsInBusiness: float | None = None
    years: float | None = None
    location: str | None = None
    city: str | None = None
    area: str | None = None
    employees: int | None = None
    totalEmployees: int | None = None
    branches: int | None = None
    totalBranches: int | None = None

    # Platform / online presence
    currentPlatforms: list[str] | None = None
    platforms: list[str] | None = None
    commissionRate: float | None = None
    commission: float | None = None

    # Orders
    onlineOrders: int | None = None
    dailyOnlineOrders: int | None = None
    walkinOrders: int | None = None
    dailyWalkinOrders: int | None = None
    totalOrders: int | None = None
    dailyOrders: int | None = None
    averageOrderValue: float | None = None
    aov: float | None = None

    # Online readiness
    hasDelivery: bool | None = None
    ownDelivery: bool | None = None
    hasWebsite: bool | None = None
    website: bool | None = None
    hasApp: bool | None = None
    app: bool | None = None

    # Pain points (key -> severity 1-5)
    painPoints: dict[str, float] | None = None

    # Interest
    wouldJoinRynOne: str | None = None
    interestLevel: str | None = None

    # Features (key -> vote/score)
    featureVotes: dict[str, float] | None = None
    features: dict[str, float] | None = None

    # Misc
    requirements: list[str] | None = None
    keyRequirements: list[str] | None = None
    sentiment: str | None = None
    businessSentiment: str | None = None
    satisfaction: float | None = None
    platformSatisfaction: float | None = None

    # Rider-specific
    riderName: str | None = None
    age: int | None = None
    experience: float | None = None
    yearsExperience: float | None = None
    dailyDeliveries: int | None = None
    deliveriesPerDay: int | None = None
    dailyEarnings: float | None = None
    earnings: float | None = None
    vehicleType: str | None = None
    vehicle: str | None = None
    hasSmartphone: bool | None = None
    availability: str | None = None
    workHours: str | None = None

    # Timestamps
    createdAt: str | None = None
    submittedAt: str | None = None


class SurveyListPayload(BaseModel):
    """Payload wrapping a list of surveys for analytics endpoints."""
    surveys: list[dict[str, Any]] = Field(default_factory=list)
    days: int | None = Field(default=30, description="Number of days for trend analysis")
    date: str | None = Field(default=None, description="Target date for daily report (ISO-8601)")


class SummaryResponse(BaseModel):
    summary: str


class ScoreResponse(BaseModel):
    score: int
    label: str
    breakdown: dict[str, Any]


class InsightsResponse(BaseModel):
    topPainPoints: list[dict[str, Any]]
    mostCommonCompetitor: dict[str, Any] | None
    averageSwitchingIntent: dict[str, Any]
    featureDemandRanking: list[dict[str, Any]]
    recommendedFocusAreas: list[str]
    totalSurveysAnalyzed: int


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "cortex-growth-ai", "version": "1.0.0"}


# ---------------------------------------------------------------------------
# AI endpoints -- Vendor
# ---------------------------------------------------------------------------

@app.post("/api/ai/vendor-summary", response_model=SummaryResponse)
async def vendor_summary(data: SurveyData):
    """Generate an AI summary for a vendor survey."""
    try:
        summary = generate_vendor_summary(data.model_dump(exclude_none=True))
        return SummaryResponse(summary=summary)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summary generation failed: {str(e)}")


@app.post("/api/ai/rider-summary", response_model=SummaryResponse)
async def rider_summary(data: SurveyData):
    """Generate an AI summary for a rider survey."""
    try:
        summary = generate_rider_summary(data.model_dump(exclude_none=True))
        return SummaryResponse(summary=summary)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summary generation failed: {str(e)}")


# ---------------------------------------------------------------------------
# AI endpoints -- Lead scoring
# ---------------------------------------------------------------------------

@app.post("/api/ai/lead-score", response_model=ScoreResponse)
async def lead_score(data: SurveyData):
    """Calculate lead score for a vendor survey."""
    try:
        result = calculate_lead_score(data.model_dump(exclude_none=True))
        return ScoreResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lead scoring failed: {str(e)}")


@app.post("/api/ai/rider-score", response_model=ScoreResponse)
async def rider_score(data: SurveyData):
    """Calculate lead score for a rider survey."""
    try:
        result = calculate_rider_score(data.model_dump(exclude_none=True))
        return ScoreResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Rider scoring failed: {str(e)}")


# ---------------------------------------------------------------------------
# Analytics endpoints
# ---------------------------------------------------------------------------

@app.post("/api/analytics/pain-points")
async def pain_points_analysis(payload: SurveyListPayload):
    """Aggregate pain-point analysis across all surveys."""
    try:
        result = aggregate_pain_points(payload.surveys)
        return {"painPoints": result, "totalSurveys": len(payload.surveys)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pain point analysis failed: {str(e)}")


@app.post("/api/analytics/competitor-share")
async def competitor_share(payload: SurveyListPayload):
    """Analyze competitor/platform market share."""
    try:
        result = competitor_market_share(payload.surveys)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Competitor analysis failed: {str(e)}")


@app.post("/api/analytics/insights", response_model=InsightsResponse)
async def insights(payload: SurveyListPayload):
    """Generate AI insights from aggregated survey data."""
    try:
        surveys = payload.surveys
        if not surveys:
            return InsightsResponse(
                topPainPoints=[],
                mostCommonCompetitor=None,
                averageSwitchingIntent={"levels": [], "totalSurveys": 0},
                featureDemandRanking=[],
                recommendedFocusAreas=[],
                totalSurveysAnalyzed=0,
            )

        # Top 3 pain points
        all_pains = aggregate_pain_points(surveys)
        top_pains = all_pains[:3]

        # Most common competitor
        market = competitor_market_share(surveys)
        most_common = market["platforms"][0] if market["platforms"] else None

        # Average switching intent
        switching = interest_distribution(surveys)

        # Feature demand ranking
        features = feature_demand(surveys)

        # Recommended focus areas (rule-based)
        focus_areas: list[str] = []
        if top_pains:
            focus_areas.append(f"Address '{top_pains[0]['label']}' -- the top pain point (avg rating {top_pains[0]['averageRating']}/5)")
        if most_common:
            focus_areas.append(f"Target {most_common['name']} users ({most_common['percentage']}% market share)")

        # Check commission opportunity
        comm = commission_analysis(surveys)
        if comm["average"] > 20:
            focus_areas.append(f"Highlight lower commission rates (current avg: {comm['average']}%)")

        # Interest-based
        for level in switching.get("levels", []):
            if level["level"] in ("immediately", "within_3_months") and level["percentage"] > 30:
                focus_areas.append(f"Fast-track onboarding for {level['level']} leads ({level['percentage']}% of surveys)")
                break

        if features:
            focus_areas.append(f"Prioritize '{features[0]['feature']}' feature development (avg score {features[0]['averageScore']}/5)")

        return InsightsResponse(
            topPainPoints=top_pains,
            mostCommonCompetitor=most_common,
            averageSwitchingIntent=switching,
            featureDemandRanking=features[:10],
            recommendedFocusAreas=focus_areas[:5],
            totalSurveysAnalyzed=len(surveys),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Insights generation failed: {str(e)}")


# ---------------------------------------------------------------------------
# Additional analytics endpoints (used by dashboard)
# ---------------------------------------------------------------------------

@app.post("/api/analytics/category-distribution")
async def category_dist(payload: SurveyListPayload):
    """Category distribution of surveyed businesses."""
    try:
        return category_distribution(payload.surveys)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analytics/commission-analysis")
async def commission_analysis_endpoint(payload: SurveyListPayload):
    """Commission rate analysis."""
    try:
        return commission_analysis(payload.surveys)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analytics/interest-distribution")
async def interest_dist(payload: SurveyListPayload):
    """Interest/willingness level distribution."""
    try:
        return interest_distribution(payload.surveys)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analytics/feature-demand")
async def feature_demand_endpoint(payload: SurveyListPayload):
    """Feature demand ranking."""
    try:
        return {"features": feature_demand(payload.surveys)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analytics/daily-trend")
async def daily_trend_endpoint(payload: SurveyListPayload):
    """Daily survey submission trend."""
    try:
        days = payload.days or 30
        return {"trend": daily_trend(payload.surveys, days=days)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analytics/daily-report")
async def daily_report_endpoint(payload: SurveyListPayload):
    """Generate a report for a specific date."""
    try:
        return generate_daily_report(payload.surveys, date=payload.date)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
