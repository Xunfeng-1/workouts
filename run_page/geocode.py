"""Fill missing activity countries from the route start point.

Nominatim's usage policy is one request per second and cached results.
Failures are skipped so a Garmin sync still commits tracks.
"""

import json
import time
from pathlib import Path

import polyline
from geopy.exc import GeocoderServiceError, GeocoderTimedOut, GeocoderUnavailable
from geopy.geocoders import Nominatim

CACHE_PATH = Path(__file__).with_name("geocode_cache.json")
MIN_INTERVAL_SECONDS = 1.1
USER_AGENT = "xunfeng-workouts (https://github.com/Xunfeng-1/workouts)"

_geocoder = Nominatim(user_agent=USER_AGENT, timeout=10)
_last_request_at = 0.0


def needs_location(value) -> bool:
    if value is None:
        return True
    text = str(value).strip()
    return text in ("", "None", "China")


def start_coordinates(summary_polyline, start_latlng=None):
    """Return (lat, lon) for the start of a route, or None."""
    if start_latlng:
        try:
            lat = getattr(start_latlng, "lat", None)
            lon = getattr(start_latlng, "lon", None)
            if lat is None or lon is None:
                lat, lon = start_latlng[0], start_latlng[1]
            lat, lon = float(lat), float(lon)
            if abs(lat) <= 90 and abs(lon) <= 180:
                return lat, lon
        except (TypeError, ValueError, IndexError):
            pass
    if not summary_polyline:
        return None
    try:
        points = polyline.decode(summary_polyline)
    except Exception:  # noqa: BLE001
        return None
    if not points:
        return None
    lat, lon = points[0]
    if abs(lat) > 90 or abs(lon) > 180:
        return None
    return float(lat), float(lon)


def _cache_key(lat, lon) -> str:
    return f"{lat:.3f},{lon:.3f}"


def _load_cache() -> dict:
    if not CACHE_PATH.exists():
        return {}
    try:
        data = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def _save_cache(cache: dict) -> None:
    tmp = CACHE_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(cache, ensure_ascii=False, sort_keys=True), encoding="utf-8")
    tmp.replace(CACHE_PATH)


def _wait_for_nominatim() -> None:
    global _last_request_at
    elapsed = time.monotonic() - _last_request_at
    if elapsed < MIN_INTERVAL_SECONDS:
        time.sleep(MIN_INTERVAL_SECONDS - elapsed)
    _last_request_at = time.monotonic()


def reverse_country(lat, lon, cache=None):
    """Return a display address ending in the country name, or None.

    Cached hits do not call Nominatim. Network errors return None.
    """
    key = _cache_key(lat, lon)
    own_cache = cache is None
    if cache is None:
        cache = _load_cache()
    cached = cache.get(key)
    if isinstance(cached, str) and cached.strip():
        return cached

    location = None
    for attempt in range(2):
        _wait_for_nominatim()
        try:
            location = _geocoder.reverse(
                (lat, lon),
                language="zh-CN",
                addressdetails=True,
                timeout=10,
            )
            break
        except (GeocoderTimedOut, GeocoderServiceError, GeocoderUnavailable) as exc:
            print(f"Nominatim attempt {attempt + 1} failed: {exc}")
            time.sleep(2**attempt)
        except Exception as exc:  # noqa: BLE001
            print(f"Nominatim error: {exc}")
            return None
    if location is None or not getattr(location, "address", None):
        return None
    address = str(location.address).strip()
    if not address:
        return None
    cache[key] = address
    if own_cache:
        _save_cache(cache)
    return address


def backfill_missing_locations(session, dry_run=False):
    """Fill activities whose location_country is empty but have a route.

    Returns (filled, checked). Stops after several consecutive Nominatim
    failures so a daily sync is not stuck, and never raises.
    """
    from generator.db import Activity

    try:
        rows = (
            session.query(Activity)
            .filter(Activity.summary_polyline.isnot(None))
            .all()
        )
    except Exception as exc:  # noqa: BLE001
        print(f"location backfill skipped: {exc}")
        return 0, 0

    cache = _load_cache()
    cache_dirty = False
    filled = 0
    checked = 0
    consecutive_failures = 0
    for activity in rows:
        if not needs_location(activity.location_country):
            continue
        coords = start_coordinates(activity.summary_polyline)
        if coords is None:
            continue
        checked += 1
        before = len(cache)
        address = reverse_country(coords[0], coords[1], cache=cache)
        if len(cache) != before:
            cache_dirty = True
            _save_cache(cache)
            cache_dirty = False
        if not address:
            consecutive_failures += 1
            print(f"no location for activity {activity.run_id}")
            if consecutive_failures >= 5:
                print("stopping location backfill after repeated Nominatim failures")
                break
            continue
        consecutive_failures = 0
        country = address.split(",")[-1].strip()
        print(f"location {activity.run_id}: {country}")
        if not dry_run:
            activity.location_country = address
            filled += 1
        else:
            filled += 1
    if cache_dirty:
        _save_cache(cache)
    if filled and not dry_run:
        session.commit()
    print(f"location backfill: filled {filled}, looked up {checked}")
    return filled, checked
