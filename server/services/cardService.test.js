'use strict';

/**
 * Unit tests for cardService.
 *
 * Isolation strategy:
 *   - A fresh os.tmpdir() subdirectory is created before each test.
 *   - DATA_DIR is pointed at that directory before the module is required.
 *   - jest.resetModules() + jest.doMock() ensure a fresh module graph whose
 *     CACHE_DIR is resolved against the temp directory.
 *   - global.fetch is replaced with a jest.fn() so no real network calls fire.
 *   - The rate-limiter singleton is mocked to execute enqueued functions
 *     immediately (no artificial delays in tests).
 *   - The temp directory is removed after each test.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let getCard, searchCards, getCacheAge;
let mockScryfallLimiter;
let tempDir;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_CARD = {
  id: 'scryfall-abc-001',
  name: 'Lightning Bolt',
  mana_cost: '{R}',
  type_line: 'Instant',
  oracle_text: 'Lightning Bolt deals 3 damage to any target.',
  set: 'lea',
};

const MOCK_CARD_2 = {
  id: 'scryfall-def-002',
  name: 'Mountain',
  mana_cost: null,
  type_line: 'Basic Land — Mountain',
  oracle_text: '',
  set: 'lea',
};

// ── Fetch mock helpers ────────────────────────────────────────────────────────

/**
 * Configures global.fetch to return a successful 200 response with `body`.
 * @param {object} body
 */
function mockFetchOk(body) {
  global.fetch = jest.fn().mockResolvedValue({
    status: 200,
    ok: true,
    json: () => Promise.resolve(body),
  });
}

/**
 * Configures global.fetch to return a response with the given non-ok status.
 * @param {number} status
 */
function mockFetchStatus(status) {
  global.fetch = jest.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve({ object: 'error', status }),
  });
}

// ── Test lifecycle ────────────────────────────────────────────────────────────

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtg-card-svc-test-'));
  fs.mkdirSync(path.join(tempDir, 'cache'), { recursive: true });

  process.env.DATA_DIR = tempDir;

  jest.resetModules();

  // Register rate-limiter mock AFTER resetModules so subsequent requires
  // within this test get the mock. doMock is not hoisted, unlike jest.mock().
  jest.doMock('../middleware/rateLimiter', () => {
    const enqueue = jest.fn().mockImplementation((fn) => fn());
    return {
      scryfallLimiter: { enqueue },
      RateLimiter: class MockRateLimiter {},
    };
  });

  ({ getCard, searchCards, getCacheAge } = require('./cardService'));
  mockScryfallLimiter = require('../middleware/rateLimiter').scryfallLimiter;

  // Default to throwing so accidental fetch calls are obvious.
  global.fetch = jest.fn().mockRejectedValue(new Error('fetch called unexpectedly'));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
  delete global.fetch;
});

// ── getCacheAge ───────────────────────────────────────────────────────────────

