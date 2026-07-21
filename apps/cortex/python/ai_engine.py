"""AI Engine module for generating summaries and calculating lead scores."""

from typing import Any


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_get(data: dict, key: str, default: Any = None) -> Any:
    """Safely retrieve a value from a dict, returning *default* if missing or None."""
    val = data.get(key)
    return val if val is not None else default


def _safe_float(value: Any, default: float = 0.0) -> float:
    """Convert *value* to float, falling back to *default*."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    """Convert *value* to int, falling back to *default*."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _list_to_sentence(items: list[str]) -> str:
    """Join a list of strings into a comma-separated sentence fragment."""
    if not items:
        return "none specified"
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + " and " + items[-1]


# ---------------------------------------------------------------------------
# Pain-point label map (reused across summaries and scoring)
# ---------------------------------------------------------------------------

PAIN_POINT_LABELS: dict[str, str] = {
    "highCommission": "high commission",
    "lateRiders": "late/delayed rider arrivals",
    "customerComplaints": "customer complaints",
    "poorSupport": "poor platform support",
    "limitedMenu": "limited menu control",
    "paymentDelays": "payment settlement delays",
    "lowVisibility": "low online visibility",
    "orderCancellations": "frequent order cancellations",
    "packagingCost": "high packaging cost",
    "noAnalytics": "lack of analytics/insights",
}


# ---------------------------------------------------------------------------
# Vendor summary
# ---------------------------------------------------------------------------

def generate_vendor_summary(data: dict) -> str:
    """Generate a rule-based summary paragraph from vendor survey data.

    Handles missing fields gracefully -- sentences are only included when
    the underlying data is present.
    """
    sentences: list[str] = []

    # Business identity
    name = _safe_get(data, "businessName") or _safe_get(data, "name")
    category = _safe_get(data, "category") or _safe_get(data, "businessCategory")
    years = _safe_get(data, "yearsInBusiness") or _safe_get(data, "years")
    if name:
        frag = f"Business: {name}"
        if category:
            frag += f" ({category})"
        if years is not None:
            frag += f" operating for {years} years"
        sentences.append(frag + ".")

    # Location
    location = _safe_get(data, "location") or _safe_get(data, "city") or _safe_get(data, "area")
    if location:
        sentences.append(f"Located in {location}.")

    # Employees & branches
    employees = _safe_get(data, "employees") or _safe_get(data, "totalEmployees")
    branches = _safe_get(data, "branches") or _safe_get(data, "totalBranches")
    parts: list[str] = []
    if employees is not None:
        parts.append(f"{employees} employees")
    if branches is not None:
        parts.append(f"{branches} branch(es)")
    if parts:
        sentences.append("Has " + " and ".join(parts) + ".")

    # Current platforms
    platforms = _safe_get(data, "currentPlatforms") or _safe_get(data, "platforms") or []
    if isinstance(platforms, list) and platforms:
        sentences.append(f"Currently uses {_list_to_sentence(platforms)}.")

    # Commission
    commission = _safe_get(data, "commissionRate") or _safe_get(data, "commission")
    if commission is not None:
        sentences.append(f"Paying approximately {commission}% commission.")

    # Orders
    online_orders = _safe_get(data, "onlineOrders") or _safe_get(data, "dailyOnlineOrders")
    walkin_orders = _safe_get(data, "walkinOrders") or _safe_get(data, "dailyWalkinOrders")
    total_orders = _safe_get(data, "totalOrders") or _safe_get(data, "dailyOrders")
    online_val = _safe_int(online_orders)
    walkin_val = _safe_int(walkin_orders)
    total_val = _safe_int(total_orders) or (online_val + walkin_val)
    if total_val > 0:
        detail = f"Receives approximately {total_val} daily orders"
        breakdown_parts: list[str] = []
        if online_val:
            breakdown_parts.append(f"{online_val} online")
        if walkin_val:
            breakdown_parts.append(f"{walkin_val} walk-in")
        if breakdown_parts:
            detail += f" ({', '.join(breakdown_parts)})"
        sentences.append(detail + ".")

    # AOV
    aov = _safe_get(data, "averageOrderValue") or _safe_get(data, "aov")
    if aov is not None:
        sentences.append(f"Average order value: ₹{aov}.")

    # Delivery
    has_delivery = _safe_get(data, "hasDelivery") or _safe_get(data, "ownDelivery")
    has_website = _safe_get(data, "hasWebsite") or _safe_get(data, "website")
    has_app = _safe_get(data, "hasApp") or _safe_get(data, "app")
    online_bits: list[str] = []
    if has_delivery:
        online_bits.append("own delivery")
    if has_website:
        online_bits.append("a website")
    if has_app:
        online_bits.append("a mobile app")
    if online_bits:
        sentences.append("Already has " + _list_to_sentence(online_bits) + ".")

    # Pain points
    pain_points: dict = _safe_get(data, "painPoints") or {}
    if isinstance(pain_points, dict) and pain_points:
        top_pains = sorted(pain_points.items(), key=lambda kv: _safe_float(kv[1]), reverse=True)[:3]
        labels = [PAIN_POINT_LABELS.get(k, k) for k, _ in top_pains]
        sentences.append(f"Main pain points: {_list_to_sentence(labels)}.")

    # Interest level
    interest = _safe_get(data, "wouldJoinRynOne") or _safe_get(data, "interestLevel")
    if interest:
        readable = {
            "immediately": "Immediately ready to switch",
            "within_3_months": "Willing to switch within 3 months",
            "maybe": "Open to considering",
            "no": "Not currently interested",
        }
        sentences.append(f"Interest in RynOne: {readable.get(interest, interest)}.")

    # Key requirements
    requirements = _safe_get(data, "requirements") or _safe_get(data, "keyRequirements") or []
    if isinstance(requirements, list) and requirements:
        sentences.append(f"Key requirements: {_list_to_sentence(requirements)}.")

    # Feature votes
    features = _safe_get(data, "featureVotes") or _safe_get(data, "features") or {}
    if isinstance(features, dict) and features:
        top_features = sorted(features.items(), key=lambda kv: _safe_float(kv[1]), reverse=True)[:3]
        labels = [k for k, _ in top_features]
        sentences.append(f"Most desired features: {_list_to_sentence(labels)}.")

    # Sentiment
    sentiment = _safe_get(data, "sentiment") or _safe_get(data, "businessSentiment")
    if sentiment:
        sentences.append(f"Business sentiment: {sentiment}.")

    if not sentences:
        return "Insufficient data to generate a vendor summary."

    return " ".join(sentences)


