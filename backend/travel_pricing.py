"""Route-based travel pricing: Base → Pickup → Disposal → Base.

Pure helpers (settings coercion, math) plus a server-side Google Directions
call. All secrets stay in backend env; nothing here is exposed to the client.
"""
import logging
import math
import os
from datetime import datetime, timezone
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

DEFAULT_SETTINGS = {
    "travel_pricing_enabled": True,
    "tow_mpg": 8.0,
    "gas_price_per_gallon": 4.79,
    "maintenance_pct": 14.0,
    "recover_processing_fees": True,
    "processing_pct": 2.9,
    "processing_fixed_fee": 0.30,
    "base_address": "7777 Saturn Dr, Flagstaff, AZ 86004",
    "disposal_address": "Cinder Lake Landfill, 10955 N US-89, Flagstaff, AZ 86004",
    "default_disposal_fee": 35.0,
    "rounding_increment": 5.0,
    "max_service_miles": 40.0,
    "out_of_area_message": "Looks like you're a bit outside our regular service area. Give us a call at (928) 853-9619 and we'll put together a custom quote for you.",
}

_NUMERIC_BOUNDS = {
    "tow_mpg": (1.0, 100.0),
    "gas_price_per_gallon": (0.0, 50.0),
    "maintenance_pct": (0.0, 100.0),
    "processing_pct": (0.0, 20.0),
    "processing_fixed_fee": (0.0, 10.0),
    "default_disposal_fee": (0.0, 5000.0),
    "rounding_increment": (0.01, 500.0),
    "max_service_miles": (0.0, 2000.0),
}


def coerce_settings(raw: Optional[dict]) -> dict:
    """Merge a stored/submitted dict over defaults with type + range validation."""
    out = dict(DEFAULT_SETTINGS)
    if not isinstance(raw, dict):
        return out
    for key, (lo, hi) in _NUMERIC_BOUNDS.items():
        if key in raw and raw[key] is not None:
            try:
                out[key] = min(hi, max(lo, float(raw[key])))
            except (TypeError, ValueError):
                pass
    for key in ("travel_pricing_enabled", "recover_processing_fees"):
        if key in raw:
            out[key] = bool(raw[key])
    for key in ("base_address", "disposal_address", "out_of_area_message"):
        if key in raw and raw[key] is not None:
            out[key] = str(raw[key]).strip()[:500]
    return out


def pickup_leg_miles(route: dict) -> float:
    """One-way Base → Pickup distance (first leg) for the service-radius cap."""
    legs = route.get("legs") or []
    return float(legs[0]["miles"]) if legs else 0.0


def outside_service_area(route: dict, settings: dict) -> bool:
    """True when a cap is set (>0) and the pickup is farther than it (one-way)."""
    cap = float(settings.get("max_service_miles") or 0)
    return cap > 0 and pickup_leg_miles(route) > cap


def missing_required(settings: dict) -> list:
    """Names of settings that make an automatic quote impossible."""
    missing = []
    if not settings.get("base_address"):
        missing.append("base_address")
    if not settings.get("disposal_address"):
        missing.append("disposal_address")
    if float(settings.get("tow_mpg") or 0) <= 0:
        missing.append("tow_mpg")
    if float(settings.get("gas_price_per_gallon") or 0) <= 0:
        missing.append("gas_price_per_gallon")
    if float(settings.get("rounding_increment") or 0) <= 0:
        missing.append("rounding_increment")
    return missing


def round_up(value: float, increment: float) -> float:
    if increment <= 0:
        return round(value, 2)
    return round(math.ceil(round(value, 6) / increment) * increment, 2)


