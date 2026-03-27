'use strict';

/**
 * Unit tests for the RateLimiter class.
 *
 * All tests use the configurable-delay constructor so that no real Scryfall
 * requests are made and delays stay small (< 100 ms total suite time).
 */

const { RateLimiter } = require('./rateLimiter');

// ── Basic resolution ──────────────────────────────────────────────────────────

describe('RateLimiter — basic resolution', () => {
  it('resolves a single synchronous function with its return value', async () => {
    const limiter = new RateLimiter(0);
    const result = await limiter.enqueue(() => 42);
    expect(result).toBe(42);
  });

  it('resolves a single async function with its return value', async () => {
    const limiter = new RateLimiter(0);
    const result = await limiter.enqueue(async () => 'async value');
    expect(result).toBe('async value');
  });

  it('propagates errors thrown by enqueued functions', async () => {
    const limiter = new RateLimiter(0);
    await expect(
      limiter.enqueue(() => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('propagates rejected promises from enqueued async functions', async () => {
    const limiter = new RateLimiter(0);
    await expect(
      limiter.enqueue(async () => Promise.reject(new Error('async boom'))),
    ).rejects.toThrow('async boom');
  });

  it('continues processing the queue after a rejection', async () => {
    const limiter = new RateLimiter(0);
    const p1 = limiter.enqueue(() => Promise.reject(new Error('fail'))).catch(() => 'caught');
    const p2 = limiter.enqueue(() => 'ok');
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('caught');
    expect(r2).toBe('ok');
  });
});

// ── FIFO ordering ─────────────────────────────────────────────────────────────

describe('RateLimiter — FIFO ordering', () => {
  it('resolves promises in the order they were enqueued', async () => {
    const limiter = new RateLimiter(0);
    const order = [];

    const p1 = limiter.enqueue(() => { order.push(1); return 1; });
    const p2 = limiter.enqueue(() => { order.push(2); return 2; });
    const p3 = limiter.enqueue(() => { order.push(3); return 3; });

    const results = await Promise.all([p1, p2, p3]);

    expect(order).toEqual([1, 2, 3]);
    expect(results).toEqual([1, 2, 3]);
  });

  it('executes items one at a time — no concurrent dispatch', async () => {
    const limiter = new RateLimiter(0);
    let running = 0;
    let maxConcurrent = 0;

    const task = () =>
      limiter.enqueue(async () => {
        running += 1;
        maxConcurrent = Math.max(maxConcurrent, running);
        // Yield to allow other microtasks to run
        await new Promise((r) => setImmediate(r));
        running -= 1;
      });

    await Promise.all([task(), task(), task()]);

    expect(maxConcurrent).toBe(1);
  });
});

// ── Rate limiting — two simultaneous calls ────────────────────────────────────

describe('RateLimiter — two simultaneous calls do not both fire immediately', () => {
  it('second call has not fired when the first call is executing', async () => {
    // Use a long enough delay that the second definitely hasn't started by the
    // time the first function body runs.
    const DELAY = 60;
    const limiter = new RateLimiter(DELAY);
    const fired = [];

    const p1 = limiter.enqueue(async () => {
      fired.push('first');
      // Give the event loop a chance to (incorrectly) start the second
      await new Promise((r) => setTimeout(r, 5));
      // Second must NOT have fired yet — the rate limit delay hasn't elapsed
      expect(fired).toEqual(['first']);
    });

    const p2 = limiter.enqueue(async () => {
      fired.push('second');
    });

    await Promise.all([p1, p2]);
    expect(fired).toEqual(['first', 'second']);
  });

  it('start times of consecutive calls are separated by at least delayMs', async () => {
    const DELAY = 40;
    const limiter = new RateLimiter(DELAY);
    const fireTimes = [];

    const p1 = limiter.enqueue(() => { fireTimes.push(Date.now()); });
    const p2 = limiter.enqueue(() => { fireTimes.push(Date.now()); });

    await Promise.all([p1, p2]);

    expect(fireTimes).toHaveLength(2);
    const gap = fireTimes[1] - fireTimes[0];
    // Allow 10 ms of timer jitter on slow CI runners
    expect(gap).toBeGreaterThanOrEqual(DELAY - 10);
  });
});

// ── Rate limiting — configurable delay ───────────────────────────────────────

describe('RateLimiter — configurable delay', () => {
  it('accepts a zero delay and resolves immediately', async () => {
    const limiter = new RateLimiter(0);
    const start = Date.now();
    await limiter.enqueue(() => null);
    await limiter.enqueue(() => null);
    // Should complete well under any real rate limit
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('a larger delay produces a measurably longer gap', async () => {
    const SHORT = 0;
    const LONG = 60;
    const times = { short: 0, long: 0 };

    const short = new RateLimiter(SHORT);
    const t0s = Date.now();
    await short.enqueue(() => null);
    await short.enqueue(() => null);
    times.short = Date.now() - t0s;

    const long = new RateLimiter(LONG);
    const t0l = Date.now();
    await long.enqueue(() => null);
    await long.enqueue(() => null);
    times.long = Date.now() - t0l;

    expect(times.long).toBeGreaterThan(times.short);
  });
});

// ── Module export — singleton ─────────────────────────────────────────────────

describe('module exports', () => {
  it('exports RateLimiter class', () => {
    const { RateLimiter: RL } = require('./rateLimiter');
    expect(typeof RL).toBe('function');
    expect(new RL(0)).toBeInstanceOf(RL);
  });

  it('exports a scryfallLimiter singleton', () => {
    const { scryfallLimiter, RateLimiter: RL } = require('./rateLimiter');
    expect(scryfallLimiter).toBeInstanceOf(RL);
  });

  it('scryfallLimiter can enqueue and resolve a call', async () => {
    const { scryfallLimiter } = require('./rateLimiter');
    const result = await scryfallLimiter.enqueue(() => 'singleton works');
    expect(result).toBe('singleton works');
  });
});