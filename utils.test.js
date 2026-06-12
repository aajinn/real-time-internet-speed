const {
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
} = require('./utils.js');

// ---------------------------------------------------------------------------
// CircularBuffer
// ---------------------------------------------------------------------------
describe('CircularBuffer', () => {
  describe('constructor', () => {
    it('creates a buffer with the given size', () => {
      const buf = new CircularBuffer(5);
      expect(buf.size).toBe(5);
      expect(buf.buffer).toHaveLength(5);
      expect(buf.index).toBe(0);
      expect(buf.length).toBe(0);
    });

    it('creates a size-1 buffer', () => {
      const buf = new CircularBuffer(1);
      expect(buf.size).toBe(1);
      expect(buf.length).toBe(0);
    });
  });

  describe('push', () => {
    it('adds items and increments length up to size', () => {
      const buf = new CircularBuffer(3);
      buf.push(1); expect(buf.length).toBe(1);
      buf.push(2); expect(buf.length).toBe(2);
      buf.push(3); expect(buf.length).toBe(3);
    });

    it('wraps around when full and keeps length at size', () => {
      const buf = new CircularBuffer(3);
      buf.push(1); buf.push(2); buf.push(3); buf.push(4);
      expect(buf.length).toBe(3);
      expect(buf.index).toBe(1);
    });

    it('size-1 buffer always holds only the last value', () => {
      const buf = new CircularBuffer(1);
      buf.push(10); buf.push(20); buf.push(30);
      expect(buf.toArray()).toEqual([30]);
    });

    it('correctly overwrites oldest entry on wrap', () => {
      const buf = new CircularBuffer(3);
      buf.push(1); buf.push(2); buf.push(3);
      buf.push(99); // overwrites 1
      expect(buf.toArray()).toEqual([2, 3, 99]);
    });
  });

  describe('toArray', () => {
    it('returns empty array for empty buffer', () => {
      expect(new CircularBuffer(3).toArray()).toEqual([]);
    });

    it('returns items in insertion order when partial', () => {
      const buf = new CircularBuffer(5);
      buf.push(10); buf.push(20); buf.push(30);
      expect(buf.toArray()).toEqual([10, 20, 30]);
    });

    it('returns items in insertion order when full', () => {
      const buf = new CircularBuffer(3);
      buf.push(1); buf.push(2); buf.push(3);
      expect(buf.toArray()).toEqual([1, 2, 3]);
    });

    it('returns correct order after wrapping', () => {
      const buf = new CircularBuffer(3);
      buf.push(1); buf.push(2); buf.push(3); buf.push(4); buf.push(5);
      expect(buf.toArray()).toEqual([3, 4, 5]);
    });

    it('handles multiple wraps', () => {
      const buf = new CircularBuffer(3);
      for (let i = 1; i <= 10; i++) buf.push(i * 10);
      expect(buf.toArray()).toEqual([80, 90, 100]);
    });

    it('does not mutate the buffer on repeated calls', () => {
      const buf = new CircularBuffer(3);
      buf.push(1); buf.push(2); buf.push(3);
      buf.toArray();
      expect(buf.toArray()).toEqual([1, 2, 3]);
    });
  });

  describe('slice', () => {
    it('returns the tail portion starting from start index', () => {
      const buf = new CircularBuffer(5);
      buf.push(1); buf.push(2); buf.push(3); buf.push(4); buf.push(5);
      expect(buf.slice(2)).toEqual([3, 4, 5]);
    });

    it('works after wrapping', () => {
      const buf = new CircularBuffer(3);
      buf.push(1); buf.push(2); buf.push(3);
      buf.push(4); buf.push(5); buf.push(6);
      expect(buf.slice(1)).toEqual([5, 6]);
    });

    it('slice(0) returns same as toArray', () => {
      const buf = new CircularBuffer(4);
      buf.push(10); buf.push(20); buf.push(30);
      expect(buf.slice(0)).toEqual(buf.toArray());
    });
  });
});

