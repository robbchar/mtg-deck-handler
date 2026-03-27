'use strict';

/**
 * Rate Limiter — enforces a minimum delay between outgoing Scryfall API requests.
 *
 * Uses an async FIFO queue so that concurrent callers are serialised and no
 * two dispatches happen faster than the configured interval, regardless of
 * how many promises are in flight.
 *
 * @module middleware/rateLimiter
 */

/**
 * Async FIFO rate-limiting queue.
 *
 * @example
 * const limiter = new RateLimiter(100); // 100 ms minimum between dispatches
 * const card = await limiter.enqueue(() => fetch('https://api.scryfall.com/cards/...'));
 */
class RateLimiter {
  /**
   * @param {number} delayMs - Minimum milliseconds between consecutive dispatches.
   */
  constructor(delayMs) {
    /** @type {number} */
    this._delayMs = delayMs;

    /**
     * Pending work items, each holding the caller's function plus its
     * promise resolve/reject handles.
     * @type {Array<{ fn: Function, resolve: Function, reject: Function }>}
     */
    this._queue = [];

    /** Whether the internal drain loop is currently running. */
    this._processing = false;

    /**
     * Monotonic timestamp (ms) of when the last request was dispatched.
     * Initialised to 0 so the very first request fires without delay.
     * @type {number}
     */
    this._lastRequestTime = 0;
  }

  /**
   * Adds `fn` to the queue and returns a promise that resolves (or rejects)
   * with `fn`'s result once the rate limit allows it to run.
   *
   * @template T
   * @param {() => T | Promise<T>} fn - Work to execute when it is safe to proceed.
   * @returns {Promise<T>}
   */
  enqueue(fn) {
    return new Promise((resolve, reject) => {
      this._queue.push({ fn, resolve, reject });
      if (!this._processing) {
        this._processQueue();
      }
    });
  }

  /**
   * Internal drain loop. Runs each queued item in FIFO order, sleeping between
   * dispatches to honour `_delayMs`.
   *
   * @private
   * @returns {Promise<void>}
   */
  async _processQueue() {
    this._processing = true;

    while (this._queue.length > 0) {
      const item = this._queue.shift();

      // Compute how long we still need to wait since the last request.
      const elapsed = Date.now() - this._lastRequestTime;
      const wait = Math.max(0, this._delayMs - elapsed);

      if (wait > 0) {
        await new Promise((r) => setTimeout(r, wait));
      }

      this._lastRequestTime = Date.now();

      try {
        const result = await item.fn();
        item.resolve(result);
      } catch (err) {
        item.reject(err);
      }
    }

    this._processing = false;
  }
}

// ── Singleton for production use ──────────────────────────────────────────────

const SCRYFALL_RATE_LIMIT_MS = parseInt(
  process.env.SCRYFALL_RATE_LIMIT_MS || '100',
  10,
);

/**
 * Shared rate limiter instance.  All Scryfall requests in cardService must go
 * through this queue so the 10 req/s limit is enforced server-wide.
 */
const scryfallLimiter = new RateLimiter(SCRYFALL_RATE_LIMIT_MS);

module.exports = { RateLimiter, scryfallLimiter };