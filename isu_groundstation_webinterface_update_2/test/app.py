from __future__ import annotations
import os
from pathlib import Path
from flask import Flask, jsonify, render_template, request
from gs_serial import GroundStationSerial, parse_hex_command

BASE_DIR = Path(__file__).resolve().parent
CAPTURE_DIR = BASE_DIR / "static" / "captures"

app = Flask(__name__)
gs = GroundStationSerial(CAPTURE_DIR)

GROUNDSTATION = {
    "name": os.getenv("GS_NAME", "ISU Groundstation"),
    "latitude": float(os.getenv("GS_LATITUDE", "48.5233")),
    "longitude": float(os.getenv("GS_LONGITUDE", "7.7369")),
    "altitude_m": float(os.getenv("GS_ALTITUDE_M", "143")),
}


def json_error(message: str, code: int = 400):
    return jsonify({"ok": False, "error": message, "status": gs.status()}), code


@app.route("/")
def index():
    return render_template("index.html", groundstation=GROUNDSTATION)


@app.route("/api/status")
def api_status():
    return jsonify({"ok": True, "status": gs.status(), "groundstation": GROUNDSTATION})


@app.route("/api/connect", methods=["POST"])
def api_connect():
    payload = request.get_json(silent=True) or request.form
    port = (payload.get("port") or "").strip()
    baudrate = int(payload.get("baudrate") or 115200)
    mock = str(payload.get("mock") or "").lower() in {"1", "true", "yes", "on"}

    if not port and not mock:
        return json_error("Enter the PC XBee COM port, for example COM15 or /dev/ttyUSB0.")
    try:
        gs.connect(port=port or "MOCK", baudrate=baudrate, mock=mock)
    except Exception as exc:
        return json_error(str(exc), 500)
    return jsonify({"ok": True, "status": gs.status()})


@app.route("/api/disconnect", methods=["POST"])
@app.route("/api/unlink", methods=["POST"])  # Backward-compatible alias.
def api_disconnect():
    gs.disconnect()
    return jsonify({"ok": True, "status": gs.status()})


@app.route("/api/uplink", methods=["POST"])
def api_uplink():
    payload = request.get_json(silent=True) or request.form
    command_text = payload.get("command") or ""
    try:
        command = parse_hex_command(command_text)
        gs.send_command(command)
    except Exception as exc:
        return json_error(str(exc))
    return jsonify({"ok": True, "sent": command.hex(" ").upper(), "status": gs.status()})


@app.route("/api/take-picture", methods=["POST"])
def api_take_picture():
    try:
        image_state = gs.take_picture(timeout_s=float(os.getenv("PICTURE_TIMEOUT_S", "60")))
    except Exception as exc:
        return json_error(str(exc), 504)
    return jsonify({"ok": True, "image": image_state.as_dict(), "status": gs.status()})


@app.route("/api/refresh-rate", methods=["POST"])
def api_refresh_rate():
    payload = request.get_json(silent=True) or request.form
    rate = payload.get("rate") or ""
    try:
        gs.set_refresh_rate(rate)
    except Exception as exc:
        return json_error(str(exc))
    return jsonify({"ok": True, "rate": rate, "status": gs.status()})


if __name__ == "__main__":
    app.run(
        host=os.getenv("FLASK_HOST", "127.0.0.1"),
        port=int(os.getenv("FLASK_PORT", "5000")),
        debug=True,
        threaded=True,
    )