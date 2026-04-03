'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

let getGames, addGame, removeGame;
let tempDir;
let gamesDir;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtg-games-test-'));
  gamesDir = path.join(tempDir, 'games');
  fs.mkdirSync(gamesDir, { recursive: true });

  process.env.DATA_DIR = tempDir;

  jest.resetModules();
  ({ getGames, addGame, removeGame } = require('./gameService'));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

const DECK_ID = 'test-deck-uuid';

// ── getGames ──────────────────────────────────────────────────────────────────

describe('getGames(deckId)', () => {
  it('returns an empty array when no log file exists', () => {
    expect(getGames(DECK_ID)).toEqual([]);
  });

  it('returns games in reverse chronological order (newest first)', () => {
    addGame(DECK_ID, { result: 'win' });
    addGame(DECK_ID, { result: 'loss' });
    addGame(DECK_ID, { result: 'win' });

    const games = getGames(DECK_ID);
    expect(games).toHaveLength(3);
    // Newest (last added) should be first
    expect(games[0].result).toBe('win');
    expect(games[2].result).toBe('win');
  });

  it('does not mutate the underlying stored order', () => {
    addGame(DECK_ID, { result: 'win' });
    addGame(DECK_ID, { result: 'loss' });

    getGames(DECK_ID); // call once to trigger reverse
    const logFile = JSON.parse(
      fs.readFileSync(path.join(gamesDir, `${DECK_ID}.json`), 'utf8'),
    );
    // File should still be in insertion order
    expect(logFile.games[0].result).toBe('win');
    expect(logFile.games[1].result).toBe('loss');
  });
});

// ── addGame ───────────────────────────────────────────────────────────────────

describe('addGame(deckId, gameData)', () => {
  it('throws when result is missing', () => {
    expect(() => addGame(DECK_ID, {})).toThrow('result is required');
  });

  it('throws when result is not "win" or "loss"', () => {
    expect(() => addGame(DECK_ID, { result: 'draw' })).toThrow('result is required');
  });

  it('returns a game entry with a uuid id and logged_at timestamp', () => {
    const entry = addGame(DECK_ID, { result: 'win' });

    expect(entry.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(entry.logged_at).toBeTruthy();
    expect(new Date(entry.logged_at).toString()).not.toBe('Invalid Date');
  });

  it('creates the games directory if it does not exist', () => {
    fs.rmSync(gamesDir, { recursive: true, force: true });
    expect(() => addGame(DECK_ID, { result: 'win' })).not.toThrow();
    expect(fs.existsSync(gamesDir)).toBe(true);
  });

  it('creates the log file on first write', () => {
    addGame(DECK_ID, { result: 'win' });
    expect(fs.existsSync(path.join(gamesDir, `${DECK_ID}.json`))).toBe(true);
  });

  it('sets default values for all optional fields', () => {
    const entry = addGame(DECK_ID, { result: 'loss' });

    expect(entry.turn_ended).toBeNull();
    expect(entry.opponent_colors).toEqual([]);
    expect(entry.opponent_archetype).toBeNull();
    expect(entry.opening_hand_feel).toBeNull();
    expect(entry.cards_in_hand).toEqual([]);
    expect(entry.tough_opponent_card).toBe('');
    expect(entry.notes).toBe('');
  });

  it('persists all provided optional fields', () => {
    const entry = addGame(DECK_ID, {
      result: 'win',
      turn_ended: 6,
      opponent_colors: ['R', 'G'],
      opponent_archetype: 'aggro',
      opening_hand_feel: 'good',
      cards_in_hand: ['Impact Tremors', 'Warleader\'s Call'],
      tough_opponent_card: 'Embercleave',
      notes: 'close game',
    });

    expect(entry.turn_ended).toBe(6);
    expect(entry.opponent_colors).toEqual(['R', 'G']);
    expect(entry.opponent_archetype).toBe('aggro');
    expect(entry.opening_hand_feel).toBe('good');
    expect(entry.cards_in_hand).toEqual(['Impact Tremors', 'Warleader\'s Call']);
    expect(entry.tough_opponent_card).toBe('Embercleave');
    expect(entry.notes).toBe('close game');
  });

  it('appends entries without overwriting previous games', () => {
    addGame(DECK_ID, { result: 'win' });
    addGame(DECK_ID, { result: 'loss' });
    addGame(DECK_ID, { result: 'win' });

    const logFile = JSON.parse(
      fs.readFileSync(path.join(gamesDir, `${DECK_ID}.json`), 'utf8'),
    );
    expect(logFile.games).toHaveLength(3);
  });

  it('log file includes deck_id at root', () => {
    addGame(DECK_ID, { result: 'win' });
    const logFile = JSON.parse(
      fs.readFileSync(path.join(gamesDir, `${DECK_ID}.json`), 'utf8'),
    );
    expect(logFile.deck_id).toBe(DECK_ID);
  });

  it('uses atomic write: no .tmp file remains after write', () => {
    addGame(DECK_ID, { result: 'win' });
    expect(fs.existsSync(path.join(gamesDir, `${DECK_ID}.json.tmp`))).toBe(false);
  });

  it('log file is valid JSON after multiple writes', () => {
    addGame(DECK_ID, { result: 'win' });
    addGame(DECK_ID, { result: 'loss', turn_ended: 8 });
    const raw = fs.readFileSync(path.join(gamesDir, `${DECK_ID}.json`), 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('does not mix game logs across different deck ids', () => {
    addGame('deck-a', { result: 'win' });
    addGame('deck-b', { result: 'loss' });

    expect(getGames('deck-a')).toHaveLength(1);
    expect(getGames('deck-b')).toHaveLength(1);
    expect(getGames('deck-a')[0].result).toBe('win');
    expect(getGames('deck-b')[0].result).toBe('loss');
  });
});

// ── removeGame ────────────────────────────────────────────────────────────────

describe('removeGame(deckId, gameId)', () => {
  it('returns { deleted: true }', () => {
    const entry = addGame(DECK_ID, { result: 'win' });
    expect(removeGame(DECK_ID, entry.id)).toEqual({ deleted: true });
  });

  it('removes the entry from the log', () => {
    const entry = addGame(DECK_ID, { result: 'win' });
    removeGame(DECK_ID, entry.id);
    expect(getGames(DECK_ID)).toHaveLength(0);
  });

  it('removes only the targeted entry when multiple games exist', () => {
    const a = addGame(DECK_ID, { result: 'win' });
    const b = addGame(DECK_ID, { result: 'loss' });
    removeGame(DECK_ID, a.id);
    const remaining = getGames(DECK_ID);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(b.id);
  });

  it('throws when no game log exists for the deck', () => {
    expect(() => removeGame(DECK_ID, 'any-id')).toThrow('Game log not found');
  });

  it('throws when the game id does not exist in the log', () => {
    addGame(DECK_ID, { result: 'win' });
    expect(() => removeGame(DECK_ID, 'nonexistent-id')).toThrow('Game not found');
  });

  it('persists the deletion to disk', () => {
    const entry = addGame(DECK_ID, { result: 'win' });
    removeGame(DECK_ID, entry.id);
    const logFile = JSON.parse(
      fs.readFileSync(path.join(gamesDir, `${DECK_ID}.json`), 'utf8'),
    );
    expect(logFile.games).toHaveLength(0);
  });

  it('uses atomic write: no .tmp file remains after deletion', () => {
    const entry = addGame(DECK_ID, { result: 'win' });
    removeGame(DECK_ID, entry.id);
    expect(fs.existsSync(path.join(gamesDir, `${DECK_ID}.json.tmp`))).toBe(false);
  });
});
