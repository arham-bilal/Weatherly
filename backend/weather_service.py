"""Talks to WeatherAPI.com and converts its response into a compact, stable
structure for the frontend. Missing fields become None (never invented)."""
import os
import time
import requests

BASE_URL = "https://api.weatherapi.com/v1/forecast.json"
CACHE_TTL = 600  # seconds; protects the free API quota
_cache = {}


class WeatherError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.message, self.status = message, status


# WeatherAPI condition codes grouped into visual themes.
SNOW = {1066, 1114, 1117, 1204, 1207, 1210, 1213, 1216, 1219, 1222, 1225, 1237,
        1249, 1252, 1255, 1258, 1261, 1264, 1279, 1282}
RAIN = {1063, 1069, 1072, 1087, 1150, 1153, 1168, 1171, 1180, 1183, 1186, 1189,
        1192, 1195, 1198, 1201, 1240, 1243, 1246, 1273, 1276}
CLOUDY = {1003, 1006, 1009, 1030, 1135, 1147}


def theme_for(code):
    if code in SNOW:
        return "snow"
    if code in RAIN:
        return "rain"
    if code in CLOUDY:
        return "cloudy"
    return "clear"  # 1000 and anything unknown


def _get(d, key):
    """Return d[key] or None when absent/empty."""
    v = d.get(key) if isinstance(d, dict) else None
    return None if v in ("", None) else v


def _icon(cond):
    url = _get(cond, "icon")
    return ("https:" + url) if url and url.startswith("//") else url


def _hour(h):
    c = h.get("condition", {})
    return {
        "time": _get(h, "time"), "epoch": _get(h, "time_epoch"),
        "temp": _get(h, "temp_c"), "condition": _get(c, "text"), "icon": _icon(c),
        "rain_chance": _get(h, "chance_of_rain"), "humidity": _get(h, "humidity"),
        "is_day": _get(h, "is_day"), "theme": theme_for(c.get("code")),
    }


def _shape(raw):
    loc, cur = raw["location"], raw["current"]
    cond = cur.get("condition", {})
    days = []
    for d in raw["forecast"]["forecastday"]:
        day, dc = d.get("day", {}), d.get("day", {}).get("condition", {})
        days.append({
            "date": d.get("date"), "condition": _get(dc, "text"), "icon": _icon(dc),
            "min": _get(day, "mintemp_c"), "max": _get(day, "maxtemp_c"),
            "rain_chance": _get(day, "daily_chance_of_rain"),
            "sunrise": _get(d.get("astro", {}), "sunrise"),
            "sunset": _get(d.get("astro", {}), "sunset"),
            "moon_phase": _get(d.get("astro", {}), "moon_phase"),
            "hours": [_hour(h) for h in d.get("hour", [])],
        })
    now = loc.get("localtime_epoch", 0)
    upcoming = [h for day in days for h in day["hours"]
                if h["epoch"] and h["epoch"] >= now - 1800][:24]
    today = days[0] if days else {}
    return {
        "location": {"name": loc.get("name"), "region": loc.get("region"),
                     "country": loc.get("country"), "tz_id": loc.get("tz_id"),
                     "localtime": loc.get("localtime")},
        "current": {
            "temp": _get(cur, "temp_c"), "feels_like": _get(cur, "feelslike_c"),
            "condition": _get(cond, "text"), "icon": _icon(cond),
            "humidity": _get(cur, "humidity"), "wind_kph": _get(cur, "wind_kph"),
            "wind_dir": _get(cur, "wind_dir"), "visibility_km": _get(cur, "vis_km"),
            "pressure_mb": _get(cur, "pressure_mb"), "uv": _get(cur, "uv"),
            "is_day": bool(cur.get("is_day", 1)), "cloud": _get(cur, "cloud"),
            "sunrise": today.get("sunrise"), "sunset": today.get("sunset"),
            "moon_phase": today.get("moon_phase"),
            "updated": _get(cur, "last_updated"),
        },
        "theme": theme_for(cond.get("code")),
        "hourly": upcoming, "daily": days,
    }


def get_weather(city, days=7, lang="en"):
    key = os.getenv("WEATHER_API_KEY")
    if not key or key == "your_key_here":
        raise WeatherError("Server is missing WEATHER_API_KEY.", 500)
    ck = city.lower() + "|" + lang + "|" + lang
    hit = _cache.get(ck)
    if hit and time.time() - hit[0] < CACHE_TTL:
        return hit[1]
    try:
        r = requests.get(BASE_URL, timeout=10, params={
            "key": key, "q": city, "days": days, "aqi": "yes", "alerts": "no", "lang": lang})
    except requests.RequestException:
        raise WeatherError("Network error while contacting the weather service.", 503)
    if r.status_code != 200:
        try:
            code = r.json().get("error", {}).get("code")
        except ValueError:
            code = None
        if code == 1006:
            raise WeatherError("Location not found.", 404)
        if r.status_code in (401, 403) or code in (1002, 2006, 2007, 2008, 2009):
            raise WeatherError("Weather API key is invalid or its quota is used up.", 502)
        raise WeatherError("Weather service returned an error.", 502)
    try:
        data = _shape(r.json())
    except (KeyError, ValueError, TypeError):
        raise WeatherError("Unexpected response from the weather service.", 502)
    _cache[ck] = (time.time(), data)
    return data
