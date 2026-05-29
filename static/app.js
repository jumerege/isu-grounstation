const connectionState = document.getElementById('connection-state');
const updatedAt = document.getElementById('updated-at');
const connectForm = document.getElementById('connect-form');
const unlinkButton = document.getElementById('unlink-button');
const uplinkForm = document.getElementById('uplink-form');
const uplinkButton = document.getElementById('uplink-button');
const pictureButton = document.getElementById('picture-button');
const commandInput = document.getElementById('command-input');
const portInput = document.getElementById('port-input');
const mockInput = document.getElementById('mock-input');
const captureImage = document.getElementById('capture-image');
const imagePlaceholder = document.getElementById('image-placeholder');
const processedCanvas = document.getElementById('processed-canvas');
const processMode = document.getElementById('process-mode');
const thresholdInput = document.getElementById('threshold-input');
const thresholdValue = document.getElementById('threshold-value');
const downloadProcessedButton = document.getElementById('download-processed');
const imageStats = document.getElementById('image-stats');
const toast = document.getElementById('toast');
const dataStatusButton = document.getElementById('data-status-button');
const refreshButtons = [...document.querySelectorAll('[data-rate]')];
const chartCanvases = [...document.querySelectorAll('[data-chart]')];

const SENSOR_HISTORY_LIMIT = 120;
const PROCESSING_MAX_WIDTH = 1280;

let toastTimer;
let sensorHistory = [];
let lastImageUrl = null;
let dataReading = false;
let lastDataTime = null;

const chartSeries = {
  environment: {
    title: 'Environment',
    scale: 'per-series',
    series: [
      { key: 'temperature', label: 'Temp', unit: 'degC', stroke: '#158ce1' },
      { key: 'humidity', label: 'Humidity', unit: '%', stroke: '#19a974' },
      { key: 'pressure', label: 'Pressure', unit: 'hPa', stroke: '#7b61ff' },
    ],
  },
  acceleration: {
    title: 'Acceleration',
    scale: 'shared',
    series: [
      { key: 'accel_x', label: 'X', unit: 'm/s2', stroke: '#e4572e' },
      { key: 'accel_y', label: 'Y', unit: 'm/s2', stroke: '#19a974' },
      { key: 'accel_z', label: 'Z', unit: 'm/s2', stroke: '#158ce1' },
    ],
  },
  gyroscope: {
    title: 'Gyroscope',
    scale: 'shared',
    series: [
      { key: 'gyro_x', label: 'X', unit: 'deg/s', stroke: '#e4572e' },
      { key: 'gyro_y', label: 'Y', unit: 'deg/s', stroke: '#19a974' },
      { key: 'gyro_z', label: 'Z', unit: 'deg/s', stroke: '#158ce1' },
    ],
  },
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
}

async function requestJSON(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

function formatValue(value, unit = '') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return unit ? `-- ${unit}` : '--';
  }
  const numeric = Number(value);
  const decimals = Math.abs(numeric) >= 100 ? 2 : 3;
  const rendered = numeric.toFixed(decimals).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  return `${rendered}${unit ? ` ${unit}` : ''}`;
}

function setControlsEnabled(connected) {
  uplinkButton.disabled = !connected;
  pictureButton.disabled = !connected;
  refreshButtons.forEach(button => { button.disabled = !connected; });
}

function setImageControlsEnabled(enabled) {
  [processMode, thresholdInput, downloadProcessedButton].forEach(control => {
    if (control) control.disabled = !enabled;
  });
}

function updateImage(imageState) {
  if (!imageState || !imageState.url) return;
  const cacheBuster = imageState.updated_at ? `?t=${encodeURIComponent(imageState.updated_at)}` : `?t=${Date.now()}`;
  const nextUrl = `${imageState.url}${cacheBuster}`;
  if (nextUrl === lastImageUrl) return;
  lastImageUrl = nextUrl;
  captureImage.src = nextUrl;
  captureImage.hidden = false;
  processedCanvas.hidden = true;
  imagePlaceholder.hidden = true;
  setImageControlsEnabled(false);
  imageStats.textContent = 'Loading image...';
}