def compute_pricing(base_price: float, route_miles: float, settings: dict,
                    heavy_item_fees: float = 0.0, disposal_fees: Optional[float] = None) -> dict:
    """Frozen breakdown for one quote. Every input used is echoed back so the
    record never changes when settings change later."""
    mpg = float(settings["tow_mpg"])
    gas = float(settings["gas_price_per_gallon"])
    maint_pct = float(settings["maintenance_pct"]) / 100.0
    disposal = float(settings["default_disposal_fee"]) if disposal_fees is None else float(disposal_fees)
    gallons = route_miles / mpg if mpg > 0 else 0.0
    fuel_cost = gallons * gas
    subtotal = float(base_price) + fuel_cost + float(heavy_item_fees) + disposal
    maintenance = subtotal * maint_pct
    internal_price = subtotal + maintenance

    recover = bool(settings.get("recover_processing_fees"))
    pct = float(settings["processing_pct"]) / 100.0 if recover else 0.0
    fixed = float(settings["processing_fixed_fee"]) if recover else 0.0
    grossed = (internal_price + fixed) / (1.0 - pct) if pct < 1 else internal_price
    processing_allowance = grossed - internal_price
    final_price = round_up(grossed, float(settings["rounding_increment"]))

    return {
        "base_price": round(float(base_price), 2),
        "route_miles": round(route_miles, 2),
        "gallons": round(gallons, 3),
        "fuel_cost": round(fuel_cost, 2),
        "heavy_item_fees": round(float(heavy_item_fees), 2),
        "disposal_fees": round(disposal, 2),
        "subtotal": round(subtotal, 2),
        "maintenance_reserve": round(maintenance, 2),
        "internal_price": round(internal_price, 2),
        "processing_allowance": round(processing_allowance, 2),
        "pre_rounding_price": round(grossed, 2),
        "final_price": final_price,
        "inputs": {
            "tow_mpg": mpg,
            "gas_price_per_gallon": gas,
            "maintenance_pct": float(settings["maintenance_pct"]),
            "recover_processing_fees": recover,
            "processing_pct": float(settings["processing_pct"]),
            "processing_fixed_fee": float(settings["processing_fixed_fee"]),
            "rounding_increment": float(settings["rounding_increment"]),
            "base_address": settings["base_address"],
            "disposal_address": settings["disposal_address"],
        },
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }


class RoutingError(Exception):
    """Raised when Google cannot validate the address or route the trip."""


async def google_route_miles(base_address: str, pickup_address: str, disposal_address: str) -> dict:
    """Driving distance for Base → Pickup → Disposal → Base via Google Directions.

    Returns {miles, legs:[{from,to,miles}], resolved_pickup}. Raises RoutingError
    on any validation/routing failure so the caller can flag manual review.
    """
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY", "").strip()
    if not api_key:
        raise RoutingError("Google Maps API key not configured on server")
    pickup_address = (pickup_address or "").strip()
    if len(pickup_address) < 5:
        raise RoutingError("Pickup address is too short to route")

    params = {
        "origin": base_address,
        "destination": base_address,
        "waypoints": f"{pickup_address}|{disposal_address}",
        "units": "imperial",
        "mode": "driving",
        "key": api_key,
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get("https://maps.googleapis.com/maps/api/directions/json", params=params)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise RoutingError(f"Google Directions request failed: {exc}") from exc

    status = data.get("status")
    if status != "OK":
        detail = data.get("error_message") or status or "unknown"
        raise RoutingError(f"Google Directions could not route this trip ({detail})")

    route = (data.get("routes") or [{}])[0]
    legs = route.get("legs") or []
    if len(legs) != 3:
        raise RoutingError(f"Unexpected route shape ({len(legs)} legs)")
    geocoded = data.get("geocoded_waypoints") or []
    if len(geocoded) >= 2 and geocoded[1].get("geocoder_status") != "OK":
        raise RoutingError("Google Maps could not validate the pickup address")
    if len(geocoded) >= 2 and geocoded[1].get("partial_match"):
        raise RoutingError("Pickup address only partially matched — needs manual confirmation")

    total_m = sum(int((leg.get("distance") or {}).get("value") or 0) for leg in legs)
    if total_m <= 0:
        raise RoutingError("Google returned a zero-length route")
    return {
        "miles": round(total_m / 1609.344, 2),
        "legs": [
            {
                "from": leg.get("start_address"),
                "to": leg.get("end_address"),
                "miles": round(int((leg.get("distance") or {}).get("value") or 0) / 1609.344, 2),
            }
            for leg in legs
        ],
        "resolved_pickup": legs[0].get("end_address"),
    }