# ---------------------------------------------------------------------------
# Rider summary
# ---------------------------------------------------------------------------

def generate_rider_summary(data: dict) -> str:
    """Generate a rule-based summary paragraph from rider survey data."""
    sentences: list[str] = []

    name = _safe_get(data, "name") or _safe_get(data, "riderName")
    if name:
        sentences.append(f"Rider: {name}.")

    age = _safe_get(data, "age")
    if age is not None:
        sentences.append(f"Age: {age}.")

    location = _safe_get(data, "location") or _safe_get(data, "city") or _safe_get(data, "area")
    if location:
        sentences.append(f"Based in {location}.")

    experience = _safe_get(data, "experience") or _safe_get(data, "yearsExperience")
    if experience is not None:
        sentences.append(f"Has {experience} years of delivery experience.")

    platforms = _safe_get(data, "currentPlatforms") or _safe_get(data, "platforms") or []
    if isinstance(platforms, list) and platforms:
        sentences.append(f"Currently delivers for {_list_to_sentence(platforms)}.")

    daily_deliveries = _safe_get(data, "dailyDeliveries") or _safe_get(data, "deliveriesPerDay")
    if daily_deliveries is not None:
        sentences.append(f"Completes approximately {daily_deliveries} deliveries per day.")

    earnings = _safe_get(data, "dailyEarnings") or _safe_get(data, "earnings")
    if earnings is not None:
        sentences.append(f"Daily earnings: ₹{earnings}.")

    vehicle = _safe_get(data, "vehicleType") or _safe_get(data, "vehicle")
    if vehicle:
        sentences.append(f"Vehicle: {vehicle}.")

    has_smartphone = _safe_get(data, "hasSmartphone")
    if has_smartphone is not None:
        sentences.append("Has a smartphone." if has_smartphone else "Does not have a smartphone.")

    # Pain points
    pain_points: dict = _safe_get(data, "painPoints") or {}
    if isinstance(pain_points, dict) and pain_points:
        top_pains = sorted(pain_points.items(), key=lambda kv: _safe_float(kv[1]), reverse=True)[:3]
        labels = [k for k, _ in top_pains]
        sentences.append(f"Main concerns: {_list_to_sentence(labels)}.")

    interest = _safe_get(data, "wouldJoinRynOne") or _safe_get(data, "interestLevel")
    if interest:
        readable = {
            "immediately": "Immediately ready to join",
            "within_3_months": "Willing to join within 3 months",
            "maybe": "Open to considering",
            "no": "Not currently interested",
        }
        sentences.append(f"Interest in RynOne: {readable.get(interest, interest)}.")

    availability = _safe_get(data, "availability") or _safe_get(data, "workHours")
    if availability:
        sentences.append(f"Availability: {availability}.")

    if not sentences:
        return "Insufficient data to generate a rider summary."

    return " ".join(sentences)


