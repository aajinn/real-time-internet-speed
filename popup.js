let currentSpeed = '--';
let currentUpload = '--';
let currentPing = '--';
let currentJitter = '--';
let speedHistory = [];
let isTestingInProgress = false;

function updateSpeedDisplay(speedData) {
  const speedElement = document.getElementById('speed');
  const unitElement = document.getElementById('unit');
  const uploadSpeedElement = document.getElementById('upload-speed');
  const uploadUnitElement = document.getElementById('upload-unit');
  const uploadContainer = document.getElementById('upload-container');
  const pingElement = document.getElementById('ping');
  const pingUnitElement = document.getElementById('ping-unit');
  const jitterElement = document.getElementById('jitter');
  const statusElement = document.getElementById('status');

  if (!speedData || !speedData.speed) {
    console.error('Failed to retrieve speed data.');
    speedElement.innerText = '--';
    unitElement.innerText = 'Mbps';
    if (uploadSpeedElement) uploadSpeedElement.innerText = '--';
    if (pingElement) pingElement.innerText = '--';
    if (jitterElement) jitterElement.innerText = '--';
    if (statusElement) statusElement.innerText = 'Connection Error';
    return;
  }

  currentSpeed = speedData.speed;
  currentUpload = speedData.upload != null ? speedData.upload : '--';
  currentPing = speedData.ping != null ? speedData.ping : '--';
  currentJitter = speedData.jitter != null ? speedData.jitter : '--';
  speedHistory = speedData.history || [];
  isTestingInProgress = speedData.isTestingInProgress || false;

  const formatted = formatSpeedForDisplay(speedData.speed);

  // Update main display
  speedElement.classList.remove('loading-text', 'error-text');
  const speedContainer = document.getElementById('speed-container');
  if (speedContainer) speedContainer.classList.remove('error-unit');
  if (uploadContainer) uploadContainer.classList.remove('error-unit');
  if (pingElement) pingElement.classList.remove('error-ping');
  if (jitterElement) jitterElement.classList.remove('error-ping');

  if (formatted.isOffline) {
    speedElement.classList.add('error-text');
    if (speedContainer) speedContainer.classList.add('error-unit');
    speedElement.innerText = formatted.display;
    unitElement.innerText = formatted.unit;
    if (uploadSpeedElement) uploadSpeedElement.innerText = '--';
    if (pingElement) { pingElement.classList.add('error-ping'); pingElement.innerText = '--'; }
    if (jitterElement) { jitterElement.classList.add('error-ping'); jitterElement.innerText = '--'; }
  } else if (formatted.isError) {
    speedElement.classList.add('error-text');
    if (speedContainer) speedContainer.classList.add('error-unit');
    speedElement.innerText = 'Error';
    unitElement.innerText = 'Connection Failed';
    if (uploadSpeedElement) uploadSpeedElement.innerText = '--';
    if (pingElement) { pingElement.classList.add('error-ping'); pingElement.innerText = '--'; }
    if (jitterElement) { jitterElement.classList.add('error-ping'); jitterElement.innerText = '--'; }
  } else if (isTestingInProgress) {
    speedElement.classList.add('loading-text');
    speedElement.innerText = formatted.display;
    unitElement.innerText = formatted.unit;
    if (uploadSpeedElement) uploadSpeedElement.innerText = currentUpload;
    if (pingElement) pingElement.innerText = currentPing;
    if (jitterElement) jitterElement.innerText = currentJitter;
  } else {
    speedElement.innerText = formatted.display;
    unitElement.innerText = formatted.unit;
    if (uploadSpeedElement) uploadSpeedElement.innerText = currentUpload;
    if (pingElement) pingElement.innerText = currentPing;
    if (jitterElement) jitterElement.innerText = currentJitter;
  }

  // Update status
  if (statusElement) {
    if (formatted.isOffline) {
      statusElement.innerText = 'Offline - waiting for connection';
      statusElement.className = 'status-error';
    } else if (isTestingInProgress) {
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

  // Always make containers visible once we have data (regardless of test state)
  const statsRow = document.getElementById('ping-container');
  [speedContainer, uploadContainer, statsRow].forEach((el) => {
    if (el) {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }
  });
}

function updateSpeedGraph() {
  const svg = document.getElementById('speedChart');
  if (!svg || !speedHistory || speedHistory.length < 2) return;

  const data = Array.isArray(speedHistory) ? speedHistory : speedHistory.slice(-10);
  const W = 232, H = 80, PAD = { top: 10, bottom: 18, left: 28, right: 6 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top - PAD.bottom;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const xStep = iW / (data.length - 1);
  const toX = i => PAD.left + i * xStep;
  const toY = v => PAD.top + iH - ((v - min) / range) * iH;

  const pts = data.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const lastX = toX(data.length - 1).toFixed(1);
  const lastY = toY(data[data.length - 1]).toFixed(1);
  const baseY = PAD.top + iH;
  const fillPts = `${PAD.left},${baseY} ${pts} ${lastX},${baseY}`;

  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs) => {
    const e = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    return e;
  };

  const gradId = 'chartGrad';
  const defs = el('defs', {});
  const grad = el('linearGradient', { id: gradId, x1: '0', y1: '0', x2: '0', y2: '1' });
  const s1 = el('stop', { offset: '0%', 'stop-color': '#ffd700', 'stop-opacity': '0.3' });
  const s2 = el('stop', { offset: '100%', 'stop-color': '#ffd700', 'stop-opacity': '0' });
  grad.append(s1, s2);
  defs.append(grad);

  const fill = el('polygon', { points: fillPts, fill: `url(#${gradId})` });
  const line = el('polyline', { points: pts, fill: 'none', stroke: '#ffd700', 'stroke-width': '1.5', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  const dot = el('circle', { cx: lastX, cy: lastY, r: '3', fill: '#ffd700' });

  const fmt = v => v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : (v * 1000).toFixed(0) + 'K';
  const labelMax = el('text', { x: '0', y: (PAD.top + 4).toFixed(1), class: 'chart-label', 'text-anchor': 'start' });
  labelMax.textContent = fmt(max);
  const labelMin = el('text', { x: '0', y: (H - 4).toFixed(1), class: 'chart-label', 'text-anchor': 'start' });
  labelMin.textContent = fmt(min);

  const baseline = el('line', { x1: PAD.left, y1: baseY, x2: W - PAD.right, y2: baseY, stroke: 'rgba(255,255,255,0.15)', 'stroke-width': '1' });

  svg.replaceChildren(defs, baseline, fill, line, dot, labelMax, labelMin);
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
  if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;

  const speedContainer = document.getElementById('speed-container');
  const uploadContainer = document.getElementById('upload-container');
  const statsRow = document.getElementById('ping-container');

  [speedContainer, uploadContainer, statsRow].forEach((el) => {
    if (el) {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
    }
  });

  setTimeout(updateSpeed, 300);
});

// Initialize advanced features when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Add test button functionality
  const testButton = document.getElementById('testButton');
  if (testButton) {
    testButton.addEventListener('click', forceSpeedTest);
  }

  // Add pin button functionality
  const pinButton = document.getElementById('pin-btn');
  if (pinButton) {
    updatePinButtonState();
    pinButton.addEventListener('click', handlePinClick);
  }

  // Add speed graph
  const graphContainer = document.getElementById('speedGraphContainer');
  if (graphContainer && !document.getElementById('speedChart')) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'speedChart';
    svg.setAttribute('viewBox', '0 0 232 80');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.cssText = 'width:100%;height:80px;display:block;overflow:visible';
    graphContainer.appendChild(svg);
  }

  // Handle overlay toggle
  const overlayToggle = document.getElementById('overlayToggle');
  const overlayBar = document.getElementById('overlayBar');

  function syncOverlayBar(checked) {
    if (overlayBar) overlayBar.classList.toggle('active', checked);
  }

  if (overlayToggle) {
    chrome.storage.local.get('overlayEnabled', (result) => {
      // Default to true if never set
      const isEnabled = result.overlayEnabled !== false;
      overlayToggle.checked = isEnabled;
      syncOverlayBar(isEnabled);
      if (result.overlayEnabled === undefined) {
        chrome.storage.local.set({ overlayEnabled: true });
      }
    });
    overlayToggle.addEventListener('change', () => {
      const enabled = overlayToggle.checked;
      syncOverlayBar(enabled);
      chrome.storage.local.set({ overlayEnabled: enabled }, () => {
        chrome.tabs.query({}, (tabs) => {
          for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, { type: 'overlayToggled' }).catch(() => {});
          }
        });
      });
    });
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

function updatePinButtonState() {
  const pinButton = document.getElementById('pin-btn');
  if (!pinButton) return;

  // Check if extension is likely pinned by checking localStorage
  const isPinned = localStorage.getItem('extensionPinned') === 'true';
  
  if (isPinned) {
    pinButton.innerHTML = '📌 Pinned';
    pinButton.title = 'Extension is pinned - click to unpin';
    pinButton.style.background = 'rgba(255, 215, 0, 0.2)';
    pinButton.style.borderColor = 'rgba(255, 215, 0, 0.3)';
  } else {
    pinButton.innerHTML = '📌 Pin';
    pinButton.title = 'Pin extension to toolbar';
    pinButton.style.background = 'rgba(255, 255, 255, 0.1)';
    pinButton.style.borderColor = 'rgba(255, 255, 255, 0.2)';
  }
}

function handlePinClick() {
  const isPinned = localStorage.getItem('extensionPinned') === 'true';
  
  if (isPinned) {
    // Show unpin instructions
    alert('To unpin this extension:\n\n1. Right-click the extension icon in your toolbar\n2. Select "Remove from toolbar"\n\nOr:\n1. Click the puzzle piece icon (🧩)\n2. Click the pin icon next to this extension to unpin it');
    localStorage.setItem('extensionPinned', 'false');
  } else {
    // Show pin instructions
    alert('To pin this extension:\n\n1. Click the puzzle piece icon (🧩) in your browser toolbar\n2. Find "Real-Time Internet Speed Monitor"\n3. Click the pin icon next to it\n\nThis will keep the extension visible in your toolbar!');
    localStorage.setItem('extensionPinned', 'true');
  }
  
  updatePinButtonState();
}

function handleRatingSystem() {
  const stopRateUsKey = 'stopRatingDiv';
  const divKey = 'ratingDivLastShown';
  const MIN_WAIT_MS = 10 * 60 * 1000; // 10 minutes after install

  const mainContainer = document.getElementById('main');
  const ratingDiv = document.getElementById('ratingDiv');

  // Permanently dismissed — never show again
  if (localStorage.getItem(stopRateUsKey) === 'true') {
    if (ratingDiv) ratingDiv.style.display = 'none';
    return;
  }

  // Already shown today — skip
  const currentDate = new Date().toDateString();
  if (localStorage.getItem(divKey) === currentDate) {
    if (ratingDiv) ratingDiv.style.display = 'none';
    return;
  }

  // Check install time from storage — only show after 10 min
  chrome.storage.local.get('installTime', (result) => {
    const installTime = result.installTime || 0;
    const elapsed = Date.now() - installTime;

    if (elapsed < MIN_WAIT_MS) {
      // Not ready yet — hide rating and show main
      if (ratingDiv) ratingDiv.style.display = 'none';
      return;
    }

    // Ready — show rating modal
    if (mainContainer) mainContainer.style.display = 'none';
    if (ratingDiv) {
      ratingDiv.style.display = 'flex';
      localStorage.setItem(divKey, currentDate);
    }
  });
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
