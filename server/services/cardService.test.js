'use strict';

// ── Firestore mock ────────────────────────────────────────────────────────────
const mockCacheDocRef = { get: jest.fn(), set: jest.fn() };
const mockCacheCollRef = { doc: jest.fn(() => mockCacheDocRef) };

jest.mock('./db', () => ({
  db: { collection: jest.fn(() => mockCacheCollRef) },
}));

// Rate limiter mock — executes fn immediately (no artificial delay)
jest.mock('../middleware/rateLimiter', () => ({
  scryfallLimiter: { enqueue: jest.fn((fn) => fn()) },
  RateLimiter: class MockRateLimiter {},
}));

const { getCard, searchCards, getCardBySetCollector, getCacheAge } = require('./cardService');
const { db } = require('./db');
const { scryfallLimiter } = require('../middleware/rateLimiter');

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
  type_line: 'Basic Land — Mountain',
  set: 'lea',
};

// ── Snapshot helpers ──────────────────────────────────────────────────────────

function freshCacheSnap(card) {
  return {
    exists: true,
    data: () => ({ card, cached_at: new Date().toISOString() }),
  };
}

function staleCacheSnap(card) {
  return {
    exists: true,
    data: () => ({
      card,
      cached_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  };
}

const missSnap = { exists: false };

// ── Fetch mock helpers ────────────────────────────────────────────────────────

function mockFetchOk(body) {
  global.fetch = jest.fn().mockResolvedValue({
    status: 200,
    ok: true,
    json: () => Promise.resolve(body),
  });
}

function mockFetchStatus(status) {
  global.fetch = jest.fn().mockResolvedValue({
    status,
    ok: false,
    json: () => Promise.resolve({ object: 'error', status }),
  });
}

// ── Test lifecycle ────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockCacheCollRef.doc.mockReturnValue(mockCacheDocRef);
  mockCacheDocRef.set.mockResolvedValue(undefined);
  global.fetch = jest.fn().mockRejectedValue(new Error('fetch called unexpectedly'));
});

afterEach(() => {
  delete global.fetch;
});

// ── getCacheAge ───────────────────────────────────────────────────────────────

describe('getCacheAge()', () => {
  it('returns null when the card has never been cached', async () => {
    mockCacheDocRef.get.mockResolvedValue(missSnap);

    const age = await getCacheAge('uncached-id');
    expect(age).toBeNull();
  });

  it('returns a non-negative number (ms) for a freshly-cached card', async () => {
    mockCacheDocRef.get.mockResolvedValue(freshCacheSnap(MOCK_CARD));

    const age = await getCacheAge(MOCK_CARD.id);
    expect(age).not.toBeNull();
    expect(age).toBeGreaterThanOrEqual(0);
    expect(age).toBeLessThan(2000);
  });

  it('returns age close to 0 for a document written just now', async () => {
    mockCacheDocRef.get.mockResolvedValue(freshCacheSnap(MOCK_CARD));

    expect(await getCacheAge(MOCK_CARD.id)).toBeLessThan(500);
  });

  it('returns a large age for a stale cache document', async () => {
    mockCacheDocRef.get.mockResolvedValue(staleCacheSnap(MOCK_CARD));

    const age = await getCacheAge(MOCK_CARD.id);
    expect(age).toBeGreaterThan(7 * 24 * 60 * 60 * 1000);
  });
});

// ── getCard — cache hits ──────────────────────────────────────────────────────

