"""Serial/XBee manager for the ISU ground-station web interface.

The ESP32 sends two frame types over XBee/UART:

Image frame:
    0xDE 0xAD 0xBE 0xEF
    4-byte image length, big-endian
    raw JPEG bytes
    0xFE 0xED 0xFA 0xCE

Sensor frame:
    0xA1 0xB2 0xC3 0xD4
    block 2: 4-byte ID + 3 floats -> temperature, pressure, humidity
    block 3: 4-byte ID + 3 floats -> gyro x/y/z
    block 4: 4-byte ID + 3 floats -> accel x/y/z
    0x1E 0x2D 0x3C 0x4B

This module keeps ONE reader thread in charge of serial reads so that sensor
parsing cannot accidentally consume JPEG bytes during a picture transfer.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import datetime as dt
import random
import shutil
import struct
import threading
import time
from typing import Any, Dict, Optional

try:
    import serial  # type: ignore
except Exception:  # pragma: no cover - pyserial is installed by requirements.txt on the target PC
    serial = None


IMAGE_START = b"\xDE\xAD\xBE\xEF"
IMAGE_END = b"\xFE\xED\xFA\xCE"
SENSOR_HEADER = b"\xA1\xB2\xC3\xD4"
SENSOR_FOOTER = b"\x1E\x2D\x3C\x4B"

CMD_TAKE_PICTURE = bytes([0x13, 0xAA, 0xB0, 0x01])
REFRESH_COMMANDS = {
    "15s": bytes([0x13, 0xAA, 0x15, 0x01]),
    "30s": bytes([0x13, 0xAA, 0x30, 0x01]),
    "45s": bytes([0x13, 0xAA, 0x45, 0x01]),
    "60s": bytes([0x13, 0xAA, 0x60, 0x01]),
    "off": bytes([0x13, 0xAA, 0x00, 0x01]),
}


@dataclass
class SensorState:
    temperature: Optional[float] = None
    pressure: Optional[float] = None
    humidity: Optional[float] = None
    gyro_x: Optional[float] = None
    gyro_y: Optional[float] = None
    gyro_z: Optional[float] = None
    accel_x: Optional[float] = None
    accel_y: Optional[float] = None
    accel_z: Optional[float] = None
    updated_at: Optional[str] = None
    raw_frame_count: int = 0

    def as_dict(self) -> Dict[str, Any]:
        return self.__dict__.copy()


@dataclass
class ImageState:
    url: Optional[str] = None
    path: Optional[str] = None
    size_bytes: Optional[int] = None
    updated_at: Optional[str] = None

    def as_dict(self) -> Dict[str, Any]:
        return self.__dict__.copy()


class GroundStationSerial:
    """Manages serial connection, parsing, sensor state, and image reception."""

    def __init__(self, capture_dir: str | Path, static_url_prefix: str = "/static/captures") -> None:
        self.capture_dir = Path(capture_dir)
        self.capture_dir.mkdir(parents=True, exist_ok=True)
        self.static_url_prefix = static_url_prefix.rstrip("/")

        self._ser: Any = None
        self._lock = threading.RLock()
        self._write_lock = threading.RLock()
        self._stop_event = threading.Event()
        self._reader_thread: Optional[threading.Thread] = None
        self._mock_thread: Optional[threading.Thread] = None
        self._new_image_event = threading.Event()

        self._port: Optional[str] = None
        self._baudrate: int = 115200
        self._mock: bool = False
        self._last_error: Optional[str] = None

        self.sensor_state = SensorState()
        self.sensor_history: list[Dict[str, Any]] = []
        self._sensor_history_limit = 120
        self.image_state = ImageState()
        self._mock_image_index = 0

    @property
    def is_connected(self) -> bool:
        return self._mock or (self._ser is not None and getattr(self._ser, "is_open", False))

    @property
    def port(self) -> Optional[str]:
        return self._port

    @property
    def baudrate(self) -> int:
        return self._baudrate

    @property
    def last_error(self) -> Optional[str]:
        return self._last_error

    def connect(self, port: str, baudrate: int = 115200, mock: bool = False) -> None:
        """Open the serial port and start the reader thread.

        Use mock=True for development without hardware.
        """
        with self._lock:
            if self.is_connected:
                self.disconnect()

            self._port = port
            self._baudrate = baudrate
            self._mock = mock
            self._last_error = None
            self.sensor_state = SensorState()
            self.sensor_history = []
            self._stop_event.clear()
            self._new_image_event.clear()

            if mock:
                self._seed_mock_image()
                self._mock_thread = threading.Thread(target=self._mock_loop, name="mock-esp32", daemon=True)
                self._mock_thread.start()
                return

            if serial is None:
                raise RuntimeError("pyserial is not installed. Run: pip install -r requirements.txt")

            self._ser = serial.Serial(port=port, baudrate=baudrate, timeout=0.05)
            self._reader_thread = threading.Thread(target=self._reader_loop, name="serial-reader", daemon=True)
            self._reader_thread.start()

    def disconnect(self) -> None:
        with self._lock:
            self._stop_event.set()
            if self._reader_thread and self._reader_thread.is_alive():
                self._reader_thread.join(timeout=1.5)
            if self._mock_thread and self._mock_thread.is_alive():
                self._mock_thread.join(timeout=1.5)
            if self._ser is not None:
                try:
                    self._ser.close()
                except Exception:
                    pass
            self._ser = None
            self._reader_thread = None
            self._mock_thread = None
            self._mock = False
            self._port = None

    def send_command(self, command: bytes) -> None:
        if len(command) != 4:
            raise ValueError("Commands must be exactly 4 bytes.")

        if not self.is_connected:
            raise RuntimeError("Ground station is not connected to XBee serial port.")

        if self._mock:
            # In mock mode, fake image generation when picture command is sent.
            if command == CMD_TAKE_PICTURE:
                threading.Thread(target=self._mock_capture_image, name="mock-picture", daemon=True).start()
            return

        with self._write_lock:
            self._ser.write(command)
            self._ser.flush()

    def take_picture(self, timeout_s: float = 45.0) -> ImageState:
        self._new_image_event.clear()
        before = self.image_state.updated_at
        self.send_command(CMD_TAKE_PICTURE)
        received = self._new_image_event.wait(timeout=timeout_s)
        if not received and self.image_state.updated_at == before:
            raise TimeoutError("No JPEG image frame was received before the timeout.")
        return self.image_state

    def set_refresh_rate(self, label: str) -> None:
        key = label.strip().lower()
        if key not in REFRESH_COMMANDS:
            raise ValueError("Refresh rate must be one of: 15s, 30s, 45s, 60s, off")
        self.send_command(REFRESH_COMMANDS[key])

    def status(self) -> Dict[str, Any]:
        return {
            "connected": self.is_connected,
            "port": self._port,
            "baudrate": self._baudrate,
            "mock": self._mock,
            "last_error": self._last_error,
            "sensors": self.sensor_state.as_dict(),
            "sensor_history": list(self.sensor_history),
            "image": self.image_state.as_dict(),
        }

    def _reader_loop(self) -> None:
        buffer = bytearray()

        while not self._stop_event.is_set():
            try:
                chunk = self._ser.read(2048)
                if chunk:
                    buffer.extend(chunk)
                    self._drain_buffer(buffer)
                else:
                    time.sleep(0.01)
            except Exception as exc:
                self._last_error = f"Serial reader error: {exc}"
                time.sleep(0.2)

    def _drain_buffer(self, buffer: bytearray) -> None:
        """Parse complete frames from the serial byte buffer."""
        while True:
            if len(buffer) < 4:
                return

            # Drop noise until the next known frame marker.
            next_image = buffer.find(IMAGE_START)
            next_sensor = buffer.find(SENSOR_HEADER)
            indexes = [idx for idx in (next_image, next_sensor) if idx >= 0]
            if not indexes:
                del buffer[:-3]
                return
            start = min(indexes)
            if start > 0:
                del buffer[:start]

            if buffer.startswith(IMAGE_START):
                if not self._try_parse_image(buffer):
                    return
                continue

            if buffer.startswith(SENSOR_HEADER):
                if not self._try_parse_sensor(buffer):
                    return
                continue

    def _try_parse_image(self, buffer: bytearray) -> bool:
        if len(buffer) < 8:
            return False

        image_size = int.from_bytes(buffer[4:8], byteorder="big", signed=False)
        if image_size <= 0 or image_size > 5_000_000:
            # Bad length. Drop marker and keep looking.
            del buffer[:4]
            self._last_error = f"Invalid image size in frame: {image_size}"
            return True

        total_len = 4 + 4 + image_size + 4
        if len(buffer) < total_len:
            return False

        end = bytes(buffer[8 + image_size : total_len])
        if end != IMAGE_END:
            del buffer[:4]
            self._last_error = "Invalid image end marker. Dropped corrupt image frame."
            return True

        image_bytes = bytes(buffer[8 : 8 + image_size])
        del buffer[:total_len]
        self._save_image(image_bytes)
        return True

    def _save_image(self, image_bytes: bytes) -> None:
        now = dt.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        filename = f"capture_{now}.jpg"
        path = self.capture_dir / filename
        path.write_bytes(image_bytes)
        self.image_state = ImageState(
            url=f"{self.static_url_prefix}/{filename}",
            path=str(path),
            size_bytes=len(image_bytes),
            updated_at=dt.datetime.now().isoformat(timespec="seconds"),
        )
        self._new_image_event.set()

    def _try_parse_sensor(self, buffer: bytearray) -> bool:
        footer_index = buffer.find(SENSOR_FOOTER, len(SENSOR_HEADER))
        if footer_index < 0:
            # Expected frame is usually 56 bytes. If much larger, drop marker to recover.
            if len(buffer) > 1024:
                del buffer[:4]
                self._last_error = "Sensor frame footer not found. Dropped stale bytes."
                return True
            return False

        payload = bytes(buffer[len(SENSOR_HEADER) : footer_index])
        del buffer[: footer_index + len(SENSOR_FOOTER)]
        self._parse_sensor_payload(payload)
        return True

    def _parse_sensor_payload(self, payload: bytes) -> None:
        if len(payload) % 16 != 0:
            self._last_error = f"Sensor payload size is not a multiple of 16: {len(payload)}"
            return

        data: Dict[str, float] = {}
        for offset in range(0, len(payload), 16):
            block = payload[offset : offset + 16]
            block_id, values = self._decode_sensor_block(block)
            if block_id == 2:
                data["temperature"], data["pressure"], data["humidity"] = values
            elif block_id == 3:
                data["gyro_x"], data["gyro_y"], data["gyro_z"] = values
            elif block_id == 4:
                data["accel_x"], data["accel_y"], data["accel_z"] = values

        if not data:
            self._last_error = "Sensor frame decoded but no known block IDs were found."
            return

        current = self.sensor_state.as_dict()
        current.update(data)
        current["updated_at"] = dt.datetime.now().isoformat(timespec="seconds")
        current["raw_frame_count"] = (current.get("raw_frame_count") or 0) + 1
        self.sensor_state = SensorState(**current)
        self._append_sensor_history(self.sensor_state)

    def _append_sensor_history(self, sensor_state: SensorState) -> None:
        """Keep a compact rolling history for dashboard charts."""
        sample = sensor_state.as_dict()
        if not sample.get("updated_at"):
            return

        # Avoid duplicate points when the web UI polls faster than telemetry arrives.
        if self.sensor_history and self.sensor_history[-1].get("updated_at") == sample.get("updated_at"):
            self.sensor_history[-1] = sample
        else:
            self.sensor_history.append(sample)

        if len(self.sensor_history) > self._sensor_history_limit:
            self.sensor_history = self.sensor_history[-self._sensor_history_limit :]

    @staticmethod
    def _decode_sensor_block(block: bytes) -> tuple[int, tuple[float, float, float]]:
        """Decode one 16-byte sensor block from the ESP32 firmware.

        The reference ESP32 code in ``Interface_satellite_com_XBee-main`` writes
        sensor IDs manually as big-endian bytes, for example ``00 00 00 02``,
        then writes each float directly from ESP32 memory. ESP32 floats are
        little-endian. Reading the whole block as ``>Ifff`` makes the ID look
        right but decodes the floats with the wrong byte order, causing very
        large/incorrect values.
        """
        if len(block) != 16:
            raise ValueError(f"Sensor block must be 16 bytes, got {len(block)}")

        # Correct layout used by the supplied ESP32 firmware:
        #   ID:     big-endian unsigned int
        #   values: little-endian IEEE-754 floats
        block_id = int.from_bytes(block[:4], "big", signed=False)
        values = struct.unpack("<fff", block[4:16])
        if block_id in (2, 3, 4):
            return block_id, (float(values[0]), float(values[1]), float(values[2]))

        # Compatibility fallback for sketches that write the ID from memory too.
        block_id = int.from_bytes(block[:4], "little", signed=False)
        if block_id in (2, 3, 4):
            values = struct.unpack("<fff", block[4:16])
            return block_id, (float(values[0]), float(values[1]), float(values[2]))

        return -1, (float(values[0]), float(values[1]), float(values[2]))

    def _mock_loop(self) -> None:
        while not self._stop_event.is_set():
            self.sensor_state = SensorState(
                temperature=round(24.0 + random.uniform(-1.2, 1.2), 2),
                pressure=round(1000.0 + random.uniform(-4, 4), 2),
                humidity=round(42.0 + random.uniform(-5, 5), 2),
                gyro_x=round(random.uniform(-0.07, 0.07), 3),
                gyro_y=round(random.uniform(-0.07, 0.07), 3),
                gyro_z=round(random.uniform(-0.07, 0.07), 3),
                accel_x=round(random.uniform(-0.5, 0.5), 2),
                accel_y=round(-7.3 + random.uniform(-0.4, 0.4), 2),
                accel_z=round(-8.0 + random.uniform(-0.4, 0.4), 2),
                updated_at=dt.datetime.now().isoformat(timespec="seconds"),
                raw_frame_count=self.sensor_state.raw_frame_count + 1,
            )
            self._append_sensor_history(self.sensor_state)
            time.sleep(2)

    def _mock_image_files(self) -> list[Path]:
        mock_dir = self.capture_dir.parent / "mock_images"
        if not mock_dir.exists():
            return []
        return sorted(
            [p for p in mock_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}]
        )

    def _copy_mock_image_to_captures(self, source: Path) -> None:
        now = dt.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        suffix = source.suffix.lower() if source.suffix else ".jpg"
        filename = f"mock_capture_{now}{suffix}"
        destination = self.capture_dir / filename
        shutil.copyfile(source, destination)
        self.image_state = ImageState(
            url=f"{self.static_url_prefix}/{filename}",
            path=str(destination),
            size_bytes=destination.stat().st_size,
            updated_at=dt.datetime.now().isoformat(timespec="seconds"),
        )
        self._new_image_event.set()

    def _seed_mock_image(self) -> None:
        """Show a real sample picture as soon as mock mode is connected."""
        images = self._mock_image_files()
        if images and not self.image_state.url:
            self._copy_mock_image_to_captures(images[0])

    def _mock_capture_image(self) -> None:
        # Use bundled sample captures instead of a blank 1x1 JPEG. This makes
        # mock mode useful for validating the UI before the XBee/camera link is
        # connected. Each click cycles through the available dummy pictures.
        time.sleep(0.7)
        images = self._mock_image_files()
        if images:
            source = images[self._mock_image_index % len(images)]
            self._mock_image_index += 1
            self._copy_mock_image_to_captures(source)
            return

        # Fallback tiny valid JPEG if the sample images are accidentally removed.
        jpeg_1x1 = bytes.fromhex(
            "ffd8ffe000104a46494600010101006000600000ffdb0043000302020302020303030304030304050805050404050a070706080c0a0c0c0b0a0b0b0d0e12100d0e110e0b0b1016101113141515150c0f171816141812141514ffdb00430103040405040509050509140d0b0d141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414ffc00011080001000103012200021101031101ffc40014000100000000000000000000000000000000000008ffc40014100100000000000000000000000000000000000000ffda000c03010002110311003f00b2c001ffd9"
        )
        self._save_image(jpeg_1x1)


def parse_hex_command(text: str) -> bytes:
    """Parse a 4-byte command from values like '0x13 0xAA 0xB0 0x01' or '13 AA B0 01'."""
    clean = text.replace(",", " ").replace(";", " ").strip()
    if not clean:
        raise ValueError("Command cannot be empty.")

    parts = clean.split()
    if len(parts) == 1 and len(parts[0].replace("0x", "")) == 8:
        raw = parts[0].replace("0x", "")
        parts = [raw[i : i + 2] for i in range(0, len(raw), 2)]

    values = []
    for part in parts:
        token = part.lower().removeprefix("0x")
        if len(token) == 0 or len(token) > 2:
            raise ValueError(f"Invalid byte: {part}")
        values.append(int(token, 16))

    if len(values) != 4:
        raise ValueError("Command must contain exactly 4 bytes.")
    if any(value < 0 or value > 255 for value in values):
        raise ValueError("Each command byte must be between 0x00 and 0xFF.")
    return bytes(values)
