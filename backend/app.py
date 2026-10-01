import os
from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

API_KEY = os.environ.get('WEATHER_API_KEY')

@app.route('/api/weather', methods=['GET'])
def get_weather():
    city = request.args.get('city', 'Karachi')
    if not API_KEY:
        return jsonify({'error': 'API key not configured on server'}), 500

    # WeatherAPI forecast endpoint use karte hain taake current + forecast dono data mil jaye
    url = f"http://api.weatherapi.com/v1/forecast.json?key={API_KEY}&q={city}&days=7"
    
    try:
        response = requests.get(url)
        data = response.json()
        if response.status_code == 200:
            return jsonify(data)
        else:
            return jsonify({'error': data.get('error', {}).get('message', 'Failed to fetch weather')}), response.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run()
