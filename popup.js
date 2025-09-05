let currentSpeed = '--';
let speedHistory = [];
let isTestingInProgress = false;

function formatSpeedForDisplay(speedString, rawSpeed) {
  if (speedString === '--' || speedString === 'Err') {
    return { display: speedString, unit: 'Mbps', isError: speedString === 'Err' };
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

function updateSpeedDisplay(speedData) {
  const speedElement = document.getElementById('speed');
  const unitElement = document.getElementById('unit');
  const statusElement = document.getElementById('status');

  if (!speedData || !speedData.speed) {
    console.error('Failed to retrieve speed data.');
    speedElement.innerText = '--';
    unitElement.innerText = 'Mbps';
    if (statusElement) statusElement.innerText = 'Connection Error';
    return;
  }

  currentSpeed = speedData.speed;
  speedHistory = speedData.history || [];
  isTestingInProgress = speedData.isTestingInProgress || false;

  const formatted = formatSpeedForDisplay(speedData.speed);

  // Update main display
  speedElement.classList.remove('loading-text', 'error-text');
  unitElement.classList.remove('error-unit');

  if (formatted.isError) {
    speedElement.classList.add('error-text');
    unitElement.classList.add('error-unit');
    speedElement.innerText = 'Error';
    unitElement.innerText = 'Connection Failed';
  } else if (isTestingInProgress) {
    speedElement.classList.add('loading-text');
    speedElement.innerText = formatted.display;
    unitElement.innerText = formatted.unit;
    // Clear inline styles that interfere with animation
    speedElement.style.transform = '';
    speedElement.style.opacity = '';
  } else {
    speedElement.innerText = formatted.display;
    unitElement.innerText = formatted.unit;
  }

  // Update status
  if (statusElement) {
    if (isTestingInProgress) {
      statusElement.innerText = 'Measuring Speed...';
      statusElement.className = 'status-testing';
    } else if (formatted.isError) {
      statusElement.innerText = 'Connection Error';
      statusElement.className = 'status-error';
    } else {
      const lastUpdate = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      statusElement.innerText = `Updated: ${lastUpdate}`;
      statusElement.className = 'status-normal';
    }
  }

  // Update speed history visualization
  updateSpeedGraph();

  // Trigger animation only when not testing
  if (!isTestingInProgress) {
    [speedElement, unitElement].forEach((el) => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
  }
}

function updateSpeedGraph() {
  const graphElement = document.getElementById('speedGraph');
  if (!graphElement || speedHistory.length === 0) return;

  const maxSpeed = Math.max(...speedHistory);
  const minSpeed = Math.min(...speedHistory);
  const range = maxSpeed - minSpeed || 1;

  // Create simple ASCII-like graph
  const bars = speedHistory.slice(-8).map(speed => {
    const percentage = ((speed - minSpeed) / range) * 100;
    return `<div class="graph-bar" style="height: ${Math.max(10, percentage)}%"></div>`;
  }).join('');

  graphElement.innerHTML = bars;
}

function updateSpeed() {
  chrome.runtime.sendMessage({ type: 'getSpeed' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Runtime error:', chrome.runtime.lastError);
      return;
    }
    updateSpeedDisplay(response);
  });
}

function forceSpeedTest() {
  const testButton = document.getElementById('testButton');
  if (testButton) {
    testButton.disabled = true;
    testButton.innerText = 'Testing...';
  }

  chrome.runtime.sendMessage({ type: 'forceTest' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Runtime error:', chrome.runtime.lastError);
    }

    if (testButton) {
      testButton.disabled = false;
      testButton.innerText = 'Test Now';
    }

    // Update display after forced test
    setTimeout(updateSpeed, 1000);
  });
}

// Update speed periodically
setInterval(updateSpeed, 1000);
updateSpeed(); // Initial request

// Add jump-in effect on main area click
document.body.addEventListener('click', (e) => {
  // Don't trigger animation if clicking on buttons
  if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') {
    return;
  }

  const speedElement = document.getElementById('speed');
  const unitElement = document.getElementById('unit');

  [speedElement, unitElement].forEach((el) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-20px)';
  });

  setTimeout(updateSpeed, 300); // Wait for animation to finish
});

// Initialize advanced features when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Add test button functionality
  const testButton = document.getElementById('testButton');
  if (testButton) {
    testButton.addEventListener('click', forceSpeedTest);
  }

  // Add speed graph
  const graphContainer = document.getElementById('speedGraphContainer');
  if (graphContainer) {
    graphContainer.innerHTML = '<div id="speedGraph" class="speed-graph"></div>';
  }

  // Handle rating system
  handleRatingSystem();

  // Add keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') {
      forceSpeedTest();
    }
  });
});

function handleRatingSystem() {
  const divKey = 'ratingDivLastShown';
  const stopRateUsKey = 'stopRatingDiv';
  const currentDate = new Date().toDateString();

  const mainContainer = document.getElementById('main');
  const ratingDiv = document.getElementById('ratingDiv');

  // Check if the "Rate Us" prompt is permanently disabled
  if (localStorage.getItem(stopRateUsKey) === 'true') {
    if (ratingDiv) ratingDiv.style.display = 'none';
    return;
  }

  if (localStorage.getItem(divKey) !== currentDate) {
    if (mainContainer) mainContainer.style.display = 'none';
    if (ratingDiv) {
      ratingDiv.style.display = 'block';
      localStorage.setItem(divKey, currentDate);
    }
  } else {
    if (ratingDiv) ratingDiv.style.display = 'none';
  }
}

// Hide "Rate Us" and show main app
const dismissBtn = document.getElementById('dismiss-btn');
if (dismissBtn) {
  dismissBtn.addEventListener('click', () => {
    const ratingDiv = document.getElementById('ratingDiv');
    const mainContainer = document.getElementById('main');
    if (ratingDiv) ratingDiv.style.display = 'none';
    if (mainContainer) mainContainer.style.display = 'flex';
  });
}

// Permanently disable "Rate Us"
const disableRatingBtn = document.getElementById('disable-rating-btn');
if (disableRatingBtn) {
  disableRatingBtn.addEventListener('click', () => {
    localStorage.setItem('stopRatingDiv', 'true');
    const ratingDiv = document.getElementById('ratingDiv');
    const mainContainer = document.getElementById('main');
    if (ratingDiv) ratingDiv.style.display = 'none';
    if (mainContainer) mainContainer.style.display = 'flex';
  });
}
