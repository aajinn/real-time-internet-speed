const modeBtn = document.getElementById('modeBtn');
const updateBtn = document.getElementById('updateBtn');
let isRealTime = true; // Default mode


function updateSpeed() {
  chrome.runtime.sendMessage({ type: 'getSpeed' }, (response) => {
    const speedElement = document.getElementById('speed');
    const unitElement = document.getElementById('unit');

    if (!response || !response.speed) {
      console.error('Failed to retrieve speed data.');
      speedElement.innerText = '--';
      unitElement.innerText = 'Mbps';
      return;
    }

    let speed = parseFloat(response.speed) || 0;

    if (speed >= 1) {
      speedElement.classList.remove('loading-text');
      speedElement.innerText = `*${speed.toFixed(1)}`;
      unitElement.innerText = '-Mbps-';
    } else if (speed === 0) {
      unitElement.innerText = '';
      speedElement.innerText = 'Connecting...';
      speedElement.classList.add('loading-text');
    } else {
      speedElement.classList.remove('loading-text');
      speedElement.innerText = `*${(speed * 1000).toFixed(0)}`; // Convert to Kbps
      unitElement.innerText = '-kbps-';
    }
  });
}
// Real-Time Mode: Update speed every 5 seconds
let intervalId = setInterval(updateSpeed, 5000);
updateSpeed(); // Initial update



// Simulate updating speed for demo purposes
function updateSpeedDisplay(speed) {
  const speedElement = document.getElementById('speed');
  speedElement.textContent = speed;
  speedElement.style.animation = 'pulse 0.6s ease-in-out';
}

// Example usage with mock speed
setTimeout(() => updateSpeedDisplay(45.2), 1000);

// Handle "Rate Us" feature
document.addEventListener('DOMContentLoaded', () => {
  const divKey = 'ratingDivLastShown';
  const stopRateUsKey = 'stopRatingDiv';
  const currentDate = new Date().toDateString();

  const mainContainer = document.getElementById('main');
  const ratingDiv = document.getElementById('ratingDiv');

  // Check if the "Rate Us" prompt is permanently disabled
  if (localStorage.getItem(stopRateUsKey) === 'true') {
    ratingDiv.style.display = 'none';
    return;
  }

  if (localStorage.getItem(divKey) !== currentDate) {
    mainContainer.style.display = 'none';
    ratingDiv.style.display = 'block';
    localStorage.setItem(divKey, currentDate);
  } else {
    ratingDiv.style.display = 'none';
  }
});

// Hide "Rate Us" and show main app
document.getElementById('dismiss-btn').addEventListener('click', () => {
  document.getElementById('ratingDiv').style.display = 'none';
  document.getElementById('main').style.display = 'flex';
});

// Permanently disable "Rate Us"
document.getElementById('disable-rating-btn').addEventListener('click', () => {
  localStorage.setItem('stopRatingDiv', 'true');
  document.getElementById('ratingDiv').style.display = 'none';
  document.getElementById('main').style.display = 'flex';
});


// Toggle between Real-Time and Manual Mode
modeBtn.addEventListener('click', () => {
  isRealTime = !isRealTime;

  if (isRealTime) {
    // Enable Real-Time Mode
    modeBtn.innerText = '🤝';
    intervalId = setInterval(updateSpeed, 5000); // Start periodic updates
  } else {
    // Enable Manual Mode
    modeBtn.innerText = '👐';
    clearInterval(intervalId); // Stop periodic updates
  }
});