describe('getCacheAge()', () => {
  it('returns null when the card has never been cached', () => {
    expect(getCacheAge('uncached-id')).toBeNull();
  });

  it('returns a non-negative number (ms) for a freshly-cached card', () => {
    const cacheFile = path.join(tempDir, 'cache', `${MOCK_CARD.id}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify(MOCK_CARD), 'utf8');

    const age = getCacheAge(MOCK_CARD.id);
    expect(age).not.toBeNull();
    expect(age).toBeGreaterThanOrEqual(0);
    expect(age).toBeLessThan(2000); // well within 2 seconds of creation
  });

  it('returns age close to 0 for a file written just now', () => {
    const cacheFile = path.join(tempDir, 'cache', `${MOCK_CARD.id}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify(MOCK_CARD), 'utf8');
    expect(getCacheAge(MOCK_CARD.id)).toBeLessThan(500);
  });

  it('returns a large age for an old cache file', () => {
    const cacheFile = path.join(tempDir, 'cache', `${MOCK_CARD.id}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify(MOCK_CARD), 'utf8');

    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    fs.utimesSync(cacheFile, eightDaysAgo, eightDaysAgo);

    const age = getCacheAge(MOCK_CARD.id);
    expect(age).toBeGreaterThan(7 * 24 * 60 * 60 * 1000);
  });
});

// ── getCard — cache hits ──────────────────────────────────────────────────────

describe('getCard() — cache-first behaviour', () => {
  it('returns the cached card when the cache file is fresh', async () => {
    const cacheFile = path.join(tempDir, 'cache', `${MOCK_CARD.id}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify(MOCK_CARD), 'utf8');

    const card = await getCard(MOCK_CARD.id);

    expect(card).toEqual(MOCK_CARD);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('second call for the same id does not hit the Scryfall API', async () => {
    mockFetchOk(MOCK_CARD);

    // First call — cache miss, should fetch.
    await getCard(MOCK_CARD.id);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second call — cache hit, must NOT fetch again.
    await getCard(MOCK_CARD.id);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns equal data on cache-hit as on the original fetch', async () => {
    mockFetchOk(MOCK_CARD);

    const firstResult = await getCard(MOCK_CARD.id);
    const secondResult = await getCard(MOCK_CARD.id);

    expect(secondResult).toEqual(firstResult);
  });
});

// ── getCard — cache miss & persistence ───────────────────────────────────────

describe('getCard() — fetching and caching', () => {
  it('fetches from Scryfall when no cache file exists', async () => {
    mockFetchOk(MOCK_CARD);

    const card = await getCard(MOCK_CARD.id);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/cards/${MOCK_CARD.id}`),
    );
    expect(card).toEqual(MOCK_CARD);
  });

  it('saves the fetched card to data/cache/{id}.json', async () => {
    mockFetchOk(MOCK_CARD);

    await getCard(MOCK_CARD.id);

    const cacheFile = path.join(tempDir, 'cache', `${MOCK_CARD.id}.json`);
    expect(fs.existsSync(cacheFile)).toBe(true);
    const fromDisk = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    expect(fromDisk).toEqual(MOCK_CARD);
  });

  it('leaves no .tmp file after writing the cache', async () => {
    mockFetchOk(MOCK_CARD);

    await getCard(MOCK_CARD.id);

    const tmpFile = path.join(tempDir, 'cache', `${MOCK_CARD.id}.json.tmp`);
    expect(fs.existsSync(tmpFile)).toBe(false);
  });

  it('re-fetches when the cached file is stale (> 7 days)', async () => {
    // Write an old cache file with identifiably different content.
    const staleCard = { ...MOCK_CARD, oracle_text: 'STALE TEXT' };
    const cacheFile = path.join(tempDir, 'cache', `${MOCK_CARD.id}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify(staleCard), 'utf8');

    // Push mtime 8 days into the past.
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    fs.utimesSync(cacheFile, eightDaysAgo, eightDaysAgo);

    const freshCard = { ...MOCK_CARD, oracle_text: 'FRESH TEXT' };
    mockFetchOk(freshCard);

    const card = await getCard(MOCK_CARD.id);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(card.oracle_text).toBe('FRESH TEXT');
  });

  it('fresh cache just under 7 days does NOT trigger a re-fetch', async () => {
    const cacheFile = path.join(tempDir, 'cache', `${MOCK_CARD.id}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify(MOCK_CARD), 'utf8');

    // 6 days, 23 hours, 59 minutes ago — still fresh.
    const justUnder7Days = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000 - 60_000));
    fs.utimesSync(cacheFile, justUnder7Days, justUnder7Days);

    const card = await getCard(MOCK_CARD.id);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(card).toEqual(MOCK_CARD);
  });
});

// ── getCard — error handling ──────────────────────────────────────────────────

describe('getCard() — Scryfall error responses', () => {
  it('returns null for a 404 response without throwing', async () => {
    mockFetchStatus(404);

    const result = await getCard('unknown-scryfall-id');

    expect(result).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does NOT create a cache file when Scryfall returns 404', async () => {
    mockFetchStatus(404);

    await getCard('unknown-id');

    const cacheFile = path.join(tempDir, 'cache', 'unknown-id.json');
    expect(fs.existsSync(cacheFile)).toBe(false);
  });

  it('throws for a 429 response', async () => {
    mockFetchStatus(429);

    await expect(getCard(MOCK_CARD.id)).rejects.toThrow();
  });

  it('429 error has retryable = true', async () => {
    mockFetchStatus(429);

    let caught;
    try {
      await getCard(MOCK_CARD.id);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(caught.retryable).toBe(true);
  });

  it('429 error has type = "RATE_LIMITED"', async () => {
    mockFetchStatus(429);

    let caught;
    try {
      await getCard(MOCK_CARD.id);
    } catch (err) {
      caught = err;
    }

    expect(caught.type).toBe('RATE_LIMITED');
  });

  it('throws for other non-2xx responses (e.g. 500)', async () => {
    mockFetchStatus(500);

    await expect(getCard(MOCK_CARD.id)).rejects.toThrow(/500/);
  });
});

// ── getCard — rate limiter integration ───────────────────────────────────────

describe('getCard() — rate limiter', () => {
  it('routes the Scryfall fetch through the rate-limiter queue', async () => {
    mockFetchOk(MOCK_CARD);

    await getCard(MOCK_CARD.id);

    expect(mockScryfallLimiter.enqueue).toHaveBeenCalledTimes(1);
  });

  it('does NOT call the rate limiter on a cache hit', async () => {
    const cacheFile = path.join(tempDir, 'cache', `${MOCK_CARD.id}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify(MOCK_CARD), 'utf8');

    await getCard(MOCK_CARD.id);

    expect(mockScryfallLimiter.enqueue).not.toHaveBeenCalled();
  });
});

// ── searchCards ───────────────────────────────────────────────────────────────

describe('searchCards() — API call', () => {
  it('returns an array of card objects from Scryfall', async () => {
    mockFetchOk({ data: [MOCK_CARD, MOCK_CARD_2] });

    const results = await searchCards('lightning bolt');

    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual(MOCK_CARD);
    expect(results[1]).toEqual(MOCK_CARD_2);
  });

  it('calls api.scryfall.com/cards/search with the encoded query', async () => {
    mockFetchOk({ data: [] });

    await searchCards('lightning bolt');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('api.scryfall.com/cards/search'),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('q=lightning%20bolt'),
    );
  });

  it('appends order=name to the search URL', async () => {
    mockFetchOk({ data: [] });

    await searchCards('mountain');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('order=name'),
    );
  });

  it('routes the fetch through the rate-limiter queue', async () => {
    mockFetchOk({ data: [MOCK_CARD] });

    await searchCards('lightning');

    expect(mockScryfallLimiter.enqueue).toHaveBeenCalledTimes(1);
  });
});