function sanitizeSensorSample(sample) {
  const clean = { updated_at: sample.updated_at || sample.ts || null };
  Object.values(chartSeries).forEach(group => {
    group.series.forEach(({ key }) => {
      const numeric = Number(sample[key]);
      clean[key] = Number.isFinite(numeric) ? numeric : null;
    });
  });
  return clean;
}

function mergeSensorHistory(samples) {
  if (!Array.isArray(samples)) return;
  samples.forEach(sample => {
    const clean = sanitizeSensorSample(sample || {});
    if (!clean.updated_at) return;
    const alreadyExists = sensorHistory.some(existing => existing.updated_at === clean.updated_at);
    if (!alreadyExists) sensorHistory.push(clean);
  });
  sensorHistory = sensorHistory.slice(-SENSOR_HISTORY_LIMIT);
}

function updateStatus(payload) {
  const status = payload.status || payload;
  const sensors = status.sensors || {};

  connectionState.textContent = status.connected
    ? `connected${status.port ? ` (${status.port})` : ''}${status.mock ? ' · mock' : ''}`
    : 'disconnected';
  updatedAt.textContent = sensors.updated_at || '--';
  setControlsEnabled(Boolean(status.connected));

  document.querySelectorAll('[data-value]').forEach(element => {
    const key = element.dataset.value;
    const unit = element.dataset.unit || '';
    element.textContent = formatValue(sensors[key], unit);
  });

  mergeSensorHistory(status.sensor_history || []);
  if (sensors.updated_at) mergeSensorHistory([sensors]);
  
  // Update data reading status
  if (sensors.updated_at && sensors.updated_at !== '--') {
    dataReading = true;
    lastDataTime = new Date();
    dataStatusButton.classList.remove('status-inactive');
    dataStatusButton.classList.add('status-active');
    dataStatusButton.querySelector('.status-text').textContent = 'Data: Reading ✓';
  } else {
    dataReading = false;
    dataStatusButton.classList.remove('status-active');
    dataStatusButton.classList.add('status-inactive');
    dataStatusButton.querySelector('.status-text').textContent = 'Data: Not Reading';
  }
  
  drawAllCharts();

  updateImage(status.image);

  if (status.last_error) {
    console.warn(status.last_error);
  }
}

async function pollStatus() {
  try {
    const payload = await requestJSON('/api/status');
    updateStatus(payload);
  } catch (error) {
    console.error(error);
  }
}

function setCanvasPixelSize(canvas, cssWidth, cssHeight) {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(cssWidth * ratio));
  canvas.height = Math.max(1, Math.round(cssHeight * ratio));
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return context;
}

function getChartValues(seriesConfig, scaleMode) {
  const allValues = [];
  const perSeriesRange = {};
  seriesConfig.forEach(series => {
    const values = sensorHistory
      .map(sample => sample[series.key])
      .filter(value => Number.isFinite(value));
    if (values.length > 0) {
      const min = Math.min(...values);
      const max = Math.max(...values);
      perSeriesRange[series.key] = min === max ? { min: min - 1, max: max + 1 } : { min, max };
      allValues.push(...values);
    }
  });

  if (allValues.length === 0) {
    return { hasData: false, sharedRange: { min: 0, max: 1 }, perSeriesRange };
  }

  const sharedMin = Math.min(...allValues);
  const sharedMax = Math.max(...allValues);
  const padding = Math.max((sharedMax - sharedMin) * 0.08, 0.5);
  const sharedRange = sharedMin === sharedMax
    ? { min: sharedMin - 1, max: sharedMax + 1 }
    : { min: sharedMin - padding, max: sharedMax + padding };

  if (scaleMode === 'per-series') {
    Object.keys(perSeriesRange).forEach(key => {
      const range = perSeriesRange[key];
      const rangePadding = Math.max((range.max - range.min) * 0.08, 0.1);
      perSeriesRange[key] = { min: range.min - rangePadding, max: range.max + rangePadding };
    });
  }

  return { hasData: true, sharedRange, perSeriesRange };
}

