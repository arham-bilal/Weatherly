"""Flask app: serves the frontend and exposes GET /api/weather?city=..."""
import os
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory

ROOT = os.path.join(os.path.dirname(__file__), "..")
load_dotenv(os.path.join(ROOT, ".env"))  # must run before weather_service reads env

from weather_service import get_weather, WeatherError  # noqa: E402

FRONTEND = os.path.abspath(os.path.join(ROOT, "frontend"))
DEFAULT_CITY = "Karachi, Sindh, Pakistan"
app = Flask(__name__, static_folder=FRONTEND, static_url_path="")


@app.after_request
def cors(resp):  # lets you open index.html directly from disk during development
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


@app.route("/")
def index():
    return send_from_directory(FRONTEND, "index.html")


@app.route("/api/weather")
def weather():
    city = (request.args.get("city") or DEFAULT_CITY).strip()[:80]
    if not city:
        return jsonify(error="Location not found."), 404
    try:
        return jsonify(get_weather(city, lang=request.args.get("lang", "en")[:6]))
    except WeatherError as e:
        return jsonify(error=e.message), e.status
    except Exception:  # never crash the server on unexpected errors
        app.logger.exception("Unhandled error")
        return jsonify(error="Unable to fetch weather data. Please try again."), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", 5000)), debug=True)
