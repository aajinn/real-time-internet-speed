let latestSpeed = '--';
let isTestingInProgress = false;
let speedHistory = [];
const MAX_HISTORY = 10;

// Test configurations for different connection types
const TEST_CONFIGS = {
  fast: {
    testFiles: [
      { url: 'https://httpbin.org/bytes/1048576', size: 1048576 }, // 1MB
      { url: 'https://httpbin.org/bytes/2097152', size: 2097152 }, // 2MB
    ],
    samples: 2,
    timeout: 10000
  },
  medium: {
    testFiles: [
      { url: 'https://httpbin.org/bytes/524288', size: 524288 }, // 512KB
      { url: 'https://httpbin.org/bytes/1048576', size: 1048576 }, // 1MB
    ],
    samples: 3,
    timeout: 15000
  },
  slow: {
    testFiles: [
      { url: 'https://httpbin.org/bytes/102400', size: 102400 }, // 100KB
      { url: 'https://httpbin.org/bytes/262144', size: 262144 }, // 256KB
    ],
    samples: 3,
    timeout: 20000
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
    const response = await fetch(testFile.url + '?cache=' + Date.now(), {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    // Read the response to ensure complete download
    await response.arrayBuffer();
    const endTime = performance.now();
    
    clearTimeout(timeoutId);
    
    const duration = (endTime - startTime) / 1000; // Convert to seconds
    const speedMbps = (testFile.size * 8) / (duration * 1000 * 1000); // Convert to Mbps (bits per second / 1,000,000)
    
    return speedMbps;
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn(`Test failed for ${testFile.url}:`, error.message);
    throw error;
  }
}

async function performSpeedTest() {
  if (isTestingInProgress) {
    console.log('Speed test already in progress, skipping...');
    return;
  }
  
  isTestingInProgress = true;
  
  try {
    // Determine which test configuration to use
    const lastSpeed = speedHistory.length > 0 ? 
      speedHistory[speedHistory.length - 1] : 1;
    const connectionType = determineConnectionType(lastSpeed);
    const config = TEST_CONFIGS[connectionType];
    
    const allSpeeds = [];
    let successfulTests = 0;
    
    // Test with primary test files
    for (const testFile of config.testFiles) {
      for (let sample = 0; sample < config.samples; sample++) {
        try {
          const speed = await testSingleFile(testFile, config.timeout);
          if (speed > 0 && speed < 1000) { // Sanity check (max 1Gbps)
            allSpeeds.push(speed);
            successfulTests++;
          }
        } catch (error) {
          console.warn(`Sample ${sample + 1} failed for ${testFile.url}`);
        }
        
        // Add small delay between tests to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // If primary tests failed, try fallback tests
    if (successfulTests === 0) {
      console.log('Primary tests failed, trying fallback tests...');
      for (const fallbackTest of FALLBACK_TESTS) {
        try {
          const speed = await testSingleFile(fallbackTest, 10000);
          if (speed > 0 && speed < 1000) {
            allSpeeds.push(speed);
            successfulTests++;
            break; // One successful fallback test is enough
          }
        } catch (error) {
          console.warn(`Fallback test failed for ${fallbackTest.url}`);
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

// Adaptive testing interval based on connection stability
function getTestInterval() {
  if (speedHistory.length < 3) return 5000; // Initial frequent testing
  
  const recentSpeeds = speedHistory.slice(-5);
  const variance = recentSpeeds.reduce((acc, speed) => {
    const mean = recentSpeeds.reduce((a, b) => a + b, 0) / recentSpeeds.length;
    return acc + Math.pow(speed - mean, 2);
  }, 0) / recentSpeeds.length;
  
  // More stable connection = less frequent testing
  if (variance < 1) return 10000; // Very stable
  if (variance < 5) return 7000;  // Somewhat stable
  return 4000; // Unstable connection, test more frequently
}

// Dynamic interval scheduling
function scheduleNextTest() {
  const interval = getTestInterval();
  setTimeout(() => {
    performSpeedTest().then(() => scheduleNextTest());
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
