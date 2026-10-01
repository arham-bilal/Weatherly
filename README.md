
# Weatherly – live weather dashboard (Flask + vanilla JS)
🔗 **Live Demo:** [https://weatherly-three-ashy.vercel.app/](https://weatherly-three-ashy.vercel.app/)
Default location: **Karachi, Sindh, Pakistan**. All data is fetched live from WeatherAPI.com by the Python backend; the API key never reaches the browser.

## 1. Install dependencies
```bash
cd weather-app
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r backend/requirements.txt
```

## 2. Create an API key
Sign up free at https://www.weatherapi.com/ and copy the key from your dashboard.
Note: the free plan returns up to 3 forecast days after the trial; the trial (and paid plans) return 7+. The UI shows however many days the API returns.

## 3. Set `.env`
```
WEATHER_API_KEY=your_real_key
```
`.env` is git-ignored. Never commit it.

## 4. Run the backend
```bash
python backend/app.py
```

## 5. Open the frontend
Go to http://127.0.0.1:5000 (Flask serves the frontend too). Opening `frontend/index.html` directly also works while the backend runs.

## 6. Test
- Karachi loads automatically with live data.
- Search Lahore, Dubai, London, New York: the theme changes with the weather.
- Type `asdfghjk`: shows "Location not found."
- Stop the backend or use a wrong key: shows "Unable to fetch weather data. Please try again."
- Direct API check: http://127.0.0.1:5000/api/weather?city=London
- Resize the window or use browser dev tools' device mode to check mobile layout.

## 7. Deploy (Render example)
1. Push the project to GitHub (without `.env`).
2. New Web Service on https://render.com, connect the repo.
3. Build command: `pip install -r backend/requirements.txt`
4. Start command: `gunicorn --chdir backend app:app`
5. Add environment variable `WEATHER_API_KEY` in the dashboard. Deploy.
Railway, Fly.io or PythonAnywhere work the same way.

## Structure
```
backend/app.py               Flask routes, error handling
backend/weather_service.py   API client, caching, data shaping, theme mapping
frontend/index.html|style.css|script.js
```