// ---------------------------------------------------------------------------
// getMedianSpeed
// ---------------------------------------------------------------------------
describe('getMedianSpeed', () => {
  it('returns 0 for empty array', () => {
    expect(getMedianSpeed([])).toBe(0);
  });

  it('returns the single element', () => {
    expect(getMedianSpeed([42])).toBe(42);
  });

  it('returns average of two elements', () => {
    expect(getMedianSpeed([4, 8])).toBe(6);
  });

  it('returns middle element for odd length', () => {
    expect(getMedianSpeed([1, 3, 5])).toBe(3);
  });

  it('returns average of two middle elements for even length', () => {
    expect(getMedianSpeed([1, 2, 3, 4])).toBe(2.5);
  });

  it('sorts the array before computing median', () => {
    expect(getMedianSpeed([10, 1, 5])).toBe(5);
  });

  it('handles decimal values', () => {
    expect(getMedianSpeed([1.5, 2.5, 3.5])).toBe(2.5);
  });

  it('does not mutate the input array', () => {
    const arr = [3, 1, 2];
    getMedianSpeed(arr);
    expect(arr).toEqual([3, 1, 2]);
  });

  it('handles large arrays', () => {
    const arr = Array.from({ length: 101 }, (_, i) => i + 1); // 1..101
    expect(getMedianSpeed(arr)).toBe(51);
  });
});

