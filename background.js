let latestSpeed = '--';
let isTestingInProgress = false;
let speedHistory = [];
const MAX_HISTORY = 10;
const MIN_STABLE_SAMPLES = 3;
const MAX_SAMPLE_WINDOW = 8;
const STABILITY_THRESHOLD = 0.12; // 12% coefficient of variation triggers early stop

// Optimized test configurations with multiple CDN endpoints
const TEST_CONFIGS = {
  fast: {
    testFiles: [
      { url: 'https://httpbin.org/bytes/2097152', size: 2097152 }, // 2MB
      { url: 'https://speed.cloudflare.com/__down?bytes=2097152', size: 2097152 },
      { url: 'https://www.google.com/generate_204', size: 0, method: 'HEAD' } // Latency test
    ],
    samples: 2,
    timeout: 8000,
    parallel: true
  },
  medium: {
    testFiles: [
      { url: 'https://httpbin.org/bytes/1048576', size: 1048576 }, // 1MB
      { url: 'https://speed.cloudflare.com/__down?bytes=1048576', size: 1048576 },
    ],
    samples: 2,
    timeout: 12000,
    parallel: false
  },
  slow: {
    testFiles: [
      { url: 'https://httpbin.org/bytes/262144', size: 262144 }, // 256KB
      { url: 'https://speed.cloudflare.com/__down?bytes=262144', size: 262144 },
    ],
    samples: 2,
    timeout: 15000,
    parallel: false
  }
};

// Fallback test files (more reliable sources)
const FALLBACK_TESTS = [
  { url: 'https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png', size: 13504 },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Vd-Orig.png/256px-Vd-Orig.png', size: 15000 }
];

function addToHistory(speed) {
  speedHistory.push(speed);
  if (speedHistory.length > MAX_HISTORY) {
    speedHistory.shift();
  }
}