function yForValue(value, range, top, bottom) {
  const span = range.max - range.min || 1;
  const normalized = (value - range.min) / span;
  return bottom - normalized * (bottom - top);
}

function drawLegend(context, config, canvasWidth, top) {
  const latest = sensorHistory[sensorHistory.length - 1] || {};
  let x = 12;
  const y = top + 5;
  context.font = '11px Arial, Helvetica, sans-serif';
  config.series.forEach(series => {
    const value = latest[series.key];
    const label = `${series.label}: ${formatValue(value, series.unit)}`;
    context.fillStyle = series.stroke;
    context.fillRect(x, y - 8, 9, 9);
    context.fillStyle = '#39424e';
    context.fillText(label, x + 13, y);
    x += Math.min(context.measureText(label).width + 34, canvasWidth / config.series.length + 35);
  });
}

function drawChart(canvas) {
  const config = chartSeries[canvas.dataset.chart];
  if (!config) return;

  const cssWidth = canvas.clientWidth || 300;
  const cssHeight = canvas.clientHeight || 155;
  const context = setCanvasPixelSize(canvas, cssWidth, cssHeight);

  context.clearRect(0, 0, cssWidth, cssHeight);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, cssWidth, cssHeight);

  const left = 35;
  const right = cssWidth - 12;
  const top = 31;
  const bottom = cssHeight - 28;

  context.strokeStyle = '#dfe4ea';
  context.lineWidth = 1;
  for (let i = 0; i <= 3; i += 1) {
    const y = top + ((bottom - top) * i) / 3;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();
  }

  context.fillStyle = '#111827';
  context.font = 'bold 12px Arial, Helvetica, sans-serif';
  context.fillText(config.title, 12, 17);

  if (sensorHistory.length < 2) {
    context.fillStyle = '#7a828e';
    context.font = '12px Arial, Helvetica, sans-serif';
    context.fillText('Waiting for sensor samples...', left, top + 34);
    return;
  }

  const { hasData, sharedRange, perSeriesRange } = getChartValues(config.series, config.scale);
  if (!hasData) return;

  config.series.forEach(series => {
    const range = config.scale === 'per-series' ? (perSeriesRange[series.key] || sharedRange) : sharedRange;
    context.beginPath();
    let started = false;
    sensorHistory.forEach((sample, index) => {
      const value = sample[series.key];
      if (!Number.isFinite(value)) return;
      const x = left + ((right - left) * index) / Math.max(sensorHistory.length - 1, 1);
      const y = yForValue(value, range, top, bottom);
      if (!started) {
        context.moveTo(x, y);
        started = true;
      } else {
        context.lineTo(x, y);
      }
    });
    context.strokeStyle = series.stroke;
    context.lineWidth = 2;
    context.stroke();
  });

  context.fillStyle = '#7a828e';
  context.font = '10px Arial, Helvetica, sans-serif';
  const first = sensorHistory[0]?.updated_at?.split('T').pop() || '';
  const last = sensorHistory[sensorHistory.length - 1]?.updated_at?.split('T').pop() || '';
  context.fillText(first, left, cssHeight - 9);
  const lastWidth = context.measureText(last).width;
  context.fillText(last, right - lastWidth, cssHeight - 9);

  if (config.scale === 'per-series') {
    context.fillText('auto-scaled', left, 18);
  } else {
    context.fillText(formatValue(sharedRange.max), 4, top + 4);
    context.fillText(formatValue(sharedRange.min), 4, bottom);
  }

  drawLegend(context, config, cssWidth, bottom + 14);
}

function drawAllCharts() {
  chartCanvases.forEach(drawChart);
}

function getProcessingCanvasSize() {
  const naturalWidth = captureImage.naturalWidth || 0;
  const naturalHeight = captureImage.naturalHeight || 0;
  if (!naturalWidth || !naturalHeight) return { width: 0, height: 0 };
  const scale = Math.min(1, PROCESSING_MAX_WIDTH / naturalWidth);
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  };
}

