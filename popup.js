let currentSpeed = '--';
let speedHistory = [];
let isTestingInProgress = false;

// Speed categories for user-friendly display
const SPEED_CATEGORIES = {
  excellent: { min: 50, label: 'Excellent', color: '#00C851', icon: '🚀' },
  good: { min: 20, label: 'Good', color: '#007E33', icon: '⚡' },
  fair: { min: 5, label: 'Fair', color: '#FF8800', icon: '📶' },
  slow: { min: 1, label: 'Slow', color: '#FF4444', icon: '🐌' },
  poor: { min: 0, label: 'Poor', color: '#CC0000', icon: '❌' }
};

function getSpeedCategory(speedMbps) {
  for (const [key, category] of Object.entries(SPEED_CATEGORIES)) {
    if (speedMbps >= category.min) {
      return category;
    }
  }
  return SPEED_CATEGORIES.poor;
}

function formatSpeedForDisplay(speedString) {
  if (speedString === '--' || speedString === 'Err') {
    return { 
      display: speedString === 'Err' ? '0' : '--', 
      unit: 'Mbps', 
      isError: speedString === 'Err',
      category: null,
      description: speedString === 'Err' ? 'Connection Error' : 'Initializing...'
    };
  }
  
  const speed = parseFloat(speedString) || 0;
  const category = getSpeedCategory(speed);
  
  let display, unit, description;
  
  if (speed >= 1) {
    // Show Mbps for speeds >= 1
    display = speed >= 100 ? speed.toFixed(0) : speed.toFixed(1);
    unit = 'Mbps';
    
    // Add contextual descriptions
    if (speed >= 100) description = 'Ultra Fast - Perfect for 4K streaming & gaming';
    else if (speed >= 50) description = 'Excellent - Great for everything';
    else if (speed >= 25) description = 'Very Good - 4K streaming ready';
    else if (speed >= 10) description = 'Good - HD streaming & video calls';
    else if (speed >= 5) description = 'Fair - Web browsing & light streaming';
    else description = 'Basic - Web browsing only';
  } else {
    // Show Kbps for speeds < 1 Mbps
    const kbps = Math.round(speed * 1000);
    display = kbps.toString();
    unit = 'Kbps';
    description = 'Very Slow - Basic web browsing only';
  }
  
  return { 
    display, 
    unit, 
    isError: false,
    category,
    description,
    rawSpeed: speed
  };
}

