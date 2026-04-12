'use strict';

jest.mock('../middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { uid: 'test-uid', email: 'robbchar@gmail.com' };
    next();
  },
}));

const request = require('supertest');

// Mock all services — e2e tests now verify route wiring, not filesystem persistence.
// Firestore persistence is covered by deckService.test.js / gameService.test.js.
jest.mock('../services/deckService', () => ({
  listDecks: jest.fn(),
  getDeck: jest.fn(),
  createDeck: jest.fn(),
  updateDeck: jest.fn(),
  deleteDeck: jest.fn(),
}));

jest.mock('../services/cardService', () => ({
  getCard: jest.fn().mockResolvedValue(null),
  searchCards: jest.fn().mockResolvedValue([]),
  getCardBySetCollector: jest.fn().mockResolvedValue(null),
  getCacheAge: jest.fn().mockResolvedValue(null),
}));

jest.mock('../services/mtgaService', () => ({
  parseMtgaText: jest.fn(),
  exportDeck: jest.fn(),
}));

const deckService = require('../services/deckService');
const mtgaService = require('../services/mtgaService');
const app = require('../index');

beforeEach(() => {
  jest.clearAllMocks();
});

// ── POST /api/decks → GET /api/decks/:id ──────────────────────────────────────

describe('E2E: POST then GET deck', () => {
  it('creates a deck and retrieves it by id', async () => {
    const created = { id: 'deck-1', name: 'Test Deck', format: 'Standard', notes: '', cards: [], sideboard: [], tags: [], card_count: 0, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' };
    deckService.createDeck.mockResolvedValue(created);
    deckService.getDeck.mockResolvedValue(created);

    const createRes = await request(app)
      .post('/api/decks')
      .send({ name: 'Test Deck', format: 'Standard' });
    expect(createRes.statusCode).toBe(201);
    expect(createRes.body.id).toBe('deck-1');

    const getRes = await request(app).get('/api/decks/deck-1');
    expect(getRes.statusCode).toBe(200);
    expect(getRes.body.name).toBe('Test Deck');
  });

  it('PUT then GET reflects updated notes', async () => {
    const original = { id: 'deck-1', name: 'Persistence Test', format: 'Standard', notes: '', cards: [], sideboard: [], tags: [], created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' };
    const updated = { ...original, notes: 'Aggro strategy: curve out early, burn face.', updated_at: '2024-01-02T00:00:00.000Z' };

    deckService.createDeck.mockResolvedValue(original);
    deckService.updateDeck.mockResolvedValue(updated);
    deckService.listDecks.mockResolvedValue([{ id: 'deck-1', name: 'Persistence Test', format: 'Standard', notes: updated.notes, card_count: 0, updated_at: updated.updated_at }]);

    const createRes = await request(app).post('/api/decks').send({ name: 'Persistence Test', format: 'Standard' });
    expect(createRes.statusCode).toBe(201);

    const putRes = await request(app).put('/api/decks/deck-1').send({ notes: updated.notes });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.body.notes).toBe(updated.notes);

    const listRes = await request(app).get('/api/decks');
    expect(listRes.statusCode).toBe(200);
    expect(listRes.body[0].notes).toBe(updated.notes);
  });
});

// ── POST /api/import ──────────────────────────────────────────────────────────

describe('E2E: POST /api/import', () => {
  const SAMPLE_TEXT = [
    'Deck',
    '4 Lightning Bolt (FDN) 195',
    '8 Mountain (FDN) 279',
  ].join('\n');

  it('imports a deck and returns 201', async () => {
    mtgaService.parseMtgaText.mockReturnValue({
      mainboard: [
        { name: 'Lightning Bolt', quantity: 4, section: 'mainboard', scryfall_id: null },
        { name: 'Mountain', quantity: 8, section: 'mainboard', scryfall_id: null },
      ],
      sideboard: [],
      unknown: ['Lightning Bolt', 'Mountain'],
    });
    const created = { id: 'import-1', name: 'Bolt Mountain', format: 'Standard', cards: [{ name: 'Lightning Bolt', quantity: 4 }, { name: 'Mountain', quantity: 8 }], sideboard: [], unknown: ['Lightning Bolt', 'Mountain'] };
    deckService.createDeck.mockReturnValue(created);

    const res = await request(app)
      .post('/api/import')
      .send({ text: SAMPLE_TEXT, name: 'Bolt Mountain', format: 'Standard' });

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBe('import-1');
    expect(res.body.name).toBe('Bolt Mountain');
  });
});
