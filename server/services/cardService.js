'use strict';

/**
 * Card Service — cache-first Scryfall card lookup with rate-limited fetching.
 *
 * Cache entries live in the Firestore collection `mtg-deck-handler-card-cache`
 * and are considered fresh for 7 days. Stale or missing entries are re-fetched
 * from the Scryfall REST API. All outgoing requests are serialised through the
 * shared rate-limiter queue so the 10 req/s hard limit is never violated.
 *
 * @module services/cardService
 */

const { scryfallLimiter } = require('../middleware/rateLimiter');
const { db } = require('./db');

/** Cache time-to-live: 7 days expressed in milliseconds. */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SCRYFALL_BASE = 'https://api.scryfall.com';

const CACHE_COLLECTION = 'mtg-deck-handler-card-cache';

// ── Helpers ───────────────────────────────────────────────────────────────────

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
 * Returns the age in milliseconds of a cached card, or null if not cached.
 *
 * @param {string} cacheKey
 * @returns {Promise<number|null>}
 */
async function getCacheAge(cacheKey) {
  const snap = await db.collection(CACHE_COLLECTION).doc(cacheKey).get();
  if (!snap.exists) return null;
  const { cached_at } = snap.data();
  return Math.max(0, Date.now() - new Date(cached_at).getTime());
}

/**
 * Returns a Scryfall card object by its UUID using a cache-first strategy.
 *
 * Flow:
 *   1. If a fresh Firestore cache entry exists (age < 7 days), return it
 *      immediately — no Scryfall request is made.
 *   2. Otherwise enqueue a fetch through the rate limiter, save the result to
 *      Firestore, and return the card.
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
  const age = await getCacheAge(scryfallId);
  if (age !== null && age < CACHE_TTL_MS) {
    const snap = await db.collection(CACHE_COLLECTION).doc(scryfallId).get();
    return snap.data().card;
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
    await db.collection(CACHE_COLLECTION).doc(scryfallId).set({ card, cached_at: new Date().toISOString() });
  }

  return card;
}

/**
 * Searches Scryfall for cards matching a query string.
 *
 * Calls `GET api.scryfall.com/cards/search?q={query}&order=name`.
 * Each card in the response is individually cached so subsequent `getCard`
 * calls for the same IDs are served from Firestore.
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
      await db.collection(CACHE_COLLECTION).doc(card.id).set({ card, cached_at: new Date().toISOString() });
    }
  }

  return cards;
}

/**
 * Returns a Scryfall card object by set code and collector number using a
 * cache-first strategy.
 *
 * Uses Scryfall's `/cards/:set/:collector_number` endpoint — the only reliable
 * way to fetch the exact printing exported by MTGA (e.g. "Mountain (ANB) 114").
 * After fetching, the card is cached both by its UUID (for getCard() hits) and
 * by a set+collector key so repeat imports don't re-hit the network.
 *
 * @param {string} setCode         - Three-to-five character set code (e.g. "ANB")
 * @param {string} collectorNumber - Collector number as a string (e.g. "114", "279a")
 * @returns {Promise<object|null>} Scryfall card object, or `null` if not found.
 */
async function getCardBySetCollector(setCode, collectorNumber) {
  const cacheKey = `set_${setCode.toLowerCase()}_${collectorNumber}`;

  const age = await getCacheAge(cacheKey);
  if (age !== null && age < CACHE_TTL_MS) {
    const snap = await db.collection(CACHE_COLLECTION).doc(cacheKey).get();
    return snap.data().card;
  }

  const card = await scryfallLimiter.enqueue(async () => {
    const response = await fetch(
      `${SCRYFALL_BASE}/cards/${setCode.toLowerCase()}/${collectorNumber}`,
    );

    if (response.status === 404) return null;
    if (response.status === 429) throw makeRateLimitError();
    if (!response.ok) throw new Error(`Scryfall API error: HTTP ${response.status}`);

    return response.json();
  });

  if (card !== null) {
    // Cache by UUID so future getCard() calls are served from Firestore.
    await db.collection(CACHE_COLLECTION).doc(card.id).set({ card, cached_at: new Date().toISOString() });
    // Cache by set+collector for repeat imports without a UUID.
    await db.collection(CACHE_COLLECTION).doc(cacheKey).set({ card, cached_at: new Date().toISOString() });
  }

  return card;
}

module.exports = { getCard, searchCards, getCardBySetCollector, getCacheAge };
