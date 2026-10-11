import os
from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

API_KEY = os.environ.get('WEATHER_API_KEY')

# Languages the frontend can request for translated condition text
# (WeatherAPI.com translates its condition strings natively).
SUPPORTED_LANGS = ('en', 'es', 'fr', 'ar', 'ur')

# WeatherAPI condition codes grouped into visual themes.
# Codes are language-independent, so the theme stays correct even when
# the condition text comes back translated (e.g. "Despejado" for Clear).
_SNOW = {1066, 1114, 1117, 1204, 1207, 1210, 1213, 1216, 1219, 1222, 1225, 1237,
         1249, 1252, 1255, 1258, 1261, 1264, 1279, 1282}
_RAIN = {1063, 1069, 1072, 1087, 1150, 1153, 1168, 1171, 1180, 1183, 1186, 1189,
         1192, 1195, 1198, 1201, 1240, 1243, 1246, 1273, 1276}
_CLOUDY = {1003, 1006, 1009, 1030, 1135, 1147}

def get_theme(condition_code):
    if condition_code in _SNOW:
        return 'snow'
    if condition_code in _RAIN:
        return 'rain'
    if condition_code in _CLOUDY:
        return 'cloudy'
    return 'clear'  # 1000 (Sunny/Clear) and anything unknown

@app.route('/api/weather', methods=['GET'])
def get_weather():
    city = request.args.get('city', 'Karachi')
    lang = request.args.get('lang', 'en')
    if lang not in SUPPORTED_LANGS:
        lang = 'en'
    if not API_KEY:
        return jsonify({'error': 'API key not configured on server'}), 500

    url = f"http://api.weatherapi.com/v1/forecast.json?key={API_KEY}&q={city}&days=7&aqi=yes&lang={lang}"
    
    try:
        response = requests.get(url)
        raw = response.json()
        
        if response.status_code != 200:
            return jsonify({'error': raw.get('error', {}).get('message', 'Failed to fetch weather')}), response.status_code

        loc = raw.get('location', {})
        cur = raw.get('current', {})
        forecast_days = raw.get('forecast', {}).get('forecastday', [])

        cond = cur.get('condition', {})
        is_day = cur.get('is_day', 1)
        theme = get_theme(cond.get('code'))

        # Air quality mapping
        aqi_data = cur.get('air_quality', {})
        pm25 = aqi_data.get('pm2_5')
        epa_index = aqi_data.get('us-epa-index', 1)

        current_mapped = {
            "temp": cur.get('temp_c'),
            "feels_like": cur.get('feelslike_c'),
            "condition": cond.get('text'),
            "icon": "https:" + cond.get('icon') if cond.get('icon') else "",
            "is_day": bool(is_day),
            "humidity": cur.get('humidity'),
            "wind_kph": cur.get('wind_kph'),
            "wind_dir": cur.get('wind_dir'),
            "wind_degree": cur.get('wind_degree'),
            "visibility_km": cur.get('vis_km'),
            "pressure_mb": cur.get('pressure_mb'),
            "uv": cur.get('uv'),
            "cloud": cur.get('cloud'),
            "gust_kph": cur.get('gust_kph'),
            "pm25": pm25,
            "aqi_index": epa_index,
            "updated": cur.get('last_updated')
        }

        daily_mapped = []
        for day in forecast_days:
            day_info = day.get('day', {})
            astro = day.get('astro', {})
            day_cond = day_info.get('condition', {})
            
            hours_mapped = []
            for h in day.get('hour', []):
                h_cond = h.get('condition', {})
                hours_mapped.append({
                    "time": h.get('time'),
                    "temp": h.get('temp_c'),
                    "condition": h_cond.get('text'),
                    "icon": "https:" + h_cond.get('icon') if h_cond.get('icon') else "",
                    "rain_chance": h.get('chance_of_rain', 0),
                    "humidity": h.get('humidity')
                })

            daily_mapped.append({
                "date": day.get('date'),
                "max": day_info.get('maxtemp_c'),
                "min": day_info.get('mintemp_c'),
                "condition": day_cond.get('text'),
                "icon": "https:" + day_cond.get('icon') if day_cond.get('icon') else "",
                "rain_chance": day_info.get('daily_chance_of_rain', 0),
                "sunrise": astro.get('sunrise'),
                "sunset": astro.get('sunset'),
                "moon_phase": astro.get('moon_phase'),
                "hours": hours_mapped
            })

        # Today's hours or full hours list from first day/combined
        today_hours = daily_mapped[0]['hours'] if daily_mapped else []

        # Update current sunrise/sunset from today's forecast astro if available
        if daily_mapped:
            current_mapped["sunrise"] = daily_mapped[0].get("sunrise")
            current_mapped["sunset"] = daily_mapped[0].get("sunset")
            current_mapped["moon_phase"] = daily_mapped[0].get("moon_phase")

        payload = {
            "location": {
                "name": loc.get('name'),
                "region": loc.get('region'),
                "country": loc.get('country'),
                "tz_id": loc.get('tz_id')
            },
            "current": current_mapped,
            "theme": theme,
            "hourly": today_hours,
            "daily": daily_mapped
        }

        return jsonify(payload)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run()
