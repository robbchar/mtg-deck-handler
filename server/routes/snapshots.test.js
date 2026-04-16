'use strict';

jest.mock('../middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { uid: 'test-uid' };
    next();
  },
}));

const request = require('supertest');

jest.mock('../services/snapshotService');
jest.mock('../services/deckService');

const snapshotService = require('../services/snapshotService');
const deckService = require('../services/deckService');
const app = require('../index');

const DECK_ID = 'deck-abc';
const SNAP_ID = 'snap-xyz';

const MOCK_DECK = {
  id: DECK_ID,
  name: 'Test Deck',
  userId: 'test-uid',
  cards: [],
  sideboard: [],
  format: 'Modern',
  notes: '',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-04-16T00:00:00.000Z',
};

const MOCK_SNAPSHOT = {
  id: SNAP_ID,
  createdAt: '2026-04-16T10:00:00.000Z',
  cards: [],
  sideboard: [],
  format: 'Modern',
  notes: '',
};

beforeEach(() => {
  jest.clearAllMocks();
  // Default: deck exists and belongs to test-uid
  deckService.getDeck.mockResolvedValue(MOCK_DECK);
});

// ── GET /api/decks/:id/snapshots ──────────────────────────────────────────────

describe('GET /api/decks/:id/snapshots', () => {
  it('returns 200 with an array of snapshots', async () => {
    snapshotService.listSnapshots.mockResolvedValue([MOCK_SNAPSHOT]);
    const res = await request(app).get(`/api/decks/${DECK_ID}/snapshots`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([MOCK_SNAPSHOT]);
  });

  it('calls listSnapshots with the deck id', async () => {
    snapshotService.listSnapshots.mockResolvedValue([]);
    await request(app).get(`/api/decks/${DECK_ID}/snapshots`);
    expect(snapshotService.listSnapshots).toHaveBeenCalledWith(DECK_ID);
  });

  it('returns 403 when the deck belongs to a different user', async () => {
    deckService.getDeck.mockResolvedValue({ ...MOCK_DECK, userId: 'other-uid' });
    const res = await request(app).get(`/api/decks/${DECK_ID}/snapshots`);
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when the deck does not exist', async () => {
    deckService.getDeck.mockRejectedValue(new Error('Deck not found: deck-abc'));
    const res = await request(app).get(`/api/decks/${DECK_ID}/snapshots`);
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on unexpected service errors', async () => {
    snapshotService.listSnapshots.mockRejectedValue(new Error('db failure'));
    const res = await request(app).get(`/api/decks/${DECK_ID}/snapshots`);
    expect(res.statusCode).toBe(500);
  });
});

// ── POST /api/decks/:id/snapshots ─────────────────────────────────────────────

describe('POST /api/decks/:id/snapshots', () => {
  it('returns 201 with the created snapshot', async () => {
    snapshotService.createSnapshot.mockResolvedValue(MOCK_SNAPSHOT);
    const res = await request(app)
      .post(`/api/decks/${DECK_ID}/snapshots`)
      .send({ cards: [], sideboard: [], format: 'Modern', notes: '' });
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(MOCK_SNAPSHOT);
  });

  it('calls createSnapshot with deck id and body', async () => {
    snapshotService.createSnapshot.mockResolvedValue(MOCK_SNAPSHOT);
    const body = { cards: [], sideboard: [], format: 'Modern', notes: 'test' };
    await request(app).post(`/api/decks/${DECK_ID}/snapshots`).send(body);
    expect(snapshotService.createSnapshot).toHaveBeenCalledWith(DECK_ID, body);
  });

  it('returns 403 when deck belongs to a different user', async () => {
    deckService.getDeck.mockResolvedValue({ ...MOCK_DECK, userId: 'other-uid' });
    const res = await request(app).post(`/api/decks/${DECK_ID}/snapshots`).send({});
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on unexpected errors', async () => {
    snapshotService.createSnapshot.mockRejectedValue(new Error('db failure'));
    const res = await request(app).post(`/api/decks/${DECK_ID}/snapshots`).send({});
    expect(res.statusCode).toBe(500);
  });
});

// ── POST /api/decks/:id/snapshots/:snapshotId/revert ─────────────────────────

describe('POST /api/decks/:id/snapshots/:snapshotId/revert', () => {
  it('returns 200 with the updated deck', async () => {
    snapshotService.revertToSnapshot.mockResolvedValue(MOCK_DECK);
    const res = await request(app).post(`/api/decks/${DECK_ID}/snapshots/${SNAP_ID}/revert`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(MOCK_DECK);
  });

  it('calls revertToSnapshot with deck id and snapshot id', async () => {
    snapshotService.revertToSnapshot.mockResolvedValue(MOCK_DECK);
    await request(app).post(`/api/decks/${DECK_ID}/snapshots/${SNAP_ID}/revert`);
    expect(snapshotService.revertToSnapshot).toHaveBeenCalledWith(DECK_ID, SNAP_ID);
  });

  it('returns 403 when deck belongs to a different user', async () => {
    deckService.getDeck.mockResolvedValue({ ...MOCK_DECK, userId: 'other-uid' });
    const res = await request(app).post(`/api/decks/${DECK_ID}/snapshots/${SNAP_ID}/revert`);
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when snapshot not found', async () => {
    snapshotService.revertToSnapshot.mockRejectedValue(new Error('Snapshot not found: snap-xyz'));
    const res = await request(app).post(`/api/decks/${DECK_ID}/snapshots/${SNAP_ID}/revert`);
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on unexpected errors', async () => {
    snapshotService.revertToSnapshot.mockRejectedValue(new Error('db failure'));
    const res = await request(app).post(`/api/decks/${DECK_ID}/snapshots/${SNAP_ID}/revert`);
    expect(res.statusCode).toBe(500);
  });
});
