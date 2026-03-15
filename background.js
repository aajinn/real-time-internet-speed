let latestSpeed = '--';
let latestUpload = '--';
let latestPing = '--';
let latestJitter = '--';
let isTestingInProgress = false;

class RequestQueue {
  constructor(maxConcurrent = 2) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
  }

  async add(requestFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ requestFn, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) return;
    this.running++;
    const { requestFn, resolve, reject } = this.queue.shift();
    try {
      resolve(await requestFn());
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.process();
    }
  }
}

const requestQueue = new RequestQueue(2);

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

let speedHistory = new CircularBuffer(10);
const MIN_STABLE_SAMPLES = 3;
const MAX_SAMPLE_WINDOW = 8;
const STABILITY_THRESHOLD = 0.12;

const TEST_CONFIGS = {
  fast: {
    testFiles: [
      { url: 'https://speed.cloudflare.com/__down?bytes=2097152', size: 2097152 },
      { url: 'https://speed.cloudflare.com/__down?bytes=1048576', size: 1048576 },
    ],
    timeout: 8000,
    parallel: true
  },
  medium: {
    testFiles: [
      { url: 'https://speed.cloudflare.com/__down?bytes=1048576', size: 1048576 },
      { url: 'https://speed.cloudflare.com/__down?bytes=524288', size: 524288 },
    ],
    timeout: 12000,
    parallel: false
  },
  slow: {
    testFiles: [
      { url: 'https://speed.cloudflare.com/__down?bytes=262144', size: 262144 },
      { url: 'https://speed.cloudflare.com/__down?bytes=131072', size: 131072 },
    ],
    timeout: 15000,
    parallel: false
  }
};

const FALLBACK_TESTS = [
  { url: 'https://speed.cloudflare.com/__down?bytes=131072', size: 131072 },
  { url: 'https://httpbin.org/bytes/131072', size: 131072 },
  { url: 'https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js', size: 89476 }
];

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

async function measurePing() {
  const samples = [];
  const endpoints = [
    'https://speed.cloudflare.com/__down?bytes=0',
    'https://www.google.com/generate_204'
  ];

  for (let i = 0; i < 4; i++) {
    const endpoint = endpoints[i % endpoints.length];
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
      const start = performance.now();
      const res = await fetch(endpoint + (endpoint.includes('?') ? '&' : '?') + 't=' + Date.now(), {
        cache: 'no-store',
        signal: controller.signal
      });
      await res.arrayBuffer();
      clearTimeout(timeoutId);
      const ping = Math.round(performance.now() - start);
      if (ping > 0 && ping < 5000) samples.push(ping);
    } catch (e) {
      clearTimeout(timeoutId);
      console.warn('Ping sample failed:', e && e.message);
    }
  }

  if (samples.length === 0) return { ping: null, jitter: null };

  const avgPing = Math.round(samples.reduce((a, b) => a + b) / samples.length);
  const jitter = samples.length >= 2
    ? Math.round(samples.slice(1).reduce((sum, v, i) => sum + Math.abs(v - samples[i]), 0) / (samples.length - 1))
    : 0;

  return { ping: avgPing, jitter };
}

function makeRandomPayload(size) {
  const buf = new Uint8Array(size);
  crypto.getRandomValues(buf.subarray(0, Math.min(size, 65536)));
  return buf;
}

async function measureUpload() {
  const sizes = [256 * 1024, 512 * 1024];
  const results = [];

  for (const size of sizes) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const payload = makeRandomPayload(size);
      const start = performance.now();
      const response = await fetch('https://speed.cloudflare.com/__up', {
        method: 'POST',
        body: payload,
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/octet-stream' }
      });
      const duration = (performance.now() - start) / 1000;
      clearTimeout(timeoutId);
      if (response.ok && duration > 0.05) results.push((size * 8) / (duration * 1e6));
    } catch (e) {
      clearTimeout(timeoutId);
      console.warn('Upload sample failed:', e && e.message);
    }
  }

  return results.length > 0 ? getMedianSpeed(results) : null;
}

async function testSingleFile(testFile, timeout = 15000) {
  return requestQueue.add(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const startTime = performance.now();
      const isCloudflare = testFile.url.includes('speed.cloudflare.com/__down?bytes=');
      let url;
      if (isCloudflare) {
        const size = parseInt(testFile.url.split('bytes=')[1]) || testFile.size;
        const jitter = size + Math.floor(Math.random() * 1024);
        url = `https://speed.cloudflare.com/__down?bytes=${jitter}`;
      } else {
        const sep = testFile.url.includes('?') ? '&' : '?';
        url = testFile.url + sep + 'cb=' + Date.now();
      }
      const response = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      });

      if (!response.ok) throw new Error('HTTP ' + response.status);

      const reader = response.body.getReader();
      let receivedLength = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedLength += value.length;
      }

      const duration = (performance.now() - startTime) / 1000;
      clearTimeout(timeoutId);
      if (duration < 0.05 && receivedLength < 65536) throw new Error('Test too fast, likely cached');

      return (receivedLength * 8) / (duration * 1e6);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  });
}

