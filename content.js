let container = null;
let shadowRoot = null;
let pollTimer = null;
let enabled = false;
let isDragging = false;
let dragOffsetX = 0, dragOffsetY = 0;

// Restore saved position or default to top-right
function getSavedPosition() {
  try {
    const p = JSON.parse(localStorage.getItem('_isp_pos') || 'null');
    if (p && typeof p.right === 'number' && typeof p.top === 'number') return p;
  } catch (_) {}
  return { right: 12, top: 12 };
}

function savePosition(top, right) {
  try { localStorage.setItem('_isp_pos', JSON.stringify({ top, right })); } catch (_) {}
}

function isContextValid() {
  try { return !!chrome.runtime?.id; } catch (_) { return false; }
}

function createOverlay() {
  if (container) return;
  const pos = getSavedPosition();
  container = document.createElement('div');
  shadowRoot = container.attachShadow({ mode: 'closed' });
  shadowRoot.innerHTML = `
    <style>
      :host { all: initial; }
      #pill {
        position: fixed;
        top: ${pos.top}px;
        right: ${pos.right}px;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 20px;
        background: rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255,255,255,0.12);
        cursor: grab;
        user-select: none;
        font-family: 'Segoe UI', system-ui, sans-serif;
        line-height: 1;
        transition: background 0.2s, padding 0.2s, opacity 0.2s;
        opacity: 0.75;
        max-width: 160px;
      }
      #pill:hover { opacity: 1; background: rgba(0,0,0,0.75); }
      #pill.dragging { cursor: grabbing; opacity: 1; }

      /* Speed value */
      #spd {
        font-size: 13px;
        font-weight: 700;
        color: #fff;
        letter-spacing: -0.3px;
        white-space: nowrap;
      }
      #unit {
        font-size: 9px;
        font-weight: 600;
        color: rgba(255,255,255,0.55);
        white-space: nowrap;
      }

      /* Dot indicator */
      #dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
        background: #aaa;
        transition: background 0.3s;
      }

      /* Extra stats — hidden until hover */
      #extra {
        display: none;
        flex-direction: column;
        gap: 2px;
        border-left: 1px solid rgba(255,255,255,0.15);
        padding-left: 7px;
        margin-left: 2px;
      }
      #pill:hover #extra { display: flex; }
      .stat {
        font-size: 9px;
        color: rgba(255,255,255,0.6);
        white-space: nowrap;
      }
      .stat span { color: #fff; font-weight: 600; }
    </style>
    <div id="pill">
      <div id="dot"></div>
      <div id="spd">--</div>
      <div id="unit">Mbps</div>
      <div id="extra">
        <div class="stat">↑ <span id="up">--</span> Mbps</div>
        <div class="stat">ping <span id="ping">--</span> ms</div>
      </div>
    </div>`;

  const root = document.body || document.documentElement;
  root.appendChild(container);
  setupDrag();
}

function removeOverlay() {
  if (container) { container.remove(); container = null; shadowRoot = null; }
}

function dotColor(speed) {
  if (speed === '--' || speed === 'Off' || speed === 'Err') return '#888';
  const n = parseFloat(speed);
  if (isNaN(n)) return '#888';
  if (n >= 20) return '#4ade80';
  if (n >= 5)  return '#fbbf24';
  return '#f87171';
}

function update(data) {
  if (!shadowRoot) return;
  const elSpd  = shadowRoot.getElementById('spd');
  const elUnit = shadowRoot.getElementById('unit');
  const elDot  = shadowRoot.getElementById('dot');
  const elUp   = shadowRoot.getElementById('up');
  const elPing = shadowRoot.getElementById('ping');
  if (!elSpd) return;

  const v = data.speed || '--';

  if (v === 'Err' || v === 'Off') {
    elSpd.textContent = v;
    elUnit.textContent = '';
  } else if (v === '--') {
    elSpd.textContent = data.isTestingInProgress ? '…' : '--';
    elUnit.textContent = 'Mbps';
  } else {
    const n = parseFloat(v);
    if (!isNaN(n) && n < 1) {
      elSpd.textContent = Math.round(n * 1000).toString();
      elUnit.textContent = 'Kbps';
    } else {
      elSpd.textContent = v;
      elUnit.textContent = 'Mbps';
    }
  }

  elDot.style.background = dotColor(v);
  if (elUp)   elUp.textContent   = data.upload && data.upload !== '--' ? data.upload : '--';
  if (elPing) elPing.textContent = data.ping   && data.ping   !== '--' ? data.ping   : '--';
}

function setupDrag() {
  if (!shadowRoot) return;
  const pill = shadowRoot.getElementById('pill');
  if (!pill) return;

  pill.addEventListener('mousedown', (e) => {
    // Only drag on left click, not on hover-expanded area clicks
    if (e.button !== 0) return;
    isDragging = true;
    pill.classList.add('dragging');

    // pill is position:fixed — compute offset from mouse to pill top-left
    const rect = pill.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;

    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging || !shadowRoot) return;
    const p = shadowRoot.getElementById('pill');
    if (!p) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = p.offsetWidth;
    const ph = p.offsetHeight;

    let newLeft = e.clientX - dragOffsetX;
    let newTop  = e.clientY - dragOffsetY;

    // Clamp to viewport
    newLeft = Math.max(0, Math.min(newLeft, vw - pw));
    newTop  = Math.max(0, Math.min(newTop,  vh - ph));

    // Store as right/top so it stays pinned correctly on resize
    const newRight = vw - newLeft - pw;
    p.style.left  = 'auto';
    p.style.right = newRight + 'px';
    p.style.top   = newTop   + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    if (!shadowRoot) return;
    const p = shadowRoot.getElementById('pill');
    if (p) {
      p.classList.remove('dragging');
      // Save position
      const top   = parseInt(p.style.top,   10) || 12;
      const right = parseInt(p.style.right, 10) || 12;
      savePosition(top, right);
    }
  });
}

function fetchSpeed(cb) {
  if (!isContextValid()) { cb(null); return; }
  try {
    chrome.runtime.sendMessage({ type: 'getSpeed' }, (response) => {
      if (chrome.runtime.lastError) { cb(null); return; }
      cb(response);
    });
  } catch (_) { cb(null); }
}

function checkOverlayEnabled(cb) {
  if (!isContextValid()) { cb(false); return; }
  try {
    chrome.storage.local.get('overlayEnabled', (result) => {
      if (chrome.runtime.lastError) { cb(false); return; }
      cb(result.overlayEnabled !== false);
    });
  } catch (_) { cb(false); }
}

function tick() {
  if (!isContextValid()) {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    removeOverlay();
    return;
  }

  checkOverlayEnabled((isEnabled) => {
    if (!isEnabled) {
      if (enabled) { removeOverlay(); enabled = false; }
      return;
    }
    if (!enabled) {
      if (!document.body) { setTimeout(tick, 500); return; }
      createOverlay();
      enabled = true;
    }
    fetchSpeed((data) => { if (data) update(data); });
  });
}

function start() {
  tick();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(tick, 1000);
}

if (isContextValid()) {
  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'overlayToggled') tick();
    });
  } catch (_) {}
}

try {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
} catch (_) {}
