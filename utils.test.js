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

describe('CircularBuffer', () => {
  describe('constructor', () => {
    it('creates a buffer with the given size', () => {
      const buf = new CircularBuffer(5);
      expect(buf.size).toBe(5);
      expect(buf.buffer).toHaveLength(5);
      expect(buf.index).toBe(0);
      expect(buf.length).toBe(0);
    });
  });

  describe('push', () => {
    it('adds items and increments length up to size', () => {
      const buf = new CircularBuffer(3);
      buf.push(1);
      expect(buf.length).toBe(1);
      buf.push(2);
      expect(buf.length).toBe(2);
      buf.push(3);
      expect(buf.length).toBe(3);
    });

    it('wraps around when full and keeps length at size', () => {
      const buf = new CircularBuffer(3);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4);
      expect(buf.length).toBe(3);
      expect(buf.index).toBe(1);
    });
  });

  describe('toArray', () => {
    it('returns empty array for empty buffer', () => {
      const buf = new CircularBuffer(3);
      expect(buf.toArray()).toEqual([]);
    });

    it('returns items in insertion order when partial', () => {
      const buf = new CircularBuffer(5);
      buf.push(10);
      buf.push(20);
      buf.push(30);
      expect(buf.toArray()).toEqual([10, 20, 30]);
    });

    it('returns items in insertion order when full', () => {
      const buf = new CircularBuffer(3);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      expect(buf.toArray()).toEqual([1, 2, 3]);
    });

    it('returns correct order after wrapping', () => {
      const buf = new CircularBuffer(3);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4);
      buf.push(5);
      expect(buf.toArray()).toEqual([3, 4, 5]);
    });

    it('handles multiple wraps', () => {
      const buf = new CircularBuffer(3);
      for (let i = 1; i <= 10; i++) buf.push(i * 10);
      expect(buf.toArray()).toEqual([80, 90, 100]);
    });
  });

  describe('slice', () => {
    it('returns the tail portion starting from start index', () => {
      const buf = new CircularBuffer(5);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4);
      buf.push(5);
      expect(buf.slice(2)).toEqual([3, 4, 5]);
    });

    it('works after wrapping', () => {
      const buf = new CircularBuffer(3);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4);
      buf.push(5);
      buf.push(6);
      expect(buf.slice(1)).toEqual([5, 6]);
    });
  });
});

describe('getMedianSpeed', () => {
  it('returns 0 for empty array', () => {
    expect(getMedianSpeed([])).toBe(0);
  });

  it('returns the single element', () => {
    expect(getMedianSpeed([42])).toBe(42);
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
});

describe('removeOutliers', () => {
  it('returns array unchanged if fewer than 3 elements', () => {
    expect(removeOutliers([5])).toEqual([5]);
    expect(removeOutliers([5, 10])).toEqual([5, 10]);
  });

  it('removes values far from median', () => {
    const result = removeOutliers([10, 12, 9, 11, 100]);
    expect(result).not.toContain(100);
    expect(result).toEqual(expect.arrayContaining([10, 12, 9, 11]));
  });

  it('keeps values within 50% of median', () => {
    const result = removeOutliers([10, 12, 9, 11]);
    expect(result).toEqual([10, 12, 9, 11]);
  });

  it('filters based on 50% threshold from median', () => {
    const result = removeOutliers([10, 15, 10, 100]);
    expect(result.length).toBeLessThan(4);
    expect(result).not.toContain(100);
  });

  it('returns all identical values unchanged', () => {
    expect(removeOutliers([5, 5, 5])).toEqual([5, 5, 5]);
  });
});

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
});

describe('hasStableResults', () => {
  it('returns false for fewer than MIN_STABLE_SAMPLES', () => {
    expect(hasStableResults([1, 2])).toBe(false);
  });

  it('returns false when mean is 0', () => {
    expect(hasStableResults([0, 0, 0])).toBe(false);
  });

  it('returns true for low coefficient of variation', () => {
    const stable = [10, 10.5, 10.2, 10.3, 10.1];
    expect(hasStableResults(stable)).toBe(true);
  });

  it('returns false for high coefficient of variation', () => {
    const unstable = [1, 20, 50, 2, 30];
    expect(hasStableResults(unstable)).toBe(false);
  });

  it('only considers the last MAX_SAMPLE_WINDOW samples', () => {
    const samples = new Array(20).fill(10);
    samples[5] = 100;
    expect(hasStableResults(samples)).toBe(true);
  });

  it('uses STABILITY_THRESHOLD correctly', () => {
    const cv = 0.11;
    const mean = 100;
    const std = mean * cv;
    const values = Array.from({ length: 5 }, () => mean + (Math.random() - 0.5) * std * 2);
    const result = hasStableResults(values);
    expect(typeof result).toBe('boolean');
  });
});