async function performSpeedTest() {
  if (isTestingInProgress) return;

  if (!navigator.onLine) {
    latestSpeed = 'Off';
    chrome.action.setBadgeText({ text: 'Off' });
    chrome.action.setBadgeBackgroundColor({ color: '#666666' });
    return;
  }

  isTestingInProgress = true;

  try {
    const historyArray = speedHistory.toArray();
    const lastSpeed = historyArray.length > 0 ? historyArray[historyArray.length - 1] : 1;
    const config = TEST_CONFIGS[determineConnectionType(lastSpeed)];
    const allSpeeds = [];

    if (config.parallel) {
      const results = await Promise.allSettled(
        config.testFiles.slice(0, 2).map(f => testSingleFile(f, config.timeout).catch(() => null))
      );
      results.forEach(r => {
        if (r.status === 'fulfilled' && r.value > 0 && r.value < 2000) allSpeeds.push(r.value);
      });
    } else {
      for (const testFile of config.testFiles) {
        try {
          const speed = await testSingleFile(testFile, config.timeout);
          if (speed > 0 && speed < 2000) {
            allSpeeds.push(speed);
            if (allSpeeds.length >= 2 && hasStableResults(allSpeeds)) break;
          }
        } catch (e) { console.warn('Download test failed:', testFile.url, e && e.message); continue; }
      }
    }

    if (allSpeeds.length === 0) {
      for (const fallback of FALLBACK_TESTS) {
        try {
          const speed = await testSingleFile(fallback, 8000);
          if (speed > 0 && speed < 2000) { allSpeeds.push(speed); break; }
        } catch (e) { console.warn('Fallback test failed:', fallback.url, e && e.message); continue; }
      }
    }

    if (allSpeeds.length === 0) throw new Error('All speed tests failed');

    const cleaned = removeOutliers(allSpeeds);
    const finalSpeed = getMedianSpeed(cleaned.length > 0 ? cleaned : allSpeeds);

    let smoothedSpeed = finalSpeed;
    if (historyArray.length > 0) {
      const recent = historyArray.slice(-3);
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      smoothedSpeed = finalSpeed * 0.7 + recentAvg * 0.3;
    }

    speedHistory.push(smoothedSpeed);
    latestSpeed = formatSpeed(smoothedSpeed);

    const uploadSpeed = await measureUpload();
    latestUpload = uploadSpeed !== null ? formatSpeed(uploadSpeed) : '--';

    const { ping, jitter } = await measurePing();
    latestPing = ping !== null ? ping.toString() : '--';
    latestJitter = jitter !== null ? jitter.toString() : '--';

    const badgeText = smoothedSpeed >= 1 ? latestSpeed + 'M' : Math.round(smoothedSpeed * 1000) + 'K';
    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: '#0058cc' });
    isTestingInProgress = false;

  } catch (error) {
    console.error('Speed test failed:', error);
    latestSpeed = 'Err';
    latestUpload = '--';
    latestPing = 'Err';
    latestJitter = 'Err';
    chrome.action.setBadgeText({ text: 'Err' });
    chrome.action.setBadgeBackgroundColor({ color: '#ff4444' });
    isTestingInProgress = false;
  }
}

function getTestInterval() {
  const historyArray = speedHistory.toArray();
  if (historyArray.length < 2) return 3000;
  const { variance, mean } = calculateVariance(historyArray.slice(-4));
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
  const base = mean > 50 ? 15000 : mean > 10 ? 10000 : 6000;
  if (cv < 0.1) return base * 1.5;
  if (cv < 0.2) return base;
  return Math.max(base * 0.6, 3000);
}

function scheduleNextTest() {
  setTimeout(async () => {
    if (navigator.onLine && !isTestingInProgress) {
      await performSpeedTest().catch(e => console.error('Scheduled test failed:', e));
    }
    scheduleNextTest();
  }, getTestInterval());
}

performSpeedTest().then(() => scheduleNextTest()).catch(e => {
  console.error('Initial speed test failed:', e);
  scheduleNextTest();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getSpeed') {
    sendResponse({
      speed: latestSpeed,
      upload: latestUpload,
      ping: latestPing,
      jitter: latestJitter,
      history: speedHistory.slice(-10),
      isTestingInProgress
    });
  } else if (message.type === 'forceTest') {
    performSpeedTest().then(() => {
      sendResponse({ speed: latestSpeed, upload: latestUpload, ping: latestPing, jitter: latestJitter });
    }).catch(e => {
      console.error('Force test failed:', e);
      sendResponse({ speed: 'Err', upload: '--', ping: 'Err', jitter: 'Err' });
    });
    return true;
  }
});

chrome.runtime.onStartup.addListener(() => console.log('Extension started.'));
chrome.runtime.onInstalled.addListener(() => console.log('Extension installed/updated.'));
