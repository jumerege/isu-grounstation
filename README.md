# ISU Mission Operations Ground Station

Modern Flask-based ground station dashboard for ISU satellite missions with live ISS tracking, telemetry monitoring, and image processing.

## Features

✨ **Modern UI**
- Dark theme with space-inspired gradients
- Responsive design for all devices
- Real-time sensor telemetry charts
- Live ISS tracking with N2YO widget

📊 **Capabilities**
- Serial communication with ESP32/XBee hardware
- Camera image capture and processing (grayscale, threshold, edge detection)
- Environment sensor data (temperature, humidity, pressure)
- Motion sensors (accelerometer, gyroscope)
- Configurable refresh rates
- Mock mode for testing without hardware

🛰️ **ISS Tracking**
- Live ISS position map
- Next pass predictions table
- Real-time satellite status
- Ground station location display

## Quick Start

### Local Development

```bash
# Clone and setup
git clone https://github.com/yourusername/isu_groundstation.git
cd isu_groundstation

# Install dependencies
pip install -r requirements.txt

# Run Flask app
python app.py
```

Visit `http://127.0.0.1:5000` in your browser.

### Configuration

Set environment variables in `.env`:

```env
GS_NAME=ISU Groundstation
GS_LATITUDE=48.5233
GS_LONGITUDE=7.7369
GS_ALTITUDE_M=143
FLASK_HOST=127.0.0.1
FLASK_PORT=5000
PICTURE_TIMEOUT_S=60
```

### Hardware Requirements (Optional)

- ESP32 Wrover Module with OV2640 camera
- BME280 environment sensor
- MPU-6050 IMU sensor
- XBee or USB serial adapter

### Mock Mode

For testing without hardware:
1. Check the "Mock" checkbox in the UI
2. App will use simulated sensor data
3. Perfect for development and UI testing

## Deployment

### Deploy to Render (Free)

1. Fork this repository
2. Connect to [Render.com](https://render.com)
3. Create new Web Service
4. Build command: `pip install -r requirements.txt`
5. Start command: `python app.py`
6. Add environment variables in settings

### Deploy to Railway

1. Fork this repository
2. Connect to [Railway.app](https://railway.app)
3. Railway auto-detects Python/Flask
4. Add environment variables
5. Deploy with one click

## Project Structure

```
groundstation_app/
├── app.py                 # Flask application
├── gs_serial.py           # Serial communication
├── requirements.txt       # Python dependencies
├── templates/
│   └── index.html         # Main dashboard UI
├── static/
│   ├── app.js            # Frontend JavaScript
│   ├── style.css         # Styling
│   ├── isu_logo.png      # ISU branding
│   └── captures/         # Camera images
└── .env                  # Configuration (not committed)
```

## API Endpoints

- `GET /` - Main dashboard
- `GET /api/status` - Current system status
- `POST /api/connect` - Connect to serial device
- `POST /api/disconnect` - Disconnect serial
- `POST /api/uplink` - Send command to satellite
- `POST /api/take-picture` - Capture camera image
- `POST /api/refresh-rate` - Set telemetry refresh rate

## Technologies

- **Backend**: Flask 2.3.3
- **Frontend**: Vanilla JavaScript with Chart.js
- **Maps**: Leaflet.js
- **ISS Tracking**: N2YO.com API widget
- **Hardware**: PySerial for ESP32 communication

## License

ISU - International Space University

## Contact

For questions or issues, please open a GitHub issue.