function getMedianSpeed(speeds) {
  if (speeds.length === 0) return 0;
  const sorted = [...speeds].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function removeOutliers(speeds) {
  if (speeds.length < 3) return speeds;

  const median = getMedianSpeed(speeds);
  const threshold = median * 0.5; // Remove speeds that differ by more than 50% from median

  return speeds.filter(speed =>
    Math.abs(speed - median) <= threshold
  );
}

function calculateVariance(values) {
  if (values.length === 0) return { variance: 0, mean: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) / values.length;
  return { variance, mean };
}

function hasStableResults(samples) {
  if (samples.length < MIN_STABLE_SAMPLES) return false;
  const recentSamples = samples.slice(-MAX_SAMPLE_WINDOW);
  const { variance, mean } = calculateVariance(recentSamples);
  if (mean === 0) return false;
  const coefficientOfVariation = Math.sqrt(variance) / mean;
  return coefficientOfVariation < STABILITY_THRESHOLD;
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
  return speedMbps.toFixed(3); // Keep as Mbps but show more precision for small values
}

async function testSingleFile(testFile, timeout = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const startTime = performance.now();
    const method = testFile.method || 'GET';
    const cacheBuster = Date.now() + Math.random().toString(36).substr(2, 9);
    
    const response = await fetch(testFile.url + (testFile.url.includes('?') ? '&' : '?') + 'cb=' + cacheBuster, {
      method,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'User-Agent': 'SpeedTest/2.0'
      }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    let actualSize = testFile.size;
    if (method === 'GET' && testFile.size > 0) {
      const reader = response.body.getReader();
      let receivedLength = 0;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedLength += value.length;
      }
      actualSize = receivedLength;
    }
    
    const endTime = performance.now();
    clearTimeout(timeoutId);

    const duration = (endTime - startTime) / 1000;
    if (duration < 0.1) throw new Error('Test too fast, likely cached');
    
    const speedMbps = (actualSize * 8) / (duration * 1000 * 1000);
    return speedMbps;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
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
    const lastSpeed = speedHistory.length > 0 ? speedHistory[speedHistory.length - 1] : 1;
    const connectionType = determineConnectionType(lastSpeed);
    const config = TEST_CONFIGS[connectionType];

    const allSpeeds = [];
    
    // Parallel testing for fast connections
    if (config.parallel && connectionType === 'fast') {
      const promises = config.testFiles.slice(0, 2).map(testFile => 
        testSingleFile(testFile, config.timeout).catch(() => null)
      );
      
      const results = await Promise.allSettled(promises);
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value > 0 && result.value < 2000) {
          allSpeeds.push(result.value);
        }
      });
    } else {
      // Sequential testing with early termination
      for (const testFile of config.testFiles) {
        try {
          const speed = await testSingleFile(testFile, config.timeout);
          if (speed > 0 && speed < 2000) {
            allSpeeds.push(speed);
            if (allSpeeds.length >= 2 && hasStableResults(allSpeeds)) break;
          }
        } catch (error) {
          continue;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    // Fallback tests if needed
    if (allSpeeds.length === 0) {
      for (const fallbackTest of FALLBACK_TESTS) {
        try {
          const speed = await testSingleFile(fallbackTest, 8000);
          if (speed > 0 && speed < 2000) {
            allSpeeds.push(speed);
            break;
          }
        } catch (error) {
          continue;
        }
      }
    }

    if (allSpeeds.length === 0) {
      throw new Error('All speed tests failed');
    }

    // Remove outliers and calculate final speed
    const cleanedSpeeds = removeOutliers(allSpeeds);
    const finalSpeed = cleanedSpeeds.length > 0 ?
      getMedianSpeed(cleanedSpeeds) :
      getMedianSpeed(allSpeeds);

    // Smooth the result with history if available
    let smoothedSpeed = finalSpeed;
    if (speedHistory.length > 0) {
      const recentAverage = speedHistory.slice(-3).reduce((a, b) => a + b, 0) /
        Math.min(speedHistory.length, 3);
      // Weighted average: 70% new result, 30% recent history
      smoothedSpeed = (finalSpeed * 0.7) + (recentAverage * 0.3);
    }

    addToHistory(smoothedSpeed);
    latestSpeed = formatSpeed(smoothedSpeed);

    // Update badge with appropriate text
    const badgeText = smoothedSpeed >= 1 ?
      latestSpeed + 'M' :
      Math.round(smoothedSpeed * 1000) + 'K';

    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: '#0058cc' });

    console.log(`Speed test completed: ${latestSpeed} (${allSpeeds.length} samples)`);

  } catch (error) {
    console.error('Speed test failed:', error);
    latestSpeed = 'Err';
    chrome.action.setBadgeText({ text: 'Err' });
    chrome.action.setBadgeBackgroundColor({ color: '#ff4444' });
  } finally {
    isTestingInProgress = false;
  }
}

// Optimized adaptive interval
function getTestInterval() {
  if (speedHistory.length < 2) return 3000;

  const recentSpeeds = speedHistory.slice(-4);
  const { variance, mean } = calculateVariance(recentSpeeds);
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;

  // Faster connections can be tested less frequently when stable
  const baseInterval = mean > 50 ? 15000 : mean > 10 ? 10000 : 6000;
  
  if (cv < 0.1) return baseInterval * 1.5; // Very stable
  if (cv < 0.2) return baseInterval; // Stable
  return Math.max(baseInterval * 0.6, 3000); // Unstable, test more often
}

// Optimized scheduling with connection awareness
function scheduleNextTest() {
  const interval = getTestInterval();
  setTimeout(async () => {
    if (navigator.onLine && !isTestingInProgress) {
      await performSpeedTest();
    }
    scheduleNextTest();
  }, interval);
}

// Start initial test and scheduling
performSpeedTest().then(() => scheduleNextTest());

// Listen for requests from popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getSpeed') {
    sendResponse({
      speed: latestSpeed,
      history: speedHistory.slice(-5), // Send recent history
      isTestingInProgress
    });
  } else if (message.type === 'forceTest') {
    performSpeedTest().then(() => {
      sendResponse({ speed: latestSpeed });
    });
    return true; // Indicates async response
  }
});

// Handle extension lifecycle
chrome.runtime.onStartup.addListener(() => {
  console.log('Extension started, beginning speed monitoring...');
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed/updated, beginning speed monitoring...');
});
