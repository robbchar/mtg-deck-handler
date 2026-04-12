'use strict';

jest.mock('../middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { uid: 'test-uid', email: 'robbchar@gmail.com' };
    next();
  },
}));

/**
 * Unit tests for card API routes.
 *
 * cardService is fully mocked — no real filesystem or Scryfall network calls
 * are made. Behaviour is asserted purely via HTTP responses.
 */

const request = require('supertest');

jest.mock('../services/cardService');

const cardService = require('../services/cardService');
const app = require('../index');

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

/** Builds a rate-limit error identical to what cardService produces. */
function makeRateLimitError() {
  const err = new Error('Scryfall rate limit exceeded (HTTP 429).');
  err.retryable = true;
  err.type = 'RATE_LIMITED';
  return err;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── GET /api/cards/search ─────────────────────────────────────────────────────

describe('GET /api/cards/search', () => {
  // ── Happy paths ─────────────────────────────────────────────────────────────

  it('returns 200 with an array of card objects for a valid query', async () => {
    cardService.searchCards.mockResolvedValue([MOCK_CARD, MOCK_CARD_2]);

    const res = await request(app).get('/api/cards/search?q=lightning');

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual([MOCK_CARD, MOCK_CARD_2]);
  });

  it('returns 200 with an empty array when the query has no results (not 404)', async () => {
    cardService.searchCards.mockResolvedValue([]);

    const res = await request(app).get('/api/cards/search?q=xyzzy+not+a+real+card');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('calls searchCards with the trimmed query string', async () => {
    cardService.searchCards.mockResolvedValue([]);

    await request(app).get('/api/cards/search?q=lightning+bolt');

    expect(cardService.searchCards).toHaveBeenCalledWith('lightning bolt');
  });

  it('calls searchCards with query that contains special characters', async () => {
    cardService.searchCards.mockResolvedValue([]);

    await request(app).get('/api/cards/search?q=t%3Acreature+cmc%3D3');

    expect(cardService.searchCards).toHaveBeenCalledTimes(1);
  });

  // ── Validation — missing / empty query ──────────────────────────────────────

  it('returns 400 when the q param is missing entirely', async () => {
    const res = await request(app).get('/api/cards/search');

    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toHaveProperty('error');
    expect(cardService.searchCards).not.toHaveBeenCalled();
  });

  it('returns 400 when the q param is an empty string', async () => {
    const res = await request(app).get('/api/cards/search?q=');

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(cardService.searchCards).not.toHaveBeenCalled();
  });

  it('returns 400 when the q param is only whitespace', async () => {
    const res = await request(app).get('/api/cards/search?q=%20%20%20');

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(cardService.searchCards).not.toHaveBeenCalled();
  });

  // ── Error handling ───────────────────────────────────────────────────────────

  it('returns 429 when cardService throws a RATE_LIMITED error', async () => {
    cardService.searchCards.mockRejectedValue(makeRateLimitError());

    const res = await request(app).get('/api/cards/search?q=lightning');

    expect(res.statusCode).toBe(429);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 500 on unexpected errors from cardService', async () => {
    cardService.searchCards.mockRejectedValue(new Error('disk I/O failure'));

    const res = await request(app).get('/api/cards/search?q=lightning');

    expect(res.statusCode).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});

// ── GET /api/cards/:scryfallId ────────────────────────────────────────────────

describe('GET /api/cards/:scryfallId', () => {
  // ── Happy paths ─────────────────────────────────────────────────────────────

  it('returns 200 with the card object when found', async () => {
    cardService.getCard.mockResolvedValue(MOCK_CARD);

    const res = await request(app).get('/api/cards/scryfall-abc-001');

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual(MOCK_CARD);
  });

  it('calls getCard with the scryfallId route parameter', async () => {
    cardService.getCard.mockResolvedValue(MOCK_CARD);

    await request(app).get('/api/cards/scryfall-abc-001');

    expect(cardService.getCard).toHaveBeenCalledWith('scryfall-abc-001');
    expect(cardService.getCard).toHaveBeenCalledTimes(1);
  });

  // ── 404 — card not found ─────────────────────────────────────────────────────

  it('returns 404 when getCard returns null (unknown scryfallId)', async () => {
    cardService.getCard.mockResolvedValue(null);

    const res = await request(app).get('/api/cards/totally-fake-id');

    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toHaveProperty('error');
  });

  it('404 error body contains the unknown id for easier debugging', async () => {
    cardService.getCard.mockResolvedValue(null);

    const res = await request(app).get('/api/cards/totally-fake-id');

    expect(res.body.error).toMatch(/totally-fake-id/);
  });

  // ── Error handling ───────────────────────────────────────────────────────────

  it('returns 429 when cardService throws a RATE_LIMITED error', async () => {
    cardService.getCard.mockRejectedValue(makeRateLimitError());

    const res = await request(app).get('/api/cards/some-id');

    expect(res.statusCode).toBe(429);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 500 on unexpected errors from cardService', async () => {
    cardService.getCard.mockRejectedValue(new Error('unexpected failure'));

    const res = await request(app).get('/api/cards/some-id');

    expect(res.statusCode).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});

// ── Route ordering — /search does not clash with /:scryfallId ─────────────────

describe('route ordering', () => {
  it('/search is not treated as a :scryfallId param (does not call getCard)', async () => {
    cardService.searchCards.mockResolvedValue([MOCK_CARD]);

    await request(app).get('/api/cards/search?q=bolt');

    expect(cardService.getCard).not.toHaveBeenCalled();
    expect(cardService.searchCards).toHaveBeenCalledTimes(1);
  });
});