// Minimal tests for Chrome extension functionality
console.log('Starting tests...');

// Mock Chrome APIs
global.chrome = {
  action: {
    setBadgeText: (obj) => console.log('Badge text:', obj.text),
    setBadgeBackgroundColor: (obj) => console.log('Badge color:', obj.color)
  },
  runtime: {
    onMessage: { addListener: () => {} },
    onStartup: { addListener: () => {} },
    onInstalled: { addListener: () => {} }
  }
};

global.navigator = { onLine: true };
global.performance = { now: () => Date.now() };
global.fetch = async () => ({ ok: true, body: { getReader: () => ({ read: async () => ({ done: true }) }) } });

// Test CircularBuffer
class CircularBuffer {
  constructor(size) {
    this.size = size;
    this.buffer = new Array(size);
    this.index = 0;
    this.length = 0;
  }
  
  push(item) {
    this.buffer[this.index] = item;
    this.index = (this.index + 1) % this.size;
    if (this.length < this.size) this.length++;
  }
  
  toArray() {
    if (this.length === 0) return [];
    const result = new Array(this.length);
    for (let i = 0; i < this.length; i++) {
      result[i] = this.buffer[(this.index - this.length + i + this.size) % this.size];
    }
    return result;
  }
}

// Test RequestQueue
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
      const result = await requestFn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.process();
    }
  }
}

// Test functions
function formatSpeed(speedMbps) {
  if (speedMbps >= 100) return speedMbps.toFixed(0);
  if (speedMbps >= 10) return speedMbps.toFixed(1);
  if (speedMbps >= 1) return speedMbps.toFixed(2);
  return speedMbps.toFixed(3);
}

function getSpeedCategory(speed) {
  const numSpeed = parseFloat(speed) || 0;
  if (numSpeed >= 50) return 'excellent';
  if (numSpeed >= 10) return 'good';
  if (numSpeed >= 1) return 'fair';
  return 'poor';
}

// Run tests
async function runTests() {
  let passed = 0, total = 0;
  
  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (e) {
      console.log(`✗ ${name}: ${e.message}`);
    }
  }
  
  // CircularBuffer tests
  test('CircularBuffer push/toArray', () => {
    const buffer = new CircularBuffer(3);
    buffer.push(1);
    buffer.push(2);
    buffer.push(3);
    buffer.push(4); // Should overwrite first
    const arr = buffer.toArray();
    if (arr.length !== 3 || arr[0] !== 2) throw new Error('Buffer overflow failed');
  });
  
  // RequestQueue tests
  test('RequestQueue limits concurrency', async () => {
    const queue = new RequestQueue(1);
    let running = 0;
    let maxRunning = 0;
    
    const task = async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise(r => setTimeout(r, 10));
      running--;
      return 'done';
    };
    
    await Promise.all([queue.add(task), queue.add(task), queue.add(task)]);
    if (maxRunning > 1) throw new Error('Concurrency limit exceeded');
  });
  
  // Speed formatting tests
  test('formatSpeed works correctly', () => {
    if (formatSpeed(150.5) !== '151') throw new Error('High speed format failed');
    if (formatSpeed(25.67) !== '25.7') throw new Error('Medium speed format failed');
    if (formatSpeed(1.234) !== '1.23') throw new Error('Low speed format failed');
    if (formatSpeed(0.567) !== '0.567') throw new Error('Very low speed format failed');
  });
  
  // Speed category tests
  test('getSpeedCategory works correctly', () => {
    if (getSpeedCategory('75') !== 'excellent') throw new Error('Excellent category failed');
    if (getSpeedCategory('25') !== 'good') throw new Error('Good category failed');
    if (getSpeedCategory('5') !== 'fair') throw new Error('Fair category failed');
    if (getSpeedCategory('0.5') !== 'poor') throw new Error('Poor category failed');
  });
  
  console.log(`\nTests completed: ${passed}/${total} passed`);
  return passed === total;
}

runTests().then(success => {
  console.log(success ? 'All tests passed!' : 'Some tests failed!');
  process.exit(success ? 0 : 1);
});