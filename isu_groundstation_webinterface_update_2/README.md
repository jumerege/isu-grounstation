# ISU Ground Station Web Interface
This project is a simplified mission operations ground station.

It allows students to: 
- connect to an XBee communication link; 
- send commands to an ESP32 payload; 
- receive sensor telemetry; 
- display camera images; 
- track the ISS position; 
- test the system using mock mode. 

## How to run 
1. Install dependencies: pip install -r requirements.txt 
2. Start the Flask server: python app.py 
3. Open the browser: http://127.0.0.1:5000 