# ---------------------------------------------------------------------------
# Vendor lead score
# ---------------------------------------------------------------------------

def calculate_lead_score(data: dict) -> dict:
    """Calculate a weighted lead score (0-100) for a vendor survey.

    Returns a dict with ``score``, ``label``, and ``breakdown``.
    """
    breakdown: dict[str, dict] = {}

    # 1. Interest level -- 25 pts
    interest = _safe_get(data, "wouldJoinRynOne") or _safe_get(data, "interestLevel") or ""
    interest_map = {"immediately": 25, "within_3_months": 18, "maybe": 10, "no": 0}
    interest_score = interest_map.get(interest.lower().strip(), 5)
    breakdown["interestLevel"] = {"score": interest_score, "max": 25, "value": interest}

    # 2. Daily orders -- 20 pts
    online_orders = _safe_int(_safe_get(data, "onlineOrders") or _safe_get(data, "dailyOnlineOrders"))
    walkin_orders = _safe_int(_safe_get(data, "walkinOrders") or _safe_get(data, "dailyWalkinOrders"))
    total_orders = _safe_int(_safe_get(data, "totalOrders") or _safe_get(data, "dailyOrders")) or (online_orders + walkin_orders)
    orders_score = min(20, round((total_orders / 50) * 20)) if total_orders > 0 else 0
    breakdown["dailyOrders"] = {"score": orders_score, "max": 20, "value": total_orders}

    # 3. Pain points severity -- 15 pts
    pain_points: dict = _safe_get(data, "painPoints") or {}
    if isinstance(pain_points, dict) and pain_points:
        avg_pain = sum(_safe_float(v) for v in pain_points.values()) / len(pain_points)
        pain_score = min(15, round((avg_pain / 5) * 15))
    else:
        avg_pain = 0.0
        pain_score = 0
    breakdown["painPointsSeverity"] = {"score": pain_score, "max": 15, "value": round(avg_pain, 2)}

    # 4. Current commission -- 15 pts
    commission = _safe_float(_safe_get(data, "commissionRate") or _safe_get(data, "commission"))
    if commission >= 25:
        comm_score = 15
    elif commission >= 20:
        comm_score = 12
    elif commission >= 15:
        comm_score = 9
    elif commission >= 10:
        comm_score = 6
    elif commission > 0:
        comm_score = 3
    else:
        comm_score = 0
    breakdown["currentCommission"] = {"score": comm_score, "max": 15, "value": commission}

    # 5. Business maturity -- 10 pts
    years = _safe_float(_safe_get(data, "yearsInBusiness") or _safe_get(data, "years"))
    employees = _safe_int(_safe_get(data, "employees") or _safe_get(data, "totalEmployees"))
    branches = _safe_int(_safe_get(data, "branches") or _safe_get(data, "totalBranches"))
    maturity_raw = 0.0
    maturity_raw += min(4.0, years)  # up to 4 pts for years
    maturity_raw += min(3.0, employees / 5)  # up to 3 pts for employees (15+ = max)
    maturity_raw += min(3.0, branches * 1.5)  # up to 3 pts for branches (2+ = max)
    maturity_score = min(10, round(maturity_raw))
    breakdown["businessMaturity"] = {
        "score": maturity_score,
        "max": 10,
        "value": {"years": years, "employees": employees, "branches": branches},
    }

    # 6. Online readiness -- 10 pts
    readiness_pts = 0
    has_delivery = _safe_get(data, "hasDelivery") or _safe_get(data, "ownDelivery")
    has_website = _safe_get(data, "hasWebsite") or _safe_get(data, "website")
    has_app = _safe_get(data, "hasApp") or _safe_get(data, "app")
    platforms_list = _safe_get(data, "currentPlatforms") or _safe_get(data, "platforms") or []
    if has_delivery:
        readiness_pts += 3
    if has_website:
        readiness_pts += 3
    if has_app:
        readiness_pts += 2
    if isinstance(platforms_list, list) and len(platforms_list) > 0:
        readiness_pts += min(2, len(platforms_list))
    readiness_score = min(10, readiness_pts)
    breakdown["onlineReadiness"] = {"score": readiness_score, "max": 10}

    # 7. Feature interest -- 5 pts
    features: dict = _safe_get(data, "featureVotes") or _safe_get(data, "features") or {}
    if isinstance(features, dict) and features:
        avg_feature = sum(_safe_float(v) for v in features.values()) / len(features)
        feature_score = min(5, round((avg_feature / 5) * 5))
    else:
        avg_feature = 0.0
        feature_score = 0
    breakdown["featureInterest"] = {"score": feature_score, "max": 5, "value": round(avg_feature, 2)}

    # Total
    total = (
        interest_score
        + orders_score
        + pain_score
        + comm_score
        + maturity_score
        + readiness_score
        + feature_score
    )
    total = min(100, max(0, total))

    # Label
    if total >= 75:
        label = "High Potential"
    elif total >= 50:
        label = "Medium"
    elif total >= 25:
        label = "Low"
    else:
        label = "Unlikely"

    return {"score": total, "label": label, "breakdown": breakdown}


