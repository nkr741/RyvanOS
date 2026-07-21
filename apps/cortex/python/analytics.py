"""Analytics module for aggregating survey data and generating reports."""

from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Any


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_get(data: dict, key: str, default: Any = None) -> Any:
    val = data.get(key)
    return val if val is not None else default


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------------------
# Pain-point labels (shared with ai_engine)
# ---------------------------------------------------------------------------

PAIN_POINT_LABELS: dict[str, str] = {
    "highCommission": "High Commission",
    "lateRiders": "Late/Delayed Rider Arrivals",
    "customerComplaints": "Customer Complaints",
    "poorSupport": "Poor Platform Support",
    "limitedMenu": "Limited Menu Control",
    "paymentDelays": "Payment Settlement Delays",
    "lowVisibility": "Low Online Visibility",
    "orderCancellations": "Frequent Order Cancellations",
    "packagingCost": "High Packaging Cost",
    "noAnalytics": "Lack of Analytics/Insights",
}


# ---------------------------------------------------------------------------
# Aggregate pain points
# ---------------------------------------------------------------------------

def aggregate_pain_points(surveys: list[dict]) -> list[dict]:
    """Aggregate pain-point ratings across all surveys.

    Returns a list sorted by severity (descending), each entry containing:
    - ``key``: raw pain-point key
    - ``label``: human-readable label
    - ``count``: number of surveys that include this pain point
    - ``averageRating``: mean rating across surveys
    - ``highSeverityPercentage``: % of surveys rating this 4 or above
    """
    if not surveys:
        return []

    totals: dict[str, list[float]] = defaultdict(list)

    for survey in surveys:
        pain_points = _safe_get(survey, "painPoints") or {}
        if not isinstance(pain_points, dict):
            continue
        for key, value in pain_points.items():
            rating = _safe_float(value)
            totals[key].append(rating)

    results: list[dict] = []
    for key, ratings in totals.items():
        count = len(ratings)
        avg = sum(ratings) / count if count else 0.0
        high_count = sum(1 for r in ratings if r >= 4)
        pct = (high_count / count * 100) if count else 0.0
        results.append({
            "key": key,
            "label": PAIN_POINT_LABELS.get(key, key),
            "count": count,
            "averageRating": round(avg, 2),
            "highSeverityPercentage": round(pct, 1),
        })

    results.sort(key=lambda x: x["averageRating"], reverse=True)
    return results


# ---------------------------------------------------------------------------
# Competitor market share
# ---------------------------------------------------------------------------

def competitor_market_share(surveys: list[dict]) -> dict:
    """Analyze platform/competitor market share.

    Returns a dict with:
    - ``platforms``: list of {name, count, percentage, avgCommission, avgSatisfaction}
    - ``totalSurveys``: total surveys analyzed
    """
    if not surveys:
        return {"platforms": [], "totalSurveys": 0}

    platform_data: dict[str, dict] = defaultdict(lambda: {
        "count": 0,
        "commissions": [],
        "satisfactions": [],
    })

    for survey in surveys:
        platforms = _safe_get(survey, "currentPlatforms") or _safe_get(survey, "platforms") or []
        if not isinstance(platforms, list):
            continue
        commission = _safe_float(_safe_get(survey, "commissionRate") or _safe_get(survey, "commission"))
        satisfaction = _safe_float(_safe_get(survey, "satisfaction") or _safe_get(survey, "platformSatisfaction"))

        for p in platforms:
            name = str(p).strip()
            if not name:
                continue
            platform_data[name]["count"] += 1
            if commission > 0:
                platform_data[name]["commissions"].append(commission)
            if satisfaction > 0:
                platform_data[name]["satisfactions"].append(satisfaction)

    total = len(surveys)
    results: list[dict] = []
    for name, info in platform_data.items():
        count = info["count"]
        comms = info["commissions"]
        sats = info["satisfactions"]
        results.append({
            "name": name,
            "count": count,
            "percentage": round(count / total * 100, 1) if total else 0.0,
            "avgCommission": round(sum(comms) / len(comms), 1) if comms else None,
            "avgSatisfaction": round(sum(sats) / len(sats), 2) if sats else None,
        })

    results.sort(key=lambda x: x["count"], reverse=True)
    return {"platforms": results, "totalSurveys": total}


# ---------------------------------------------------------------------------
# Category distribution
# ---------------------------------------------------------------------------

def category_distribution(surveys: list[dict]) -> dict:
    """Count surveys by business category.

    Returns {categories: [{name, count, percentage}], totalSurveys}.
    """
    if not surveys:
        return {"categories": [], "totalSurveys": 0}

    counter: Counter = Counter()
    for survey in surveys:
        cat = _safe_get(survey, "category") or _safe_get(survey, "businessCategory") or "Unknown"
        counter[str(cat).strip()] += 1

    total = len(surveys)
    cats = [
        {"name": name, "count": count, "percentage": round(count / total * 100, 1)}
        for name, count in counter.most_common()
    ]
    return {"categories": cats, "totalSurveys": total}


# ---------------------------------------------------------------------------
# Commission analysis
# ---------------------------------------------------------------------------

