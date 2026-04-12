'use strict';

const request = require('supertest');

// Stub out deckService so index.test.js never touches the filesystem.
jest.mock('./services/deckService', () => ({
  listDecks: jest.fn().mockReturnValue([]),
  getDeck: jest.fn().mockImplementation((id) => {
    throw new Error(`Deck not found: ${id}`);
  }),
  createDeck: jest.fn(),
  updateDeck: jest.fn(),
  deleteDeck: jest.fn(),
}));

// Stub out mtgaService so import/export routes don't need real parsing in
// this integration smoke-test file. Behaviour is fully covered in
// routes/importExport.test.js and services/mtgaService.test.js.
jest.mock('./services/mtgaService', () => ({
  exportDeck: jest.fn().mockReturnValue('4 Lightning Bolt'),
  parseMtgaText: jest.fn().mockReturnValue({ mainboard: [], sideboard: [], unknown: [] }),
}));

// Stub out cardService so card routes behave predictably without network or
// filesystem access. Route-level behaviour is fully covered in
// routes/cards.test.js and services/cardService.test.js.
jest.mock('./services/cardService', () => ({
  getCard: jest.fn().mockResolvedValue(null),
  searchCards: jest.fn().mockResolvedValue([]),
  getCacheAge: jest.fn().mockResolvedValue(null),
}));

const app = require('./index');

describe('Health check', () => {
  it('GET /health returns HTTP 200', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
  });

  it('GET /health returns { status: "ok" }', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health returns Content-Type application/json', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('Unknown routes', () => {
  it('GET /unknown returns 404 and does not crash the server', async () => {
    const res = await request(app).get('/unknown-route-xyz');
    expect(res.statusCode).toBe(404);
  });
});

describe('Deck routes are mounted', () => {
  it('GET /api/decks returns 200 with an array', async () => {
    const res = await request(app).get('/api/decks');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('Card routes are mounted', () => {
  it('GET /api/cards/search?q=lightning returns 200 with an array', async () => {
    const res = await request(app).get('/api/cards/search?q=lightning');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/cards/search without q param returns 400 with an error property', async () => {
    const res = await request(app).get('/api/cards/search');
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('GET /api/cards/:id for unknown id returns 404 with an error property', async () => {
    const res = await request(app).get('/api/cards/fake-id-123');
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

describe('Import / Export routes are mounted', () => {
  it('POST /api/import with missing text returns 400', async () => {
    const res = await request(app).post('/api/import').send({ name: 'Test' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /api/import with missing name returns 400', async () => {
    const res = await request(app).post('/api/import').send({ text: '4 Lightning Bolt' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /api/decks/:id/export returns 404 for an unknown deck id', async () => {
    const res = await request(app).post('/api/decks/nonexistent-id/export');
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});