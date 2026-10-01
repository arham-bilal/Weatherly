import os
from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

# Direct environment variable catch karega
API_KEY = os.environ.get('WEATHER_API_KEY')

@app.route('/api/weather', methods=['GET'])
def get_weather():
    city = request.args.get('city')
    if not city:
        return jsonify({'error': 'City is required'}), 400
    
    if not API_KEY:
        return jsonify({'error': 'API key not configured on server'}), 500

    url = f"http://api.weatherapi.com/v1/current.json?key={API_KEY}&q={city}"
    
    try:
        response = requests.get(url)
        data = response.json()
        if response.status_code == 200:
            return jsonify(data)
        else:
            return jsonify({'error': data.get('error', {}).get('message', 'Failed to fetch weather')}), response.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Vercel serverless entry point
if __name__ == '__main__':
    app.run()