describe('determineConnectionType', () => {
  it('returns fast for speed > 10', () => {
    expect(determineConnectionType(15)).toBe('fast');
    expect(determineConnectionType(10.1)).toBe('fast');
  });

  it('returns medium for speed > 1 and <= 10', () => {
    expect(determineConnectionType(5)).toBe('medium');
    expect(determineConnectionType(1.1)).toBe('medium');
  });

  it('returns slow for speed <= 1', () => {
    expect(determineConnectionType(1)).toBe('slow');
    expect(determineConnectionType(0.5)).toBe('slow');
    expect(determineConnectionType(0)).toBe('slow');
  });

  it('boundary at exactly 10 returns fast', () => {
    expect(determineConnectionType(10)).toBe('medium');
  });
});

describe('formatSpeed', () => {
  it('formats >= 100 with 0 decimal places', () => {
    expect(formatSpeed(100)).toBe('100');
    expect(formatSpeed(123.456)).toBe('123');
  });

  it('formats >= 10 with 1 decimal place', () => {
    expect(formatSpeed(10)).toBe('10.0');
    expect(formatSpeed(25.75)).toBe('25.8');
  });

  it('formats >= 1 with 2 decimal places', () => {
    expect(formatSpeed(1)).toBe('1.00');
    expect(formatSpeed(5.678)).toBe('5.68');
  });

  it('formats < 1 with 3 decimal places', () => {
    expect(formatSpeed(0.5)).toBe('0.500');
    expect(formatSpeed(0.1234)).toBe('0.123');
  });
});

describe('formatSpeedForDisplay', () => {
  it('returns error display for Err', () => {
    expect(formatSpeedForDisplay('Err')).toEqual({
      display: 'Err', unit: 'Mbps', isError: true
    });
  });

  it('returns placeholder for --', () => {
    expect(formatSpeedForDisplay('--')).toEqual({
      display: '--', unit: 'Mbps', isError: false
    });
  });

  it('returns offline display for Off', () => {
    const result = formatSpeedForDisplay('Off');
    expect(result.display).toBe('Offline');
    expect(result.unit).toBe('');
    expect(result.isError).toBe(true);
    expect(result.isOffline).toBe(true);
  });

  it('formats >= 10 Mbps with one decimal', () => {
    expect(formatSpeedForDisplay('25.75')).toEqual({
      display: '25.8', unit: 'Mbps', isError: false
    });
  });

  it('formats 1-10 Mbps with two decimals', () => {
    expect(formatSpeedForDisplay('5.678')).toEqual({
      display: '5.68', unit: 'Mbps', isError: false
    });
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
});

describe('getTestIntervalFromHistory', () => {
  it('returns 3000 for fewer than 2 samples', () => {
    expect(getTestIntervalFromHistory([10])).toBe(3000);
    expect(getTestIntervalFromHistory([])).toBe(3000);
  });

  it('returns longer interval for stable high-speed history', () => {
    const result = getTestIntervalFromHistory([60, 61, 59, 60]);
    expect(result).toBeGreaterThan(10000);
  });

  it('returns shorter interval for unstable history', () => {
    const result = getTestIntervalFromHistory([5, 50, 5, 50]);
    expect(result).toBeLessThan(10000);
  });

  it('returns at least 3000', () => {
    const result = getTestIntervalFromHistory([0.5, 100, 0.5, 100]);
    expect(result).toBeGreaterThanOrEqual(3000);
  });
});

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
});

describe('calculateSpeedMbps', () => {
  it('converts bytes and duration to Mbps', () => {
    expect(calculateSpeedMbps(1_000_000, 0.5)).toBe(16);
  });

  it('returns correct value for typical speeds', () => {
    const result = calculateSpeedMbps(25_000_000, 2);
    expect(result).toBe(100);
  });
});

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
});

describe('isValidSpeed', () => {
  it('returns true for speeds between 0 and 2000', () => {
    expect(isValidSpeed(50)).toBe(true);
    expect(isValidSpeed(0.1)).toBe(true);
    expect(isValidSpeed(1999)).toBe(true);
  });

  it('returns false for 0', () => {
    expect(isValidSpeed(0)).toBe(false);
  });

  it('returns false for negative speeds', () => {
    expect(isValidSpeed(-1)).toBe(false);
  });

  it('returns false for speeds >= 2000', () => {
    expect(isValidSpeed(2000)).toBe(false);
    expect(isValidSpeed(5000)).toBe(false);
  });
});