// ---------------------------------------------------------------------------
// removeOutliers
// ---------------------------------------------------------------------------
describe('removeOutliers', () => {
  it('returns array unchanged if fewer than 3 elements', () => {
    expect(removeOutliers([5])).toEqual([5]);
    expect(removeOutliers([5, 10])).toEqual([5, 10]);
  });

  it('returns empty array unchanged', () => {
    expect(removeOutliers([])).toEqual([]);
  });

  it('removes values far from median', () => {
    const result = removeOutliers([10, 12, 9, 11, 100]);
    expect(result).not.toContain(100);
    expect(result).toEqual(expect.arrayContaining([10, 12, 9, 11]));
  });

  it('keeps values within 50% of median', () => {
    expect(removeOutliers([10, 12, 9, 11])).toEqual([10, 12, 9, 11]);
  });

  it('filters based on 50% threshold from median', () => {
    const result = removeOutliers([10, 15, 10, 100]);
    expect(result.length).toBeLessThan(4);
    expect(result).not.toContain(100);
  });

  it('returns all identical values unchanged', () => {
    expect(removeOutliers([5, 5, 5])).toEqual([5, 5, 5]);
  });

  it('removes both high and low outliers', () => {
    // median of [10,10,10,10,0.1,200] = 10; 0.1 and 200 are both >50% away
    const result = removeOutliers([10, 10, 10, 10, 0.1, 200]);
    expect(result).not.toContain(0.1);
    expect(result).not.toContain(200);
  });

  it('does not mutate the input array', () => {
    const arr = [10, 12, 9, 11, 100];
    removeOutliers(arr);
    expect(arr).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// calculateVariance
// ---------------------------------------------------------------------------
describe('calculateVariance', () => {
  it('returns zeros for empty array', () => {
    expect(calculateVariance([])).toEqual({ variance: 0, mean: 0 });
  });

  it('computes correct mean and variance', () => {
    const result = calculateVariance([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(result.mean).toBe(5);
    expect(result.variance).toBe(4);
  });

  it('returns zero variance for identical values', () => {
    const result = calculateVariance([5, 5, 5]);
    expect(result.mean).toBe(5);
    expect(result.variance).toBe(0);
  });

  it('handles single element', () => {
    const result = calculateVariance([10]);
    expect(result.mean).toBe(10);
    expect(result.variance).toBe(0);
  });

  it('handles float values', () => {
    const result = calculateVariance([1.5, 2.5, 3.5]);
    expect(result.mean).toBeCloseTo(2.5);
    expect(result.variance).toBeCloseTo(0.667, 2);
  });

  it('mean is correct for asymmetric arrays', () => {
    const result = calculateVariance([0, 100]);
    expect(result.mean).toBe(50);
    expect(result.variance).toBe(2500);
  });
});

// ---------------------------------------------------------------------------
// hasStableResults
// ---------------------------------------------------------------------------
describe('hasStableResults', () => {
  it('returns false for fewer than MIN_STABLE_SAMPLES', () => {
    expect(hasStableResults([1, 2])).toBe(false);
  });

  it('returns false when mean is 0', () => {
    expect(hasStableResults([0, 0, 0])).toBe(false);
  });

  it('returns true for low coefficient of variation', () => {
    expect(hasStableResults([10, 10.5, 10.2, 10.3, 10.1])).toBe(true);
  });

  it('returns false for high coefficient of variation', () => {
    expect(hasStableResults([1, 20, 50, 2, 30])).toBe(false);
  });

  it('only considers the last MAX_SAMPLE_WINDOW samples', () => {
    const samples = new Array(20).fill(10);
    samples[5] = 100; // old spike — outside the window
    expect(hasStableResults(samples)).toBe(true);
  });

  it('is sensitive to a spike within the last MAX_SAMPLE_WINDOW samples', () => {
    const samples = new Array(20).fill(10);
    samples[samples.length - 2] = 100; // recent spike — inside the window
    expect(hasStableResults(samples)).toBe(false);
  });

  it('returns false for exactly MIN_STABLE_SAMPLES - 1 samples', () => {
    expect(hasStableResults(new Array(MIN_STABLE_SAMPLES - 1).fill(10))).toBe(false);
  });

  it('returns true for exactly MIN_STABLE_SAMPLES stable samples', () => {
    // All-same values: CV = 0 which is < STABILITY_THRESHOLD, mean != 0 → true
    expect(hasStableResults(new Array(MIN_STABLE_SAMPLES).fill(10))).toBe(true);
    expect(hasStableResults([10, 10, 10])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// determineConnectionType
// ---------------------------------------------------------------------------
describe('determineConnectionType', () => {
  it('returns fast for speed > 10', () => {
    expect(determineConnectionType(15)).toBe('fast');
    expect(determineConnectionType(10.1)).toBe('fast');
    expect(determineConnectionType(1000)).toBe('fast');
  });

  it('returns medium for speed > 1 and <= 10', () => {
    expect(determineConnectionType(5)).toBe('medium');
    expect(determineConnectionType(1.1)).toBe('medium');
    expect(determineConnectionType(10)).toBe('medium');
  });

  it('returns slow for speed <= 1', () => {
    expect(determineConnectionType(1)).toBe('slow');
    expect(determineConnectionType(0.5)).toBe('slow');
    expect(determineConnectionType(0)).toBe('slow');
  });

  it('boundary: exactly 10 returns medium not fast', () => {
    expect(determineConnectionType(10)).toBe('medium');
  });

  it('boundary: exactly 1 returns slow not medium', () => {
    expect(determineConnectionType(1)).toBe('slow');
  });
});

// ---------------------------------------------------------------------------
// formatSpeed
// ---------------------------------------------------------------------------
describe('formatSpeed', () => {
  it('formats >= 100 with 0 decimal places', () => {
    expect(formatSpeed(100)).toBe('100');
    expect(formatSpeed(123.456)).toBe('123');
    expect(formatSpeed(999.9)).toBe('1000');
  });

  it('formats >= 10 with 1 decimal place', () => {
    expect(formatSpeed(10)).toBe('10.0');
    expect(formatSpeed(25.75)).toBe('25.8');
    expect(formatSpeed(99.99)).toBe('100.0');
  });

  it('formats >= 1 with 2 decimal places', () => {
    expect(formatSpeed(1)).toBe('1.00');
    expect(formatSpeed(5.678)).toBe('5.68');
  });

  it('formats < 1 with 3 decimal places', () => {
    expect(formatSpeed(0.5)).toBe('0.500');
    expect(formatSpeed(0.1234)).toBe('0.123');
    expect(formatSpeed(0.0005)).toBe('0.001');
  });

  it('boundary: exactly 1 uses 2 decimal places', () => {
    expect(formatSpeed(1.0)).toBe('1.00');
  });

  it('boundary: exactly 10 uses 1 decimal place', () => {
    expect(formatSpeed(10.0)).toBe('10.0');
  });
});

// ---------------------------------------------------------------------------
// formatSpeedForDisplay
// ---------------------------------------------------------------------------
describe('formatSpeedForDisplay', () => {
  it('returns error display for Err', () => {
    expect(formatSpeedForDisplay('Err')).toEqual({ display: 'Err', unit: 'Mbps', isError: true });
  });

  it('returns placeholder for --', () => {
    expect(formatSpeedForDisplay('--')).toEqual({ display: '--', unit: 'Mbps', isError: false });
  });

  it('returns offline display for Off', () => {
    const result = formatSpeedForDisplay('Off');
    expect(result.display).toBe('Offline');
    expect(result.unit).toBe('');
    expect(result.isError).toBe(true);
    expect(result.isOffline).toBe(true);
  });

  it('formats >= 10 Mbps with one decimal', () => {
    expect(formatSpeedForDisplay('25.75')).toEqual({ display: '25.8', unit: 'Mbps', isError: false });
  });

  it('formats 1-10 Mbps with two decimals', () => {
    expect(formatSpeedForDisplay('5.678')).toEqual({ display: '5.68', unit: 'Mbps', isError: false });
  });

  it('converts sub-1 Mbps to Kbps', () => {
    const result = formatSpeedForDisplay('0.500');
    expect(result.display).toBe('500');
    expect(result.unit).toBe('Kbps');
    expect(result.isError).toBe(false);
  });

  it('handles empty string via parseFloat fallback', () => {
    const result = formatSpeedForDisplay('');
    expect(result.display).toBe('0');
    expect(result.unit).toBe('Kbps');
  });

  it('boundary: exactly 1 Mbps uses two decimals', () => {
    expect(formatSpeedForDisplay('1')).toEqual({ display: '1.00', unit: 'Mbps', isError: false });
  });

  it('boundary: 0.999 Mbps shows as 999 Kbps', () => {
    const result = formatSpeedForDisplay('0.999');
    expect(result.display).toBe('999');
    expect(result.unit).toBe('Kbps');
  });

  it('isError is false for valid speed string', () => {
    expect(formatSpeedForDisplay('50').isError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getTestIntervalFromHistory
// ---------------------------------------------------------------------------
describe('getTestIntervalFromHistory', () => {
  it('returns 3000 for fewer than 2 samples', () => {
    expect(getTestIntervalFromHistory([10])).toBe(3000);
    expect(getTestIntervalFromHistory([])).toBe(3000);
  });

  it('returns 1.5x base for very stable high-speed history (cv < 0.1)', () => {
    // mean > 50, cv very low → base=15000, result=22500
    const result = getTestIntervalFromHistory([60, 60, 60, 60]);
    expect(result).toBe(22500);
  });

  it('returns base interval for moderately stable history (0.1 <= cv < 0.2)', () => {
    // mean ~60, slight variance, cv between 0.1 and 0.2
    const result = getTestIntervalFromHistory([55, 65, 55, 65]);
    expect(result).toBeGreaterThanOrEqual(15000);
    expect(result).toBeLessThanOrEqual(22500);
  });

  it('returns shorter interval for unstable history (cv >= 0.2)', () => {
    const result = getTestIntervalFromHistory([5, 50, 5, 50]);
    expect(result).toBeLessThan(10000);
  });

  it('returns at least 3000 for extreme instability', () => {
    const result = getTestIntervalFromHistory([0.5, 100, 0.5, 100]);
    expect(result).toBeGreaterThanOrEqual(3000);
  });

  it('uses mean > 10 tier for medium speeds', () => {
    // mean ~15, stable → base=10000, result=15000
    const result = getTestIntervalFromHistory([15, 15, 15, 15]);
    expect(result).toBe(15000);
  });

  it('uses mean <= 10 tier for slow speeds', () => {
    // mean ~5, stable → base=6000, result=9000
    const result = getTestIntervalFromHistory([5, 5, 5, 5]);
    expect(result).toBe(9000);
  });
});

// ---------------------------------------------------------------------------
// calculateJitter
// ---------------------------------------------------------------------------
describe('calculateJitter', () => {
  it('returns 0 for fewer than 2 samples', () => {
    expect(calculateJitter([])).toBe(0);
    expect(calculateJitter([10])).toBe(0);
  });

  it('computes mean absolute deviation between consecutive samples', () => {
    expect(calculateJitter([10, 12, 10, 12])).toBe(2);
  });

  it('returns 0 for identical consecutive samples', () => {
    expect(calculateJitter([10, 10, 10])).toBe(0);
  });

  it('rounds to nearest integer', () => {
    expect(calculateJitter([10, 13])).toBe(3);
  });

  it('handles large jitter values', () => {
    expect(calculateJitter([10, 110])).toBe(100);
  });

  it('handles alternating values correctly', () => {
    // [10,20,10,20]: diffs are [10,10,10] → avg=10
    expect(calculateJitter([10, 20, 10, 20])).toBe(10);
  });

  it('is not affected by order of values only consecutive differences', () => {
    // [10,10,20,20]: diffs are [0,10,0] → avg=3 (rounded)
    expect(calculateJitter([10, 10, 20, 20])).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// calculateSpeedMbps
// ---------------------------------------------------------------------------
describe('calculateSpeedMbps', () => {
  it('converts bytes and duration to Mbps', () => {
    expect(calculateSpeedMbps(1_000_000, 0.5)).toBe(16);
  });

  it('returns correct value for typical speeds', () => {
    expect(calculateSpeedMbps(25_000_000, 2)).toBe(100);
  });

  it('handles small file sizes', () => {
    // 262144 bytes in 1s = 2.097152 Mbps
    expect(calculateSpeedMbps(262144, 1)).toBeCloseTo(2.097, 2);
  });

  it('handles sub-second durations', () => {
    // 1MB in 0.1s = 80 Mbps
    expect(calculateSpeedMbps(1_000_000, 0.1)).toBe(80);
  });

  it('result scales linearly with bytes', () => {
    const r1 = calculateSpeedMbps(1000, 1);
    const r2 = calculateSpeedMbps(2000, 1);
    expect(r2).toBeCloseTo(r1 * 2, 10);
  });

  it('result scales inversely with duration', () => {
    const r1 = calculateSpeedMbps(1_000_000, 1);
    const r2 = calculateSpeedMbps(1_000_000, 2);
    expect(r1).toBeCloseTo(r2 * 2, 10);
  });
});

// ---------------------------------------------------------------------------
// formatBadgeText
// ---------------------------------------------------------------------------
describe('formatBadgeText', () => {
  it('appends M for speeds >= 1', () => {
    expect(formatBadgeText(25.8, '25.8')).toBe('25.8M');
  });

  it('appends K for speeds < 1', () => {
    expect(formatBadgeText(0.5, '0.500')).toBe('500K');
  });

  it('handles boundary at exactly 1', () => {
    expect(formatBadgeText(1, '1.00')).toBe('1.00M');
  });

  it('rounds Kbps to nearest integer', () => {
    expect(formatBadgeText(0.256, '0.256')).toBe('256K');
  });

  it('uses latestSpeedStr as-is for Mbps display', () => {
    expect(formatBadgeText(100, '100')).toBe('100M');
    expect(formatBadgeText(65.0, '65.0')).toBe('65.0M');
  });

  it('handles very small speeds in Kbps', () => {
    expect(formatBadgeText(0.001, '0.001')).toBe('1K');
  });
});

// ---------------------------------------------------------------------------
// isValidSpeed
// ---------------------------------------------------------------------------
describe('isValidSpeed', () => {
  it('returns true for typical speeds', () => {
    expect(isValidSpeed(50)).toBe(true);
    expect(isValidSpeed(0.1)).toBe(true);
    expect(isValidSpeed(5000)).toBe(true);
    expect(isValidSpeed(9999)).toBe(true);
  });

  it('returns false for 0', () => {
    expect(isValidSpeed(0)).toBe(false);
  });

  it('returns false for negative speeds', () => {
    expect(isValidSpeed(-1)).toBe(false);
    expect(isValidSpeed(-100)).toBe(false);
  });

  it('returns false for speeds >= 10000', () => {
    expect(isValidSpeed(10000)).toBe(false);
    expect(isValidSpeed(99999)).toBe(false);
  });

  it('returns false for NaN', () => {
    expect(isValidSpeed(NaN)).toBe(false);
  });

  it('returns false for Infinity', () => {
    expect(isValidSpeed(Infinity)).toBe(false);
  });

  it('boundary: 9999.9 is valid', () => {
    expect(isValidSpeed(9999.9)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// makeRandomPayload (v2.9.0 — full buffer fill, no zero padding)
// ---------------------------------------------------------------------------
function makeRandomPayload(size) {
  const buf = new Uint8Array(size);
  for (let offset = 0; offset < size; offset += 65536) {
    buf.fill(0xff, offset, Math.min(offset + 65536, size));
  }
  return buf;
}

describe('makeRandomPayload', () => {
  it('returns a Uint8Array of the requested size', () => {
    const buf = makeRandomPayload(1024);
    expect(buf).toBeInstanceOf(Uint8Array);
    expect(buf.length).toBe(1024);
  });

  it('fills sizes smaller than 65536 in one chunk', () => {
    expect(makeRandomPayload(100).length).toBe(100);
  });

  it('fills sizes larger than 65536 across multiple chunks', () => {
    expect(makeRandomPayload(200 * 1024).length).toBe(200 * 1024);
  });

  it('fills the entire buffer — second chunk has no zero bytes', () => {
    const buf = makeRandomPayload(130 * 1024);
    const secondChunk = buf.slice(65536);
    expect(secondChunk.every(b => b !== 0)).toBe(true);
  });

  it('handles exact multiple of 65536', () => {
    expect(makeRandomPayload(65536 * 2).length).toBe(65536 * 2);
  });

  it('handles size of exactly 65536', () => {
    expect(makeRandomPayload(65536).length).toBe(65536);
  });
});

// ---------------------------------------------------------------------------
// Overlay dot color (v2.9.0)
// ---------------------------------------------------------------------------
function dotColor(speed) {
  if (speed === '--' || speed === 'Off' || speed === 'Err') return '#888';
  const n = parseFloat(speed);
  if (isNaN(n)) return '#888';
  if (n >= 20) return '#4ade80';
  if (n >= 5)  return '#fbbf24';
  return '#f87171';
}

describe('dotColor', () => {
  it('returns grey for --, Off, Err', () => {
    expect(dotColor('--')).toBe('#888');
    expect(dotColor('Off')).toBe('#888');
    expect(dotColor('Err')).toBe('#888');
  });

  it('returns grey for non-numeric string', () => {
    expect(dotColor('abc')).toBe('#888');
  });

  it('returns green for speed >= 20 Mbps', () => {
    expect(dotColor('20')).toBe('#4ade80');
    expect(dotColor('100')).toBe('#4ade80');
  });

  it('returns yellow for 5 <= speed < 20 Mbps', () => {
    expect(dotColor('5')).toBe('#fbbf24');
    expect(dotColor('19.9')).toBe('#fbbf24');
  });

  it('returns red for speed < 5 Mbps', () => {
    expect(dotColor('4.9')).toBe('#f87171');
    expect(dotColor('0.5')).toBe('#f87171');
  });

  it('boundary: exactly 20 is green, 19.9 is yellow', () => {
    expect(dotColor('20')).toBe('#4ade80');
    expect(dotColor('19.9')).toBe('#fbbf24');
  });

  it('boundary: exactly 5 is yellow, 4.9 is red', () => {
    expect(dotColor('5')).toBe('#fbbf24');
    expect(dotColor('4.9')).toBe('#f87171');
  });
});

// ---------------------------------------------------------------------------
// Overlay speed/unit display formatting (v2.9.0)
// ---------------------------------------------------------------------------
function formatOverlaySpeed(v, isTestingInProgress = false) {
  if (v === 'Err' || v === 'Off') return { text: v, unit: '' };
  if (v === '--') return { text: isTestingInProgress ? '…' : '--', unit: 'Mbps' };
  const n = parseFloat(v);
  if (!isNaN(n) && n < 1) return { text: Math.round(n * 1000).toString(), unit: 'Kbps' };
  return { text: v, unit: 'Mbps' };
}

describe('formatOverlaySpeed', () => {
  it('shows -- and Mbps when idle', () => {
    expect(formatOverlaySpeed('--')).toEqual({ text: '--', unit: 'Mbps' });
  });

  it('shows ellipsis when testing', () => {
    expect(formatOverlaySpeed('--', true)).toEqual({ text: '…', unit: 'Mbps' });
  });

  it('shows Err/Off with no unit', () => {
    expect(formatOverlaySpeed('Err')).toEqual({ text: 'Err', unit: '' });
    expect(formatOverlaySpeed('Off')).toEqual({ text: 'Off', unit: '' });
  });

  it('shows Mbps for speeds >= 1', () => {
    expect(formatOverlaySpeed('65.0')).toEqual({ text: '65.0', unit: 'Mbps' });
    expect(formatOverlaySpeed('1.00')).toEqual({ text: '1.00', unit: 'Mbps' });
  });

  it('converts sub-1 Mbps to Kbps', () => {
    expect(formatOverlaySpeed('0.5')).toEqual({ text: '500', unit: 'Kbps' });
    expect(formatOverlaySpeed('0.001')).toEqual({ text: '1', unit: 'Kbps' });
  });

  it('boundary: 1.0 is Mbps, 0.999 is Kbps', () => {
    expect(formatOverlaySpeed('1.0').unit).toBe('Mbps');
    expect(formatOverlaySpeed('0.999').unit).toBe('Kbps');
    expect(formatOverlaySpeed('0.999').text).toBe('999');
  });
});

// ---------------------------------------------------------------------------
// Rating system — 10-minute install gate (v2.9.0)
// ---------------------------------------------------------------------------
function shouldShowRating({ installTime, stopRating, lastShownDate, currentDate }) {
  const MIN_WAIT_MS = 10 * 60 * 1000;
  if (stopRating) return false;
  if (lastShownDate === currentDate) return false;
  if (!installTime) return false;
  return Date.now() - installTime >= MIN_WAIT_MS;
}

describe('rating system — 10-minute install gate', () => {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const base = {
    installTime: Date.now() - 20 * 60 * 1000,
    stopRating: false,
    lastShownDate: yesterday,
    currentDate: today
  };

  it('shows when all conditions pass', () => {
    expect(shouldShowRating(base)).toBe(true);
  });

  it('does not show if permanently dismissed', () => {
    expect(shouldShowRating({ ...base, stopRating: true })).toBe(false);
  });

  it('does not show if already shown today', () => {
    expect(shouldShowRating({ ...base, lastShownDate: today })).toBe(false);
  });

  it('does not show if installTime is missing (0)', () => {
    expect(shouldShowRating({ ...base, installTime: 0 })).toBe(false);
  });

  it('does not show if under 10 minutes since install', () => {
    expect(shouldShowRating({ ...base, installTime: Date.now() - 5 * 60 * 1000 })).toBe(false);
  });

  it('does not show at exactly 9min 59s', () => {
    expect(shouldShowRating({ ...base, installTime: Date.now() - (10 * 60 * 1000 - 1000) })).toBe(false);
  });

  it('shows at exactly 10 minutes', () => {
    expect(shouldShowRating({ ...base, installTime: Date.now() - 10 * 60 * 1000 })).toBe(true);
  });

  it('shows on first ever open (null lastShownDate)', () => {
    expect(shouldShowRating({ ...base, lastShownDate: null })).toBe(true);
  });

  it('shows after 1 hour', () => {
    expect(shouldShowRating({ ...base, installTime: Date.now() - 60 * 60 * 1000 })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Upload sample reliability threshold (v2.9.0)
// ---------------------------------------------------------------------------
function isReliableUploadSample(durationSeconds, responseOk) {
  return responseOk && durationSeconds > 0.1;
}

describe('upload sample reliability threshold', () => {
  it('rejects samples <= 100ms', () => {
    expect(isReliableUploadSample(0.05, true)).toBe(false);
    expect(isReliableUploadSample(0.1, true)).toBe(false);
  });

  it('accepts samples > 100ms with ok response', () => {
    expect(isReliableUploadSample(0.101, true)).toBe(true);
    expect(isReliableUploadSample(2.0, true)).toBe(true);
  });

  it('rejects when response not ok regardless of duration', () => {
    expect(isReliableUploadSample(1.0, false)).toBe(false);
  });

  it('rejects zero duration', () => {
    expect(isReliableUploadSample(0, true)).toBe(false);
  });
});