# ---------------------------------------------------------------------------
# Rider lead score
# ---------------------------------------------------------------------------

def calculate_rider_score(data: dict) -> dict:
    """Calculate a weighted lead score (0-100) for a rider survey.

    Weights are tuned for rider-specific attributes.
    """
    breakdown: dict[str, dict] = {}

    # 1. Interest level -- 30 pts (riders: slightly heavier weight on intent)
    interest = _safe_get(data, "wouldJoinRynOne") or _safe_get(data, "interestLevel") or ""
    interest_map = {"immediately": 30, "within_3_months": 22, "maybe": 12, "no": 0}
    interest_score = interest_map.get(interest.lower().strip(), 5)
    breakdown["interestLevel"] = {"score": interest_score, "max": 30, "value": interest}

    # 2. Daily deliveries -- 20 pts
    deliveries = _safe_int(
        _safe_get(data, "dailyDeliveries") or _safe_get(data, "deliveriesPerDay")
    )
    deliveries_score = min(20, round((deliveries / 30) * 20)) if deliveries > 0 else 0
    breakdown["dailyDeliveries"] = {"score": deliveries_score, "max": 20, "value": deliveries}

    # 3. Experience -- 15 pts
    experience = _safe_float(_safe_get(data, "experience") or _safe_get(data, "yearsExperience"))
    exp_score = min(15, round(experience * 3))  # 5+ years = max
    breakdown["experience"] = {"score": exp_score, "max": 15, "value": experience}

    # 4. Pain points severity -- 15 pts
    pain_points: dict = _safe_get(data, "painPoints") or {}
    if isinstance(pain_points, dict) and pain_points:
        avg_pain = sum(_safe_float(v) for v in pain_points.values()) / len(pain_points)
        pain_score = min(15, round((avg_pain / 5) * 15))
    else:
        avg_pain = 0.0
        pain_score = 0
    breakdown["painPointsSeverity"] = {"score": pain_score, "max": 15, "value": round(avg_pain, 2)}

    # 5. Availability / flexibility -- 10 pts
    availability = _safe_get(data, "availability") or _safe_get(data, "workHours") or ""
    avail_map = {"full_time": 10, "part_time": 6, "weekends": 4, "flexible": 8}
    avail_score = avail_map.get(availability.lower().strip(), 3) if availability else 0
    breakdown["availability"] = {"score": avail_score, "max": 10, "value": availability}

    # 6. Tech readiness -- 10 pts
    has_smartphone = _safe_get(data, "hasSmartphone")
    vehicle = _safe_get(data, "vehicleType") or _safe_get(data, "vehicle")
    tech_pts = 0
    if has_smartphone:
        tech_pts += 5
    if vehicle:
        tech_pts += 5
    tech_score = min(10, tech_pts)
    breakdown["techReadiness"] = {"score": tech_score, "max": 10}

    # Total
    total = interest_score + deliveries_score + exp_score + pain_score + avail_score + tech_score
    total = min(100, max(0, total))

    if total >= 75:
        label = "High Potential"
    elif total >= 50:
        label = "Medium"
    elif total >= 25:
        label = "Low"
    else:
        label = "Unlikely"

    return {"score": total, "label": label, "breakdown": breakdown}
