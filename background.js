importScripts('./utils.js');

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

let speedHistory = new CircularBuffer(10);

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
  { url: 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png', size: 13504 }
];

async function measurePing() {
  const samples = [];
  // Use a tiny 1-byte payload so we measure connection latency, not transfer time.
  // google.com/generate_204 returns an empty 204 — ideal for pure RTT measurement.
  const endpoints = [
    'https://www.google.com/generate_204',
    'https://speed.cloudflare.com/__down?bytes=1',
  ];

  for (let i = 0; i < 5; i++) {
    const endpoint = endpoints[i % endpoints.length];
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
      const sep = endpoint.includes('?') ? '&' : '?';
      const url = endpoint + sep + 't=' + Date.now();
      const start = performance.now();
      const res = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal
      });
      // Read only the status/headers — don't wait for body to avoid inflating RTT
      // with transfer time. For generate_204 there is no body; for the 1-byte
      // Cloudflare endpoint the body is negligible but we still drain it quickly.
      await res.arrayBuffer();
      clearTimeout(timeoutId);
      const rtt = Math.round(performance.now() - start);
      if (rtt > 0 && rtt < 5000) samples.push(rtt);
    } catch (e) {
      clearTimeout(timeoutId);
      console.warn('Ping sample failed:', e && e.message);
    }
  }

  if (samples.length === 0) return { ping: null, jitter: null };

  // Drop the first sample (TCP connection setup) and use the rest for a
  // more stable average that reflects steady-state latency.
  const steadySamples = samples.length > 1 ? samples.slice(1) : samples;
  const sorted = [...steadySamples].sort((a, b) => a - b);
  // Use median to resist outliers
  const mid = Math.floor(sorted.length / 2);
  const medianPing = sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];

  const jitter = calculateJitter(steadySamples);

  return { ping: medianPing, jitter };
}

function makeRandomPayload(size) {
  // Fill the entire buffer with random data to prevent any compression
  // by proxies or the OS network stack that would inflate measured speed.
  const buf = new Uint8Array(size);
  // crypto.getRandomValues has a 65536-byte limit per call, so chunk it
  for (let offset = 0; offset < size; offset += 65536) {
    crypto.getRandomValues(buf.subarray(offset, Math.min(offset + 65536, size)));
  }
  return buf;
}

async function measureUpload() {
  // Warm up the connection with a tiny request first so the actual timed
  // upload doesn't include TCP/TLS handshake overhead.
  try {
    const warmup = new AbortController();
    const wt = setTimeout(() => warmup.abort(), 3000);
    const warmupRes = await fetch('https://speed.cloudflare.com/__up', {
      method: 'POST',
      body: new Uint8Array(1024),
      cache: 'no-store',
      signal: warmup.signal,
      headers: { 'Content-Type': 'application/octet-stream' }
    });
    clearTimeout(wt);
    warmupRes.body && await warmupRes.body.cancel();
  } catch (_) { /* ignore warmup failures */ }

  // Use 3 samples so we can take the median and discard outliers
  const sizes = [256 * 1024, 512 * 1024, 256 * 1024];
  const results = [];

  for (const size of sizes) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const payload = makeRandomPayload(size);

      // Wrap the payload in a ReadableStream so we can record exactly when
      // the last byte is handed to the browser's network layer — this is
      // the closest we can get to "data left the device" without a
      // server-side timestamp. The timer stops when the stream closes,
      // before we wait for the server's response.
      let transferEnd = 0;
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(payload);
          controller.close();
          // close() is synchronous; record time immediately after
          // (the browser will flush the buffer to the socket)
          transferEnd = performance.now();
        }
      });

      const transferStart = performance.now();
      let response;
      let usedFallback = false;
      let fallbackDuration = 0;
      try {
        response = await fetch('https://speed.cloudflare.com/__up', {
          method: 'POST',
          body: stream,
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': size.toString()
          },
          duplex: 'half'
        });
      } catch (_streamErr) {
        // duplex:'half' not supported — fall back to buffered upload
        const fallbackPayload = makeRandomPayload(size);
        const fallbackStart = performance.now();
        response = await fetch('https://speed.cloudflare.com/__up', {
          method: 'POST',
          body: fallbackPayload,
          cache: 'no-store',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/octet-stream' }
        });
        fallbackDuration = (performance.now() - fallbackStart) / 1000;
        usedFallback = true;
      }

      // Drain the response so the connection returns to the pool cleanly
      await response.body.cancel();
      clearTimeout(timeoutId);

      const duration = usedFallback
        ? fallbackDuration
        : (transferEnd > transferStart ? transferEnd - transferStart : performance.now() - transferStart) / 1000;

      if (response.ok && duration > 0.1) {
        results.push(calculateSpeedMbps(size, duration));
      }
    } catch (e) {
      clearTimeout(timeoutId);
      console.warn('Upload sample failed:', e && e.message);
    }
  }

  if (results.length === 0) return null;
  const cleaned = removeOutliers(results);
  return getMedianSpeed(cleaned.length > 0 ? cleaned : results);
}

async function testSingleFile(testFile, timeout = 15000) {
  return requestQueue.add(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      let url;
      const isCloudflare = testFile.url.includes('speed.cloudflare.com/__down?bytes=');
      if (isCloudflare) {
        // Add a small random jitter to the byte count to defeat any edge caching
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

      // Start timing AFTER headers arrive (i.e. after TCP+TLS+TTFB) so we
      // measure pure transfer throughput, not connection setup overhead.
      const transferStart = performance.now();
      const reader = response.body.getReader();
      let receivedLength = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedLength += value.length;
      }

      const duration = (performance.now() - transferStart) / 1000;
      clearTimeout(timeoutId);

      // Reject samples that are too short to be reliable
      if (duration < 0.1 || receivedLength < 8192) {
        throw new Error('Transfer too short for accurate measurement');
      }

      return calculateSpeedMbps(receivedLength, duration);
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
        if (r.status === 'fulfilled' && isValidSpeed(r.value)) allSpeeds.push(r.value);
      });
    } else {
      for (const testFile of config.testFiles) {
        try {
          const speed = await testSingleFile(testFile, config.timeout);
          if (isValidSpeed(speed)) {
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
          if (isValidSpeed(speed)) { allSpeeds.push(speed); break; }
        } catch (e) { console.warn('Fallback test failed:', fallback.url, e && e.message); continue; }
      }
    }

    if (allSpeeds.length === 0) throw new Error('All speed tests failed');

    const cleaned = removeOutliers(allSpeeds);
    const finalSpeed = getMedianSpeed(cleaned.length > 0 ? cleaned : allSpeeds);

    // Store the actual measured speed without smoothing — users want to see
    // real-time changes, not a moving average that lags behind reality.
    speedHistory.push(finalSpeed);
    latestSpeed = formatSpeed(finalSpeed);

    const uploadSpeed = await measureUpload();
    latestUpload = uploadSpeed !== null ? formatSpeed(uploadSpeed) : '--';

    const { ping, jitter } = await measurePing();
    latestPing = ping !== null ? ping.toString() : '--';
    latestJitter = jitter !== null ? jitter.toString() : '--';

    const badgeText = formatBadgeText(finalSpeed, latestSpeed);
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

function scheduleNextTest() {
  setTimeout(async () => {
    if (navigator.onLine && !isTestingInProgress) {
      await performSpeedTest().catch(e => console.error('Scheduled test failed:', e));
    }
    scheduleNextTest();
  }, getTestIntervalFromHistory(speedHistory.toArray()));
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