def commission_analysis(surveys: list[dict]) -> dict:
    """Analyze commission rates across surveys.

    Returns average, median, min, max, and distribution buckets.
    """
    commissions: list[float] = []
    for survey in surveys:
        val = _safe_float(_safe_get(survey, "commissionRate") or _safe_get(survey, "commission"))
        if val > 0:
            commissions.append(val)

    if not commissions:
        return {
            "average": 0,
            "median": 0,
            "min": 0,
            "max": 0,
            "count": 0,
            "distribution": [],
        }

    commissions.sort()
    n = len(commissions)
    median = commissions[n // 2] if n % 2 == 1 else (commissions[n // 2 - 1] + commissions[n // 2]) / 2

    buckets = {"0-10%": 0, "10-15%": 0, "15-20%": 0, "20-25%": 0, "25-30%": 0, "30%+": 0}
    for c in commissions:
        if c < 10:
            buckets["0-10%"] += 1
        elif c < 15:
            buckets["10-15%"] += 1
        elif c < 20:
            buckets["15-20%"] += 1
        elif c < 25:
            buckets["20-25%"] += 1
        elif c < 30:
            buckets["25-30%"] += 1
        else:
            buckets["30%+"] += 1

    distribution = [{"range": k, "count": v} for k, v in buckets.items()]

    return {
        "average": round(sum(commissions) / n, 1),
        "median": round(median, 1),
        "min": round(min(commissions), 1),
        "max": round(max(commissions), 1),
        "count": n,
        "distribution": distribution,
    }


# ---------------------------------------------------------------------------
# Interest distribution
# ---------------------------------------------------------------------------

def interest_distribution(surveys: list[dict]) -> dict:
    """Count surveys by interest/willingness level.

    Returns {levels: [{level, count, percentage}], totalSurveys}.
    """
    if not surveys:
        return {"levels": [], "totalSurveys": 0}

    counter: Counter = Counter()
    for survey in surveys:
        interest = (
            _safe_get(survey, "wouldJoinRynOne")
            or _safe_get(survey, "interestLevel")
            or "unknown"
        )
        counter[str(interest).strip()] += 1

    total = len(surveys)
    levels = [
        {"level": level, "count": count, "percentage": round(count / total * 100, 1)}
        for level, count in counter.most_common()
    ]
    return {"levels": levels, "totalSurveys": total}


# ---------------------------------------------------------------------------
# Feature demand
# ---------------------------------------------------------------------------

def feature_demand(surveys: list[dict]) -> list[dict]:
    """Rank features by demand across all surveys.

    Returns a list of {feature, totalVotes, averageScore, surveyCount} sorted
    by averageScore descending.
    """
    if not surveys:
        return []

    feature_scores: dict[str, list[float]] = defaultdict(list)

    for survey in surveys:
        features = _safe_get(survey, "featureVotes") or _safe_get(survey, "features") or {}
        if not isinstance(features, dict):
            continue
        for key, value in features.items():
            score = _safe_float(value)
            feature_scores[key].append(score)

    results: list[dict] = []
    for feature, scores in feature_scores.items():
        results.append({
            "feature": feature,
            "totalVotes": len(scores),
            "averageScore": round(sum(scores) / len(scores), 2) if scores else 0,
            "surveyCount": len(scores),
        })

    results.sort(key=lambda x: x["averageScore"], reverse=True)
    return results


# ---------------------------------------------------------------------------
# Daily trend
# ---------------------------------------------------------------------------

def daily_trend(surveys: list[dict], days: int = 30) -> list[dict]:
    """Count surveys submitted per day over the last *days* days.

    Each survey is expected to have a ``createdAt`` or ``submittedAt`` field
    (ISO-8601 string or date string).

    Returns a list of {date, count} sorted chronologically.
    """
    if not surveys:
        return []

    today = datetime.utcnow().date()
    start_date = today - timedelta(days=days - 1)

    # Initialize all dates to 0
    date_counts: dict[str, int] = {}
    for i in range(days):
        d = start_date + timedelta(days=i)
        date_counts[d.isoformat()] = 0

    for survey in surveys:
        date_str = _safe_get(survey, "createdAt") or _safe_get(survey, "submittedAt")
        if not date_str:
            continue
        try:
            dt = datetime.fromisoformat(str(date_str).replace("Z", "+00:00"))
            d = dt.date()
        except (ValueError, TypeError):
            continue
        key = d.isoformat()
        if key in date_counts:
            date_counts[key] += 1

    return [{"date": date, "count": count} for date, count in sorted(date_counts.items())]


# ---------------------------------------------------------------------------
# Generate daily report
# ---------------------------------------------------------------------------

def generate_daily_report(surveys: list[dict], date: str | None = None) -> dict:
    """Generate a summary report for a specific date.

    If *date* is ``None``, uses today's date.  The report includes counts,
    top pain points, interest breakdown, and top categories for that day.
    """
    if date is None:
        target = datetime.utcnow().date()
    else:
        try:
            target = datetime.fromisoformat(date).date()
        except (ValueError, TypeError):
            target = datetime.utcnow().date()

    # Filter surveys for the target date
    day_surveys: list[dict] = []
    for survey in surveys:
        date_str = _safe_get(survey, "createdAt") or _safe_get(survey, "submittedAt")
        if not date_str:
            continue
        try:
            dt = datetime.fromisoformat(str(date_str).replace("Z", "+00:00"))
            if dt.date() == target:
                day_surveys.append(survey)
        except (ValueError, TypeError):
            continue

    total = len(day_surveys)

    # Top pain points for the day
    top_pains = aggregate_pain_points(day_surveys)[:5]

    # Interest breakdown for the day
    interest = interest_distribution(day_surveys)

    # Category breakdown for the day
    categories = category_distribution(day_surveys)

    # Commission summary
    comm = commission_analysis(day_surveys)

    return {
        "date": target.isoformat(),
        "totalSurveys": total,
        "topPainPoints": top_pains,
        "interestBreakdown": interest,
        "categoryBreakdown": categories,
        "commissionSummary": {
            "average": comm["average"],
            "median": comm["median"],
        },
    }