describe('getCard() — cache-first behaviour', () => {
  it('returns the cached card when the Firestore document is fresh', async () => {
    // getCacheAge get → fresh, then getCard's second get → card data
    mockCacheDocRef.get.mockResolvedValue(freshCacheSnap(MOCK_CARD));

    const card = await getCard(MOCK_CARD.id);

    expect(card).toEqual(MOCK_CARD);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('second call for the same id does not hit the Scryfall API', async () => {
    mockFetchOk(MOCK_CARD);

    // First call: cache miss → fetch; second call: cache hit → no fetch.
    mockCacheDocRef.get
      .mockResolvedValueOnce(missSnap)           // getCacheAge → miss
      .mockResolvedValueOnce(freshCacheSnap(MOCK_CARD)) // getCacheAge → hit
      .mockResolvedValueOnce(freshCacheSnap(MOCK_CARD)); // getCard snap.data()

    await getCard(MOCK_CARD.id);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await getCard(MOCK_CARD.id);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns equal data on cache-hit as on the original fetch', async () => {
    mockFetchOk(MOCK_CARD);

    mockCacheDocRef.get
      .mockResolvedValueOnce(missSnap)
      .mockResolvedValueOnce(freshCacheSnap(MOCK_CARD))
      .mockResolvedValueOnce(freshCacheSnap(MOCK_CARD));

    const firstResult = await getCard(MOCK_CARD.id);
    const secondResult = await getCard(MOCK_CARD.id);

    expect(secondResult).toEqual(firstResult);
  });
});

// ── getCard — cache miss & persistence ───────────────────────────────────────

describe('getCard() — fetching and caching', () => {
  it('fetches from Scryfall when no cache document exists', async () => {
    mockCacheDocRef.get.mockResolvedValue(missSnap);
    mockFetchOk(MOCK_CARD);

    const card = await getCard(MOCK_CARD.id);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/cards/${MOCK_CARD.id}`),
    );
    expect(card).toEqual(MOCK_CARD);
  });

  it('saves the fetched card to Firestore', async () => {
    mockCacheDocRef.get.mockResolvedValue(missSnap);
    mockFetchOk(MOCK_CARD);

    await getCard(MOCK_CARD.id);

    expect(mockCacheDocRef.set).toHaveBeenCalledWith(
      expect.objectContaining({ card: MOCK_CARD }),
    );
  });

  it('persisted document includes a cached_at ISO timestamp', async () => {
    mockCacheDocRef.get.mockResolvedValue(missSnap);
    mockFetchOk(MOCK_CARD);

    await getCard(MOCK_CARD.id);

    const [{ cached_at }] = mockCacheDocRef.set.mock.calls[0];
    expect(typeof cached_at).toBe('string');
    expect(() => new Date(cached_at)).not.toThrow();
  });

  it('re-fetches when the cached document is stale (> 7 days)', async () => {
    const staleCard = { ...MOCK_CARD, oracle_text: 'STALE TEXT' };
    mockCacheDocRef.get.mockResolvedValue(staleCacheSnap(staleCard));

    const freshCard = { ...MOCK_CARD, oracle_text: 'FRESH TEXT' };
    mockFetchOk(freshCard);

    const card = await getCard(MOCK_CARD.id);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(card.oracle_text).toBe('FRESH TEXT');
  });

  it('fresh cache just under 7 days does NOT trigger a re-fetch', async () => {
    const justUnder7Days = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000 - 60_000));
    mockCacheDocRef.get.mockResolvedValue({
      exists: true,
      data: () => ({ card: MOCK_CARD, cached_at: justUnder7Days.toISOString() }),
    });

    const card = await getCard(MOCK_CARD.id);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(card).toEqual(MOCK_CARD);
  });
});

// ── getCard — error handling ──────────────────────────────────────────────────

describe('getCard() — Scryfall error responses', () => {
  it('returns null for a 404 response without throwing', async () => {
    mockCacheDocRef.get.mockResolvedValue(missSnap);
    mockFetchStatus(404);

    const result = await getCard('unknown-scryfall-id');

    expect(result).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does NOT write to Firestore when Scryfall returns 404', async () => {
    mockCacheDocRef.get.mockResolvedValue(missSnap);
    mockFetchStatus(404);

    await getCard('unknown-id');

    expect(mockCacheDocRef.set).not.toHaveBeenCalled();
  });

  it('throws for a 429 response', async () => {
    mockCacheDocRef.get.mockResolvedValue(missSnap);
    mockFetchStatus(429);

    await expect(getCard(MOCK_CARD.id)).rejects.toThrow();
  });

  it('429 error has retryable = true', async () => {
    mockCacheDocRef.get.mockResolvedValue(missSnap);
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
    mockCacheDocRef.get.mockResolvedValue(missSnap);
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
    mockCacheDocRef.get.mockResolvedValue(missSnap);
    mockFetchStatus(500);

    await expect(getCard(MOCK_CARD.id)).rejects.toThrow(/500/);
  });
});

// ── getCard — rate limiter integration ───────────────────────────────────────

describe('getCard() — rate limiter', () => {
  it('routes the Scryfall fetch through the rate-limiter queue', async () => {
    mockCacheDocRef.get.mockResolvedValue(missSnap);
    mockFetchOk(MOCK_CARD);

    await getCard(MOCK_CARD.id);

    expect(scryfallLimiter.enqueue).toHaveBeenCalledTimes(1);
  });

  it('does NOT call the rate limiter on a cache hit', async () => {
    mockCacheDocRef.get.mockResolvedValue(freshCacheSnap(MOCK_CARD));

    await getCard(MOCK_CARD.id);

    expect(scryfallLimiter.enqueue).not.toHaveBeenCalled();
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

    expect(scryfallLimiter.enqueue).toHaveBeenCalledTimes(1);
  });
});

// ── searchCards — caching individual cards ────────────────────────────────────

describe('searchCards() — individual card caching', () => {
  it('caches each card result individually in Firestore', async () => {
    mockFetchOk({ data: [MOCK_CARD, MOCK_CARD_2] });

    await searchCards('lightning OR mountain');

    // set() should have been called once per card
    expect(mockCacheDocRef.set).toHaveBeenCalledTimes(2);
    expect(mockCacheDocRef.set).toHaveBeenCalledWith(
      expect.objectContaining({ card: MOCK_CARD }),
    );
    expect(mockCacheDocRef.set).toHaveBeenCalledWith(
      expect.objectContaining({ card: MOCK_CARD_2 }),
    );
  });

  it('cached cards are retrievable by getCard() without another fetch', async () => {
    mockFetchOk({ data: [MOCK_CARD] });

    await searchCards('lightning');

    // Now simulate cache hit for getCard()
    global.fetch = jest.fn().mockRejectedValue(new Error('should not call fetch'));
    mockCacheDocRef.get.mockResolvedValue(freshCacheSnap(MOCK_CARD));

    const card = await getCard(MOCK_CARD.id);
    expect(card).toEqual(MOCK_CARD);
  });

  it('doc().set() is called with a valid cached_at timestamp', async () => {
    mockFetchOk({ data: [MOCK_CARD] });

    await searchCards('lightning');

    const [{ cached_at }] = mockCacheDocRef.set.mock.calls[0];
    expect(typeof cached_at).toBe('string');
    expect(() => new Date(cached_at)).not.toThrow();
  });

  it('skips caching cards that have no id field', async () => {
    const cardWithoutId = { name: 'Mystery Card', mana_cost: '{B}' };
    mockFetchOk({ data: [cardWithoutId] });

    await expect(searchCards('mystery')).resolves.not.toThrow();
    expect(mockCacheDocRef.set).not.toHaveBeenCalled();
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

// ── getCardBySetCollector ─────────────────────────────────────────────────────

describe('getCardBySetCollector()', () => {
  it('returns the cached card when the set+collector key is fresh', async () => {
    mockCacheDocRef.get.mockResolvedValue(freshCacheSnap(MOCK_CARD));

    const card = await getCardBySetCollector('LEA', '1');

    expect(card).toEqual(MOCK_CARD);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches from Scryfall when set+collector key is missing', async () => {
    mockCacheDocRef.get.mockResolvedValue(missSnap);
    mockFetchOk(MOCK_CARD);

    const card = await getCardBySetCollector('LEA', '1');

    expect(card).toEqual(MOCK_CARD);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/cards/lea/1'),
    );
  });

  it('re-fetches when the set+collector cache entry is stale', async () => {
    const staleCard = { ...MOCK_CARD, oracle_text: 'STALE' };
    mockCacheDocRef.get.mockResolvedValue(staleCacheSnap(staleCard));

    const freshCard = { ...MOCK_CARD, oracle_text: 'FRESH' };
    mockFetchOk(freshCard);

    const card = await getCardBySetCollector('LEA', '1');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(card.oracle_text).toBe('FRESH');
  });

  it('writes two Firestore documents: one by UUID, one by set+collector key', async () => {
    mockCacheDocRef.get.mockResolvedValue(missSnap);
    mockFetchOk(MOCK_CARD);

    await getCardBySetCollector('LEA', '1');

    expect(mockCacheDocRef.set).toHaveBeenCalledTimes(2);
    expect(mockCacheCollRef.doc).toHaveBeenCalledWith(MOCK_CARD.id);
    expect(mockCacheCollRef.doc).toHaveBeenCalledWith('set_lea_1');
  });

  it('returns null for a 404 response without throwing', async () => {
    mockCacheDocRef.get.mockResolvedValue(missSnap);
    mockFetchStatus(404);

    const result = await getCardBySetCollector('LEA', '999');

    expect(result).toBeNull();
    expect(mockCacheDocRef.set).not.toHaveBeenCalled();
  });

  it('throws for a 429 response with retryable = true', async () => {
    mockCacheDocRef.get.mockResolvedValue(missSnap);
    mockFetchStatus(429);

    let caught;
    try {
      await getCardBySetCollector('LEA', '1');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(caught.retryable).toBe(true);
    expect(caught.type).toBe('RATE_LIMITED');
  });

  it('throws for other non-2xx responses', async () => {
    mockCacheDocRef.get.mockResolvedValue(missSnap);
    mockFetchStatus(500);

    await expect(getCardBySetCollector('LEA', '1')).rejects.toThrow(/500/);
  });

  it('lowercases the set code in both the URL and cache key', async () => {
    mockCacheDocRef.get.mockResolvedValue(missSnap);
    mockFetchOk(MOCK_CARD);

    await getCardBySetCollector('LEA', '1');

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/cards/lea/1'));
    expect(mockCacheCollRef.doc).toHaveBeenCalledWith('set_lea_1');
  });
});
