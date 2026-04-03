'use strict';

/**
 * Game Service — file I/O for per-deck game log JSON files.
 *
 * Each deck's game log is stored at `/data/games/{deck-id}.json`.
 * All writes use the same atomic tmp-then-rename pattern as deckService.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dataDir = path.resolve(__dirname, '..', process.env.DATA_DIR || '../data');
const GAMES_DIR = path.join(dataDir, 'games');

// ── Helpers ───────────────────────────────────────────────────────────────────

function gamesPath(deckId) {
  return path.join(GAMES_DIR, `${deckId}.json`);
}

function atomicWrite(filePath, data) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

/**
 * Reads the game log file for a deck. Returns the parsed object, or null if
 * the file does not exist yet.
 *
 * @param {string} deckId
 * @returns {{ deck_id: string, games: object[] } | null}
 */
function readLog(deckId) {
  const filePath = gamesPath(deckId);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns all logged games for a deck, newest first.
 * Returns an empty array if no game log exists yet.
 *
 * @param {string} deckId
 * @returns {object[]}
 */
function getGames(deckId) {
  const log = readLog(deckId);
  if (!log) return [];
  return [...log.games].reverse();
}

/**
 * Appends a new game entry to the deck's game log.
 * Creates the log file if it does not exist.
 * Enforces that `result` is present; all other fields are optional.
 *
 * @param {string} deckId
 * @param {object} gameData - Fields for the new game entry
 * @returns {object} The newly created game entry
 * @throws {Error} When `result` is missing or invalid
 */
function addGame(deckId, gameData) {
  if (!gameData.result || !['win', 'loss'].includes(gameData.result)) {
    throw new Error('result is required and must be "win" or "loss"');
  }

  fs.mkdirSync(GAMES_DIR, { recursive: true });

  const existing = readLog(deckId);
  const log = existing ?? { deck_id: deckId, games: [] };

  const entry = {
    id: uuidv4(),
    logged_at: new Date().toISOString(),
    result: gameData.result,
    turn_ended: gameData.turn_ended ?? null,
    opponent_colors: gameData.opponent_colors ?? [],
    opponent_archetype: gameData.opponent_archetype ?? null,
    opening_hand_feel: gameData.opening_hand_feel ?? null,
    cards_in_hand: gameData.cards_in_hand ?? [],
    tough_opponent_card: gameData.tough_opponent_card ?? '',
    notes: gameData.notes ?? '',
  };

  log.games.push(entry);
  atomicWrite(gamesPath(deckId), log);

  return entry;
}

/**
 * Removes a single game entry by id from the deck's game log.
 *
 * @param {string} deckId
 * @param {string} gameId
 * @returns {{ deleted: true }}
 * @throws {Error} When the log file or the game entry does not exist
 */
function removeGame(deckId, gameId) {
  const log = readLog(deckId);

  if (!log) throw new Error(`Game log not found for deck: ${deckId}`);

  const index = log.games.findIndex((g) => g.id === gameId);
  if (index === -1) throw new Error(`Game not found: ${gameId}`);

  log.games.splice(index, 1);
  atomicWrite(gamesPath(deckId), log);

  return { deleted: true };
}

module.exports = { getGames, addGame, removeGame };