function updateSpeedDisplay(speedData) {
  const speedElement = document.getElementById('speed');
  const unitElement = document.getElementById('unit');
  const statusElement = document.getElementById('status');
  const categoryElement = document.getElementById('category');
  const descriptionElement = document.getElementById('description');
  const speedIndicator = document.getElementById('speedIndicator');
  
  if (!speedData || !speedData.speed) {
    console.error('Failed to retrieve speed data.');
    speedElement.innerText = '--';
    unitElement.innerText = 'Mbps';
    if (statusElement) statusElement.innerText = 'Connection Error';
    if (descriptionElement) descriptionElement.innerText = 'Unable to measure speed';
    return;
  }

  currentSpeed = speedData.speed;
  speedHistory = speedData.history || [];
  isTestingInProgress = speedData.isTestingInProgress || false;
  
  const formatted = formatSpeedForDisplay(speedData.speed);
  
  // Update main speed display
  speedElement.classList.remove('loading-text', 'error-text');
  unitElement.classList.remove('error-unit');
  
  if (formatted.isError) {
    speedElement.classList.add('error-text');
    unitElement.classList.add('error-unit');
    speedElement.innerText = '0';
    unitElement.innerText = 'Mbps';
  } else if (isTestingInProgress) {
    speedElement.classList.add('loading-text');
    speedElement.innerText = 'Testing';
    unitElement.innerText = 'Please wait...';
  } else {
    speedElement.innerText = formatted.display;
    unitElement.innerText = formatted.unit;
    
    // Apply category color
    if (formatted.category) {
      speedElement.style.color = formatted.category.color;
    }
  }
  
  // Update category indicator
  if (categoryElement) {
    if (formatted.category && !isTestingInProgress && !formatted.isError) {
      categoryElement.innerHTML = `${formatted.category.icon} ${formatted.category.label}`;
      categoryElement.style.color = formatted.category.color;
      categoryElement.style.display = 'block';
    } else {
      categoryElement.style.display = 'none';
    }
  }
  
  // Update description
  if (descriptionElement) {
    if (isTestingInProgress) {
      descriptionElement.innerText = 'Measuring your internet speed...';
      descriptionElement.className = 'description-testing';
    } else if (formatted.isError) {
      descriptionElement.innerText = 'Check your internet connection';
      descriptionElement.className = 'description-error';
    } else {
      descriptionElement.innerText = formatted.description;
      descriptionElement.className = 'description-normal';
    }
  }
  
  // Update status
  if (statusElement) {
    if (isTestingInProgress) {
      statusElement.innerText = 'Testing...';
      statusElement.className = 'status-testing';
    } else if (formatted.isError) {
      statusElement.innerText = 'Error';
      statusElement.className = 'status-error';
    } else {
      const lastUpdate = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      statusElement.innerText = `Updated: ${lastUpdate}`;
      statusElement.className = 'status-normal';
    }
  }
  
  // Update speed indicator (visual gauge)
  if (speedIndicator && formatted.rawSpeed !== undefined) {
    updateSpeedIndicator(speedIndicator, formatted.rawSpeed, formatted.category);
  }
  
  // Update speed history visualization
  updateSpeedGraph();
  
  // Trigger animation
  [speedElement, unitElement].forEach((el) => {
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
  });
}

function updateSpeedIndicator(indicator, speed, category) {
  // Create a simple visual gauge
  const maxSpeed = 100; // Max speed for gauge (100 Mbps)
  const percentage = Math.min((speed / maxSpeed) * 100, 100);
  
  indicator.innerHTML = `
    <div class="gauge-track">
      <div class="gauge-fill" style="width: ${percentage}%; background-color: ${category ? category.color : '#ccc'}"></div>
    </div>
    <div class="gauge-labels">
      <span>0</span>
      <span>25</span>
      <span>50</span>
      <span>100+ Mbps</span>
    </div>
  `;
}

function updateSpeedGraph() {
  const graphElement = document.getElementById('speedGraph');
  if (!graphElement || speedHistory.length === 0) return;
  
  const maxSpeed = Math.max(...speedHistory, 10); // Min scale of 10 Mbps
  
  // Create bars with speed values
  const bars = speedHistory.slice(-6).map((speed, index) => {
    const percentage = (speed / maxSpeed) * 100;
    const category = getSpeedCategory(speed);
    return `
      <div class="graph-bar" 
           style="height: ${Math.max(15, percentage)}%; background-color: ${category.color};" 
           title="${speed.toFixed(1)} Mbps - ${category.label}">
      </div>
    `;
  }).join('');
  
  graphElement.innerHTML = bars;
}

function getSpeedComparison(speed) {
  const comparisons = [
    { speed: 100, activity: '4K streaming on multiple devices' },
    { speed: 50, activity: '4K video streaming' },
    { speed: 25, activity: 'HD video streaming' },
    { speed: 10, activity: 'HD video calls' },
    { speed: 5, activity: 'Standard video streaming' },
    { speed: 1, activity: 'Web browsing & email' }
  ];
  
  for (const comp of comparisons) {
    if (speed >= comp.speed) {
      return `Perfect for ${comp.activity}`;
    }
  }
  return 'Suitable for basic web browsing';
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
    testButton.innerHTML = '<span class="spinner"></span> Testing...';
  }
  
  chrome.runtime.sendMessage({ type: 'forceTest' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Runtime error:', chrome.runtime.lastError);
    }
    
    if (testButton) {
      testButton.disabled = false;
      testButton.innerHTML = '🔄 Test Now';
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
