'use strict';

/**
 * Card Service — cache-first Scryfall card lookup with rate-limited fetching.
 *
 * Cache files live at data/cache/{scryfallId}.json and are considered fresh
 * for 7 days. Stale or missing entries are re-fetched from the Scryfall REST
 * API. All outgoing requests are serialised through the shared rate-limiter
 * queue so the 10 req/s hard limit is never violated.
 *
 * @module services/cardService
 */

const fs = require('fs');
const path = require('path');
const { scryfallLimiter } = require('../middleware/rateLimiter');

/** Cache time-to-live: 7 days expressed in milliseconds. */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SCRYFALL_BASE = 'https://api.scryfall.com';

// Resolve cache directory using the same strategy as deckService:
// DATA_DIR is relative to the server root (one level up from this file).
// If DATA_DIR is already absolute, path.resolve uses it as-is.
const dataDir = path.resolve(__dirname, '..', process.env.DATA_DIR || '../data');
const CACHE_DIR = path.join(dataDir, 'cache');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the absolute file path for a cached Scryfall card.
 *
 * @param {string} scryfallId
 * @returns {string}
 */
function cachePath(scryfallId) {
  return path.join(CACHE_DIR, `${scryfallId}.json`);
}

/**
 * Atomically writes JSON data to a file.
 * Writes to `<filePath>.tmp` first, then renames. Parent directories are
 * created if they do not already exist.
 *
 * @param {string} filePath - Destination path
 * @param {unknown} data    - Value to serialise as JSON
 */
function atomicWrite(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

/**
 * Builds a rate-limit error that callers can identify as retryable.
 *
 * @param {string} [message]
 * @returns {Error & { retryable: true, type: 'RATE_LIMITED' }}
 */
function makeRateLimitError(
  message = 'Scryfall rate limit exceeded (HTTP 429). Retry after a short delay.',
) {
  const err = new Error(message);
  /** @type {any} */ (err).retryable = true;
  /** @type {any} */ (err).type = 'RATE_LIMITED';
  return err;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the age in milliseconds of a cached card file, or `null` when the
 * card is not cached. Useful for debugging and monitoring cache health.
 *
 * @param {string} scryfallId
 * @returns {number|null}
 */
function getCacheAge(scryfallId) {
  const filePath = cachePath(scryfallId);
  if (!fs.existsSync(filePath)) return null;
  const stats = fs.statSync(filePath);
  return Math.max(0, Date.now() - stats.mtimeMs);
}

/**
 * Returns a Scryfall card object by its UUID using a cache-first strategy.
 *
 * Flow:
 *   1. If a fresh cache file exists (age < 7 days), return it immediately —
 *      no Scryfall request is made.
 *   2. Otherwise enqueue a fetch through the rate limiter, save the result to
 *      `data/cache/{id}.json`, and return the card.
 *
 * Special responses:
 *   - HTTP 404: returns `null` (card not found) without throwing.
 *   - HTTP 429: throws with `{ retryable: true, type: 'RATE_LIMITED' }`.
 *   - Any other non-2xx: throws a generic Error with the status code.
 *
 * @param {string} scryfallId - Scryfall UUID for the card.
 * @returns {Promise<object|null>} Scryfall card object, or `null` if not found.
 */
async function getCard(scryfallId) {
  const age = getCacheAge(scryfallId);
  if (age !== null && age < CACHE_TTL_MS) {
    return JSON.parse(fs.readFileSync(cachePath(scryfallId), 'utf8'));
  }

  const card = await scryfallLimiter.enqueue(async () => {
    const response = await fetch(`${SCRYFALL_BASE}/cards/${scryfallId}`);

    if (response.status === 404) return null;

    if (response.status === 429) {
      throw makeRateLimitError();
    }

    if (!response.ok) {
      throw new Error(`Scryfall API error: HTTP ${response.status}`);
    }

    return response.json();
  });

  if (card !== null) {
    atomicWrite(cachePath(scryfallId), card);
  }

  return card;
}

/**
 * Searches Scryfall for cards matching a query string.
 *
 * Calls `GET api.scryfall.com/cards/search?q={query}&order=name`.
 * Each card in the response is individually cached so subsequent `getCard`
 * calls for the same IDs are served from disk.
 *
 * Special responses:
 *   - HTTP 404 (no matches): returns an empty array — no error thrown.
 *   - HTTP 429: throws with `{ retryable: true, type: 'RATE_LIMITED' }`.
 *   - Any other non-2xx: throws a generic Error with the status code.
 *
 * @param {string} query - Scryfall search syntax query string.
 * @returns {Promise<object[]>} Array of Scryfall card objects (may be empty).
 */
async function searchCards(query) {
  const url = `${SCRYFALL_BASE}/cards/search?q=${encodeURIComponent(query)}&order=name`;

  const responseData = await scryfallLimiter.enqueue(async () => {
    const response = await fetch(url);

    // Scryfall returns 404 when the query matches no cards — treat as empty.
    if (response.status === 404) return { data: [] };

    if (response.status === 429) {
      throw makeRateLimitError();
    }

    if (!response.ok) {
      throw new Error(`Scryfall API error: HTTP ${response.status}`);
    }

    return response.json();
  });

  const cards = responseData.data || [];

  // Cache each card individually for future getCard() cache hits.
  for (const card of cards) {
    if (card && card.id) {
      atomicWrite(cachePath(card.id), card);
    }
  }

  return cards;
}

module.exports = { getCard, searchCards, getCacheAge };