function calculateImageStats(imageData, edgePixels = null) {
  const data = imageData.data;
  let brightnessTotal = 0;
  let minBrightness = 255;
  let maxBrightness = 0;
  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    brightnessTotal += brightness;
    minBrightness = Math.min(minBrightness, brightness);
    maxBrightness = Math.max(maxBrightness, brightness);
  }
  const pixelCount = data.length / 4;
  const average = pixelCount ? brightnessTotal / pixelCount : 0;
  const edgeInfo = edgePixels === null ? '' : ` · Edge pixels: ${edgePixels.toFixed(1)}%`;
  return `${captureImage.naturalWidth}x${captureImage.naturalHeight}px · Avg brightness: ${average.toFixed(1)} · Range: ${minBrightness.toFixed(0)}-${maxBrightness.toFixed(0)}${edgeInfo}`;
}

function applyImageProcessing() {
  if (!captureImage.complete || !captureImage.naturalWidth) return;

  const { width, height } = getProcessingCanvasSize();
  if (!width || !height) return;

  processedCanvas.width = width;
  processedCanvas.height = height;
  const context = processedCanvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(captureImage, 0, 0, width, height);
  const original = context.getImageData(0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  const mode = processMode.value;
  const threshold = Number(thresholdInput.value || 128);
  let edgePixels = null;

  if (mode === 'original') {
    captureImage.hidden = false;
    processedCanvas.hidden = true;
    imageStats.textContent = calculateImageStats(original);
    setImageControlsEnabled(true);
    return;
  }

  if (mode === 'grayscale' || mode === 'threshold') {
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      const output = mode === 'threshold' ? (gray >= threshold ? 255 : 0) : gray;
      data[i] = output;
      data[i + 1] = output;
      data[i + 2] = output;
    }
  }

  if (mode === 'contrast') {
    const factor = 1.45;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.max(0, Math.min(255, (data[i] - 128) * factor + 128));
      data[i + 1] = Math.max(0, Math.min(255, (data[i + 1] - 128) * factor + 128));
      data[i + 2] = Math.max(0, Math.min(255, (data[i + 2] - 128) * factor + 128));
    }
  }

  if (mode === 'invert') {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
  }

  if (mode === 'edges') {
    const gray = new Uint8ClampedArray(width * height);
    for (let i = 0, pixel = 0; i < original.data.length; i += 4, pixel += 1) {
      gray[pixel] = Math.round(0.299 * original.data[i] + 0.587 * original.data[i + 1] + 0.114 * original.data[i + 2]);
    }

    let edgeCount = 0;
    data.fill(255);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const p = y * width + x;
        const gx =
          -gray[p - width - 1] + gray[p - width + 1]
          - 2 * gray[p - 1] + 2 * gray[p + 1]
          - gray[p + width - 1] + gray[p + width + 1];
        const gy =
          -gray[p - width - 1] - 2 * gray[p - width] - gray[p - width + 1]
          + gray[p + width - 1] + 2 * gray[p + width] + gray[p + width + 1];
        const magnitude = Math.min(255, Math.sqrt(gx * gx + gy * gy));
        const output = magnitude >= threshold ? 0 : 255;
        if (output === 0) edgeCount += 1;
        const dataIndex = p * 4;
        data[dataIndex] = output;
        data[dataIndex + 1] = output;
        data[dataIndex + 2] = output;
        data[dataIndex + 3] = 255;
      }
    }
    edgePixels = (edgeCount / (width * height)) * 100;
  }

  context.putImageData(imageData, 0, 0);
  captureImage.hidden = true;
  processedCanvas.hidden = false;
  imageStats.textContent = calculateImageStats(original, edgePixels);
  setImageControlsEnabled(true);
}

connectForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const payload = await requestJSON('/api/connect', {
      method: 'POST',
      body: JSON.stringify({
        port: portInput.value.trim(),
        baudrate: 115200,
        mock: mockInput.checked,
      }),
    });
    sensorHistory = [];
    updateStatus(payload);
    showToast('Connected to ground-station link.');
  } catch (error) {
    showToast(error.message);
  }
});

unlinkButton.addEventListener('click', async () => {
  try {
    const payload = await requestJSON('/api/disconnect', { method: 'POST' });
    updateStatus(payload);
    showToast('Disconnected from ground-station link.');
  } catch (error) {
    showToast(error.message);
  }
});

uplinkForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const payload = await requestJSON('/api/uplink', {
      method: 'POST',
      body: JSON.stringify({ command: commandInput.value.trim() }),
    });
    updateStatus(payload);
    showToast(`Uplink sent: ${payload.sent}`);
  } catch (error) {
    showToast(error.message);
  }
});

pictureButton.addEventListener('click', async () => {
  pictureButton.disabled = true;
  pictureButton.textContent = 'Receiving...';
  try {
    const payload = await requestJSON('/api/take-picture', { method: 'POST' });
    updateStatus(payload);
    showToast('Image received.');
  } catch (error) {
    showToast(error.message);
  } finally {
    pictureButton.textContent = '📷 Take Picture';
    await pollStatus();
  }
});

refreshButtons.forEach(button => {
  button.addEventListener('click', async () => {
    try {
      const payload = await requestJSON('/api/refresh-rate', {
        method: 'POST',
        body: JSON.stringify({ rate: button.dataset.rate }),
      });
      updateStatus(payload);
      showToast(`Refresh command sent: ${button.dataset.rate}`);
    } catch (error) {
      showToast(error.message);
    }
  });
});

captureImage.addEventListener('load', applyImageProcessing);
processMode.addEventListener('change', applyImageProcessing);
thresholdInput.addEventListener('input', () => {
  thresholdValue.textContent = thresholdInput.value;
  applyImageProcessing();
});

downloadProcessedButton.addEventListener('click', () => {
  if (processMode.value === 'original') {
    const link = document.createElement('a');
    link.href = captureImage.src;
    link.download = 'capture_original.jpg';
    link.click();
    return;
  }
  const link = document.createElement('a');
  link.href = processedCanvas.toDataURL('image/png');
  link.download = `capture_${processMode.value}.png`;
  link.click();
});

window.addEventListener('resize', () => {
  drawAllCharts();
  applyImageProcessing();
});

commandInput.value = '0x13 0xAA 0xB0 0x01';
thresholdValue.textContent = thresholdInput.value;
setImageControlsEnabled(false);
drawAllCharts();
setInterval(pollStatus, 1000);

// ISS Real-Time Tracking
const GSLatitude = window.GROUNDSTATION.latitude || 48.5233;
const GSLongitude = window.GROUNDSTATION.longitude || 7.7369;
const GSAltitude = window.GROUNDSTATION.altitude_m || 143;

function calculateDistance(lat1, lon1, lat2, lon2, alt1, alt2) {
  // Haversine formula for distance calculation
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const horizDist = R * c;
  const vertDist = (alt2 - alt1) / 1000;
  return Math.sqrt(horizDist * horizDist + vertDist * vertDist);
}

async function updateISSTracking() {
  try {
    const response = await fetch('http://api.open-notify.org/iss-now.json');
    const data = await response.json();
    
    if (data.iss_position) {
      const issLat = parseFloat(data.iss_position.latitude);
      const issLon = parseFloat(data.iss_position.longitude);
      const issAlt = 408; // Average ISS altitude in km
      
      // Calculate distance from ground station
      const distance = calculateDistance(GSLatitude, GSLongitude, issLat, issLon, GSAltitude, issAlt * 1000);
      
      // Update DOM
      document.getElementById('iss-latitude').textContent = issLat.toFixed(4);
      document.getElementById('iss-longitude').textContent = issLon.toFixed(4);
      document.getElementById('iss-altitude').textContent = issAlt.toFixed(1);
      document.getElementById('iss-velocity').textContent = '7.66'; // ISS orbital velocity
      document.getElementById('iss-distance').textContent = distance.toFixed(1);
      document.getElementById('iss-visibility').textContent = distance < 2000 ? '✓ Trackable' : '✗ Too far';
      document.getElementById('iss-updated').textContent = new Date().toLocaleTimeString('en-US');
    }
  } catch (error) {
    console.log('ISS tracking update (non-critical):', error.message);
  }
}

// Update ISS tracking every 3 seconds
updateISSTracking();
setInterval(updateISSTracking, 3000);

pollStatus();