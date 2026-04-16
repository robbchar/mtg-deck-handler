'use strict';

jest.mock('../middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { uid: 'test-uid', email: 'robbchar@gmail.com' };
    next();
  },
}));

const request = require('supertest');

jest.mock('../services/deckService');

const deckService = require('../services/deckService');
const app = require('../index');

const MOCK_META = [
  {
    id: 'abc-123',
    name: 'Mono Red',
    format: 'Standard',
    notes: '',
    card_count: 20,
    updated_at: '2024-01-01T00:00:00.000Z',
  },
];

const MOCK_DECK = {
  id: 'abc-123',
  name: 'Mono Red',
  format: 'Standard',
  cards: [],
  sideboard: [],
  notes: '',
  tags: [],
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ── GET /api/decks ─────────────────────────────────────────────────────────────

describe('GET /api/decks', () => {
  it('returns 200 with an array of deck metadata', async () => {
    deckService.listDecks.mockReturnValue(MOCK_META);
    const res = await request(app).get('/api/decks');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual(MOCK_META);
  });

  it('calls listDecks with the authenticated user uid', async () => {
    deckService.listDecks.mockReturnValue(MOCK_META);
    await request(app).get('/api/decks');
    expect(deckService.listDecks).toHaveBeenCalledWith('test-uid');
  });

  it('returns an empty array when no decks exist', async () => {
    deckService.listDecks.mockReturnValue([]);
    const res = await request(app).get('/api/decks');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('includes the notes field in each metadata entry', async () => {
    deckService.listDecks.mockReturnValue([{ ...MOCK_META[0], notes: 'aggro strategy' }]);
    const res = await request(app).get('/api/decks');
    expect(res.statusCode).toBe(200);
    expect(res.body[0]).toHaveProperty('notes', 'aggro strategy');
  });

  it('returns 500 when listDecks throws', async () => {
    deckService.listDecks.mockImplementation(() => { throw new Error('disk read failure'); });
    const res = await request(app).get('/api/decks');
    expect(res.statusCode).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});

// ── GET /api/decks/:id ─────────────────────────────────────────────────────────

describe('GET /api/decks/:id', () => {
  it('returns 200 with the full deck when found', async () => {
    deckService.getDeck.mockReturnValue(MOCK_DECK);
    const res = await request(app).get('/api/decks/abc-123');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(MOCK_DECK);
  });

  it('returns 404 when the deck does not exist', async () => {
    deckService.getDeck.mockImplementation(() => { throw new Error('Deck not found: missing-id'); });
    const res = await request(app).get('/api/decks/missing-id');
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 500 on unexpected errors', async () => {
    deckService.getDeck.mockImplementation(() => { throw new Error('unexpected'); });
    const res = await request(app).get('/api/decks/abc-123');
    expect(res.statusCode).toBe(500);
  });
});

// ── POST /api/decks ────────────────────────────────────────────────────────────

describe('POST /api/decks', () => {
  it('returns 201 with the created deck', async () => {
    deckService.createDeck.mockReturnValue(MOCK_DECK);
    const res = await request(app).post('/api/decks').send({ name: 'Mono Red', format: 'Standard' });
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(MOCK_DECK);
  });

  it('passes trimmed name and userId to createDeck', async () => {
    deckService.createDeck.mockReturnValue(MOCK_DECK);
    await request(app).post('/api/decks').send({ name: '  Mono Red  ' });
    expect(deckService.createDeck).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Mono Red', userId: 'test-uid' }),
    );
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/decks').send({ format: 'Standard' });
    expect(res.statusCode).toBe(400);
    expect(deckService.createDeck).not.toHaveBeenCalled();
  });

  it('returns 400 when name is only whitespace', async () => {
    const res = await request(app).post('/api/decks').send({ name: '   ' });
    expect(res.statusCode).toBe(400);
  });
});

// ── PUT /api/decks/:id ─────────────────────────────────────────────────────────

describe('PUT /api/decks/:id', () => {
  it('returns 200 with the updated deck', async () => {
    const updated = { ...MOCK_DECK, name: 'Updated Name' };
    deckService.updateDeck.mockReturnValue(updated);
    const res = await request(app).put('/api/decks/abc-123').send({ name: 'Updated Name' });
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('Updated Name');
  });

  it('returns 200 with the updated notes field', async () => {
    const updated = { ...MOCK_DECK, notes: 'Go wide, close with burn' };
    deckService.updateDeck.mockReturnValue(updated);
    const res = await request(app).put('/api/decks/abc-123').send({ notes: 'Go wide, close with burn' });
    expect(res.statusCode).toBe(200);
    expect(res.body.notes).toBe('Go wide, close with burn');
  });

  it('calls updateDeck with the correct id and body', async () => {
    deckService.updateDeck.mockReturnValue(MOCK_DECK);
    await request(app).put('/api/decks/abc-123').send({ notes: 'test notes' });
    expect(deckService.updateDeck).toHaveBeenCalledWith(
      'abc-123',
      expect.objectContaining({ notes: 'test notes' }),
    );
  });

  it('returns 404 when the deck does not exist', async () => {
    deckService.updateDeck.mockImplementation(() => { throw new Error('Deck not found: missing-id'); });
    const res = await request(app).put('/api/decks/missing-id').send({ name: 'x' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on unexpected errors', async () => {
    deckService.updateDeck.mockImplementation(() => { throw new Error('disk error'); });
    const res = await request(app).put('/api/decks/abc-123').send({ notes: 'hi' });
    expect(res.statusCode).toBe(500);
  });

  // ── HTTP-level PUT→GET integration (mocked service) ──────────────────────

  it('GET /api/decks returns updated notes in list after PUT', async () => {
    const UPDATED_NOTES = 'Aggro strategy: curve out early, burn face';
    const updatedDeck = { ...MOCK_DECK, notes: UPDATED_NOTES, updated_at: '2024-06-01T00:00:00.000Z' };
    deckService.updateDeck.mockReturnValue(updatedDeck);

    const putRes = await request(app).put('/api/decks/abc-123').send({ notes: UPDATED_NOTES });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.body.notes).toBe(UPDATED_NOTES);

    const updatedMeta = [{ ...MOCK_META[0], notes: UPDATED_NOTES }];
    deckService.listDecks.mockReturnValue(updatedMeta);

    const listRes = await request(app).get('/api/decks');
    expect(listRes.statusCode).toBe(200);
    expect(listRes.body[0].notes).toBe(UPDATED_NOTES);
    expect(deckService.listDecks).toHaveBeenCalledTimes(1);
  });
});

// ── DELETE /api/decks/:id ──────────────────────────────────────────────────────

describe('DELETE /api/decks/:id', () => {
  it('returns 200 with { deleted: true }', async () => {
    deckService.deleteDeck.mockReturnValue({ deleted: true });
    const res = await request(app).delete('/api/decks/abc-123');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ deleted: true });
  });

  it('returns 404 when the deck does not exist', async () => {
    deckService.deleteDeck.mockImplementation(() => { throw new Error('Deck not found: missing-id'); });
    const res = await request(app).delete('/api/decks/missing-id');
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on unexpected errors', async () => {
    deckService.deleteDeck.mockImplementation(() => { throw new Error('unlink failure'); });
    const res = await request(app).delete('/api/decks/abc-123');
    expect(res.statusCode).toBe(500);
  });
});