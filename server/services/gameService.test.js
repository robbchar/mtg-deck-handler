'use strict';

// ── Firestore mock ────────────────────────────────────────────────────────────
// Chain: db.collection('mtg-deck-handler').doc(deckId).collection('games')
// gamesRef.orderBy(...).get()     → getGames
// gamesRef.add(entry)             → addGame
// gamesRef.doc(gameId).get()      → removeGame (existence check)
// gamesRef.doc(gameId).delete()   → removeGame

const mockGameDocRef = { get: jest.fn(), delete: jest.fn() };
const mockOrderByRef = { get: jest.fn() };
const mockGamesRef = {
  orderBy: jest.fn(() => mockOrderByRef),
  add: jest.fn(),
  doc: jest.fn(() => mockGameDocRef),
};
const mockDeckDocRef = { collection: jest.fn(() => mockGamesRef) };
const mockDeckCollRef = { doc: jest.fn(() => mockDeckDocRef) };

jest.mock('./db', () => ({
  db: { collection: jest.fn(() => mockDeckCollRef) },
}));

const { db } = require('./db');
const { getGames, addGame, removeGame } = require('./gameService');

const DECK_ID = 'deck-abc';

beforeEach(() => {
  jest.clearAllMocks();
  mockDeckCollRef.doc.mockReturnValue(mockDeckDocRef);
  mockDeckDocRef.collection.mockReturnValue(mockGamesRef);
  mockGamesRef.orderBy.mockReturnValue(mockOrderByRef);
  mockGamesRef.doc.mockReturnValue(mockGameDocRef);
});

// ── getGames ──────────────────────────────────────────────────────────────────

describe('getGames(deckId)', () => {
  it('returns an empty array when no games exist', async () => {
    mockOrderByRef.get.mockResolvedValue({ docs: [] });
    expect(await getGames(DECK_ID)).toEqual([]);
  });

  it('returns games ordered newest first (orderBy logged_at desc)', async () => {
    const entry1 = { id: 'g1', result: 'win', logged_at: '2024-01-01T00:00:00.000Z' };
    const entry2 = { id: 'g2', result: 'loss', logged_at: '2024-01-02T00:00:00.000Z' };
    mockOrderByRef.get.mockResolvedValue({
      docs: [
        { id: 'g2', data: () => entry2 },
        { id: 'g1', data: () => entry1 },
      ],
    });
    const games = await getGames(DECK_ID);
    expect(games[0].id).toBe('g2');
    expect(games[1].id).toBe('g1');
  });

  it('calls orderBy with logged_at desc', async () => {
    mockOrderByRef.get.mockResolvedValue({ docs: [] });
    await getGames(DECK_ID);
    expect(mockGamesRef.orderBy).toHaveBeenCalledWith('logged_at', 'desc');
    expect(db.collection).toHaveBeenCalledWith('mtg-deck-handler');
    expect(mockDeckCollRef.doc).toHaveBeenCalledWith(DECK_ID);
    expect(mockDeckDocRef.collection).toHaveBeenCalledWith('games');
  });
});

// ── addGame ───────────────────────────────────────────────────────────────────

describe('addGame(deckId, gameData)', () => {
  it('returns the new entry with the generated id', async () => {
    mockGamesRef.add.mockResolvedValue({ id: 'new-game-id' });
    const entry = await addGame(DECK_ID, { result: 'win' });
    expect(entry.id).toBe('new-game-id');
    expect(entry.result).toBe('win');
  });

  it('throws when result is missing', async () => {
    await expect(addGame(DECK_ID, {})).rejects.toThrow('result is required');
  });

  it('throws when result is invalid', async () => {
    await expect(addGame(DECK_ID, { result: 'draw' })).rejects.toThrow('result is required');
  });

  it('sets default values for optional fields', async () => {
    mockGamesRef.add.mockResolvedValue({ id: 'x' });
    const entry = await addGame(DECK_ID, { result: 'loss' });
    expect(entry.turn_ended).toBeNull();
    expect(entry.opponent_colors).toEqual([]);
    expect(entry.opponent_archetype).toBeNull();
    expect(entry.opening_hand_feel).toBeNull();
    expect(entry.cards_in_hand).toEqual([]);
    expect(entry.tough_opponent_card).toBe('');
    expect(entry.notes).toBe('');
    expect(entry.mtga_rank).toBeNull();
  });

  it('passes all provided fields through to Firestore add()', async () => {
    mockGamesRef.add.mockResolvedValue({ id: 'x' });
    await addGame(DECK_ID, {
      result: 'win',
      turn_ended: 6,
      opponent_colors: ['R', 'G'],
      opponent_archetype: 'aggro',
      opening_hand_feel: 'good',
      cards_in_hand: ['Lightning Bolt'],
      tough_opponent_card: 'Counterspell',
      notes: 'close game',
      mtga_rank: 'Gold',
    });
    expect(mockGamesRef.add).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'win',
        turn_ended: 6,
        opponent_colors: ['R', 'G'],
        opponent_archetype: 'aggro',
        opening_hand_feel: 'good',
        cards_in_hand: ['Lightning Bolt'],
        tough_opponent_card: 'Counterspell',
        notes: 'close game',
        mtga_rank: 'Gold',
      }),
    );
  });

  it('stores the entry in Firestore via collection().add()', async () => {
    mockGamesRef.add.mockResolvedValue({ id: 'x' });
    await addGame(DECK_ID, { result: 'win', turn_ended: 6 });
    expect(mockGamesRef.add).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'win', turn_ended: 6 }),
    );
  });
});

// ── removeGame ────────────────────────────────────────────────────────────────

describe('removeGame(deckId, gameId)', () => {
  it('returns { deleted: true } on success', async () => {
    mockGameDocRef.get.mockResolvedValue({ exists: true });
    mockGameDocRef.delete.mockResolvedValue(undefined);
    expect(await removeGame(DECK_ID, 'g1')).toEqual({ deleted: true });
  });

  it('calls delete on the correct doc ref', async () => {
    mockGameDocRef.get.mockResolvedValue({ exists: true });
    mockGameDocRef.delete.mockResolvedValue(undefined);
    await removeGame(DECK_ID, 'g1');
    expect(mockGamesRef.doc).toHaveBeenCalledWith('g1');
    expect(mockGameDocRef.delete).toHaveBeenCalled();
  });

  it('throws when game does not exist', async () => {
    mockGameDocRef.get.mockResolvedValue({ exists: false });
    await expect(removeGame(DECK_ID, 'missing')).rejects.toThrow('Game not found: missing');
  });
});