// ── searchCards — caching individual cards ────────────────────────────────────

describe('searchCards() — individual card caching', () => {
  it('caches each card result individually', async () => {
    mockFetchOk({ data: [MOCK_CARD, MOCK_CARD_2] });

    await searchCards('lightning OR mountain');

    const cache1 = path.join(tempDir, 'cache', `${MOCK_CARD.id}.json`);
    const cache2 = path.join(tempDir, 'cache', `${MOCK_CARD_2.id}.json`);

    expect(fs.existsSync(cache1)).toBe(true);
    expect(fs.existsSync(cache2)).toBe(true);
  });

  it('cached cards are retrievable by getCard() without another fetch', async () => {
    mockFetchOk({ data: [MOCK_CARD] });

    await searchCards('lightning');

    // Reset fetch mock to ensure a second network call would be detected.
    global.fetch = jest.fn().mockRejectedValue(new Error('should not call fetch'));

    const card = await getCard(MOCK_CARD.id);
    expect(card).toEqual(MOCK_CARD);
  });

  it('written cache files are valid JSON and match the card object', async () => {
    mockFetchOk({ data: [MOCK_CARD] });

    await searchCards('lightning');

    const cacheFile = path.join(tempDir, 'cache', `${MOCK_CARD.id}.json`);
    const fromDisk = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    expect(fromDisk).toEqual(MOCK_CARD);
  });

  it('leaves no .tmp files after caching search results', async () => {
    mockFetchOk({ data: [MOCK_CARD, MOCK_CARD_2] });

    await searchCards('basic');

    for (const card of [MOCK_CARD, MOCK_CARD_2]) {
      const tmp = path.join(tempDir, 'cache', `${card.id}.json.tmp`);
      expect(fs.existsSync(tmp)).toBe(false);
    }
  });

  it('skips caching cards that have no id field', async () => {
    const cardWithoutId = { name: 'Mystery Card', mana_cost: '{B}' };
    mockFetchOk({ data: [cardWithoutId] });

    // Should not throw even though card has no id.
    await expect(searchCards('mystery')).resolves.not.toThrow();
  });
});

// ── searchCards — error handling ──────────────────────────────────────────────

describe('searchCards() — Scryfall error responses', () => {
  it('returns an empty array for a 404 (no matching cards)', async () => {
    mockFetchStatus(404);

    const results = await searchCards('xyzzy not a real card 99999');

    expect(results).toEqual([]);
  });

  it('throws for a 429 response', async () => {
    mockFetchStatus(429);

    await expect(searchCards('bolt')).rejects.toThrow();
  });

  it('429 error has retryable = true', async () => {
    mockFetchStatus(429);

    let caught;
    try {
      await searchCards('bolt');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(caught.retryable).toBe(true);
  });

  it('429 error has type = "RATE_LIMITED"', async () => {
    mockFetchStatus(429);

    let caught;
    try {
      await searchCards('bolt');
    } catch (err) {
      caught = err;
    }

    expect(caught.type).toBe('RATE_LIMITED');
  });

  it('throws for other non-2xx responses', async () => {
    mockFetchStatus(503);

    await expect(searchCards('bolt')).rejects.toThrow(/503/);
  });

  it('returns empty array when Scryfall response has no data field', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ object: 'list' }), // no `data` key
    });

    const results = await searchCards('bolt');
    expect(results).toEqual([]);
  });
});