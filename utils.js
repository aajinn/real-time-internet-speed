class CircularBuffer {
  constructor(size) {
    this.size = size;
    this.buffer = new Array(size);
    this.index = 0;
    this.length = 0;
  }

  push(item) {
    this.buffer[this.index] = item;
    this.index = (this.index + 1) % this.size;
    if (this.length < this.size) this.length++;
  }

  toArray() {
    if (this.length === 0) return [];
    const result = new Array(this.length);
    for (let i = 0; i < this.length; i++) {
      result[i] = this.buffer[(this.index - this.length + i + this.size) % this.size];
    }
    return result;
  }

  slice(start) {
    return this.toArray().slice(start);
  }
}

const MIN_STABLE_SAMPLES = 3;
const MAX_SAMPLE_WINDOW = 8;
const STABILITY_THRESHOLD = 0.12;

function getMedianSpeed(speeds) {
  if (speeds.length === 0) return 0;
  const sorted = [...speeds].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function removeOutliers(speeds) {
  if (speeds.length < 3) return speeds;
  const median = getMedianSpeed(speeds);
  return speeds.filter(s => Math.abs(s - median) <= median * 0.5);
}

function calculateVariance(values) {
  if (values.length === 0) return { variance: 0, mean: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
  return { variance, mean };
}

function hasStableResults(samples) {
  if (samples.length < MIN_STABLE_SAMPLES) return false;
  const { variance, mean } = calculateVariance(samples.slice(-MAX_SAMPLE_WINDOW));
  if (mean === 0) return false;
  return Math.sqrt(variance) / mean < STABILITY_THRESHOLD;
}

function determineConnectionType(lastKnownSpeed) {
  if (lastKnownSpeed > 10) return 'fast';
  if (lastKnownSpeed > 1) return 'medium';
  return 'slow';
}

function formatSpeed(speedMbps) {
  if (speedMbps >= 100) return speedMbps.toFixed(0);
  if (speedMbps >= 10) return speedMbps.toFixed(1);
  if (speedMbps >= 1) return speedMbps.toFixed(2);
  return speedMbps.toFixed(3);
}

function formatSpeedForDisplay(speedString) {
  if (speedString === '--' || speedString === 'Err') {
    return { display: speedString, unit: 'Mbps', isError: speedString === 'Err' };
  }

  if (speedString === 'Off') {
    return { display: 'Offline', unit: '', isError: true, isOffline: true };
  }

  const speed = parseFloat(speedString) || 0;

  if (speed >= 1) {
    return {
      display: speed >= 10 ? speed.toFixed(1) : speed.toFixed(2),
      unit: 'Mbps',
      isError: false
    };
  } else {
    const kbps = Math.round(speed * 1000);
    return {
      display: kbps.toString(),
      unit: 'Kbps',
      isError: false
    };
  }
}

function getTestIntervalFromHistory(historyArray) {
  if (historyArray.length < 2) return 3000;
  const { variance, mean } = calculateVariance(historyArray.slice(-4));
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
  const base = mean > 50 ? 15000 : mean > 10 ? 10000 : 6000;
  if (cv < 0.1) return base * 1.5;
  if (cv < 0.2) return base;
  return Math.max(base * 0.6, 3000);
}

function calculateJitter(samples) {
  if (samples.length < 2) return 0;
  return Math.round(
    samples.slice(1).reduce((sum, v, i) => sum + Math.abs(v - samples[i]), 0) /
    (samples.length - 1)
  );
}

function calculateSpeedMbps(bytes, durationSeconds) {
  return (bytes * 8) / (durationSeconds * 1e6);
}

function formatBadgeText(finalSpeed, latestSpeedStr) {
  return finalSpeed >= 1 ? latestSpeedStr + 'M' : Math.round(finalSpeed * 1000) + 'K';
}

function isValidSpeed(speed) {
  return speed > 0 && speed < 10000;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CircularBuffer,
    MIN_STABLE_SAMPLES,
    MAX_SAMPLE_WINDOW,
    STABILITY_THRESHOLD,
    getMedianSpeed,
    removeOutliers,
    calculateVariance,
    hasStableResults,
    determineConnectionType,
    formatSpeed,
    formatSpeedForDisplay,
    getTestIntervalFromHistory,
    calculateJitter,
    calculateSpeedMbps,
    formatBadgeText,
    isValidSpeed
  };
}
