'use strict';

const request = require('supertest');

jest.mock('../services/gameService');

const gameService = require('../services/gameService');
const app = require('../index');

const DECK_ID = 'abc-123';

const MOCK_ENTRY = {
  id: 'game-uuid-1',
  logged_at: '2025-04-03T18:00:00.000Z',
  result: 'win',
  turn_ended: 6,
  opponent_colors: ['R', 'G'],
  opponent_archetype: 'aggro',
  opening_hand_feel: 'good',
  cards_in_hand: ['Impact Tremors'],
  tough_opponent_card: '',
  notes: '',
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ── GET /api/decks/:id/games ──────────────────────────────────────────────────

describe('GET /api/decks/:id/games', () => {
  it('returns 200 with an array of game entries', async () => {
    gameService.getGames.mockReturnValue([MOCK_ENTRY]);
    const res = await request(app).get(`/api/decks/${DECK_ID}/games`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual([MOCK_ENTRY]);
  });

  it('returns an empty array when no games exist', async () => {
    gameService.getGames.mockReturnValue([]);
    const res = await request(app).get(`/api/decks/${DECK_ID}/games`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('calls getGames with the deck id from the URL', async () => {
    gameService.getGames.mockReturnValue([]);
    await request(app).get(`/api/decks/${DECK_ID}/games`);
    expect(gameService.getGames).toHaveBeenCalledWith(DECK_ID);
  });

  it('returns 500 when getGames throws', async () => {
    gameService.getGames.mockImplementation(() => {
      throw new Error('disk read failure');
    });
    const res = await request(app).get(`/api/decks/${DECK_ID}/games`);
    expect(res.statusCode).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});

// ── POST /api/decks/:id/games ─────────────────────────────────────────────────

describe('POST /api/decks/:id/games', () => {
  it('returns 201 with the created game entry', async () => {
    gameService.addGame.mockReturnValue(MOCK_ENTRY);
    const res = await request(app)
      .post(`/api/decks/${DECK_ID}/games`)
      .send({ result: 'win' });
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(MOCK_ENTRY);
  });

  it('calls addGame with the deck id and request body', async () => {
    gameService.addGame.mockReturnValue(MOCK_ENTRY);
    const body = { result: 'win', turn_ended: 6 };
    await request(app).post(`/api/decks/${DECK_ID}/games`).send(body);
    expect(gameService.addGame).toHaveBeenCalledWith(
      DECK_ID,
      expect.objectContaining({ result: 'win', turn_ended: 6 }),
    );
  });

  it('returns 400 when result is missing', async () => {
    gameService.addGame.mockImplementation(() => {
      throw new Error('result is required and must be "win" or "loss"');
    });
    const res = await request(app)
      .post(`/api/decks/${DECK_ID}/games`)
      .send({ turn_ended: 5 });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when result is an invalid value', async () => {
    gameService.addGame.mockImplementation(() => {
      throw new Error('result is required and must be "win" or "loss"');
    });
    const res = await request(app)
      .post(`/api/decks/${DECK_ID}/games`)
      .send({ result: 'draw' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on unexpected service errors', async () => {
    gameService.addGame.mockImplementation(() => {
      throw new Error('unexpected disk failure');
    });
    const res = await request(app)
      .post(`/api/decks/${DECK_ID}/games`)
      .send({ result: 'win' });
    expect(res.statusCode).toBe(500);
  });
});
