'use strict';

/**
 * Deck Service — file I/O operations for deck JSON files stored on disk.
 *
 * Each deck is persisted as `/data/decks/{uuid}.json`.
 * All writes use an atomic tmp-then-rename pattern to prevent corrupt files
 * on crash or power loss.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Resolve data directory the same way index.js does: DATA_DIR is treated as a
// path relative to the server root (one level above this file). If DATA_DIR is
// already absolute, path.resolve will use it as-is (last absolute segment wins).
const dataDir = path.resolve(__dirname, '..', process.env.DATA_DIR || '../data');
const DECKS_DIR = path.join(dataDir, 'decks');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the absolute file path for a deck id.
 * @param {string} id - UUID v4 deck identifier
 * @returns {string}
 */
function deckPath(id) {
  return path.join(DECKS_DIR, `${id}.json`);
}

/**
 * Atomically writes JSON data to a file.
 * Writes to `<filePath>.tmp` first, then renames to `<filePath>`.
 * This guarantees that a reader will never see a partially-written file.
 *
 * @param {string} filePath - Destination file path
 * @param {unknown} data - Value to serialise as JSON
 */
function atomicWrite(filePath, data) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Lists all decks in the decks directory.
 * Returns lightweight metadata only — full `cards` / `sideboard` arrays are
 * intentionally omitted to keep list responses small.
 *
 * The `notes` field IS included so the deck list can display or search on notes
 * without fetching each full deck file.
 *
 * @returns {Array<{id: string, name: string, format: string, notes: string, card_count: number, updated_at: string}>}
 */
function listDecks() {
  // Guard: directory may not exist on a truly fresh install before first boot.
  fs.mkdirSync(DECKS_DIR, { recursive: true });

  const files = fs.readdirSync(DECKS_DIR).filter((f) => f.endsWith('.json'));

  return files.map((file) => {
    const deck = JSON.parse(fs.readFileSync(path.join(DECKS_DIR, file), 'utf8'));

    const allCards = [...(deck.cards || []), ...(deck.sideboard || [])];
    const card_count = allCards.reduce((sum, c) => sum + (c.quantity || 0), 0);

    return {
      id: deck.id,
      name: deck.name,
      format: deck.format,
      notes: deck.notes || '',
      card_count,
      updated_at: deck.updated_at,
    };
  });
}

/**
 * Reads and returns the full deck JSON for the given id.
 *
 * @param {string} id - UUID v4 deck identifier
 * @returns {object} Full deck object
 * @throws {Error} When no deck file exists for the given id
 */
function getDeck(id) {
  const filePath = deckPath(id);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Deck not found: ${id}`);
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Creates a new deck, persists it to disk, and returns the created deck.
 * Generates a UUID v4 id and sets `created_at` / `updated_at` timestamps.
 * Caller-supplied `id`, `created_at`, or `updated_at` fields are ignored.
 *
 * @param {object} data - Initial deck data (name, format, cards, notes, etc.)
 * @returns {object} The newly created deck
 */
function createDeck(data) {
  const now = new Date().toISOString();

  const deck = {
    cards: [],
    sideboard: [],
    notes: '',
    tags: [],
    format: '',
    ...data,
    id: uuidv4(),
    created_at: now,
    updated_at: now,
  };

  fs.mkdirSync(DECKS_DIR, { recursive: true });
  atomicWrite(deckPath(deck.id), deck);

  return deck;
}

/**
 * Merges `data` into an existing deck, bumps `updated_at`, and writes the
 * result back to disk.
 *
 * The `id` and `created_at` fields on the existing deck are immutable — any
 * values supplied in `data` for those keys are silently discarded.
 *
 * @param {string} id   - UUID v4 deck identifier
 * @param {object} data - Fields to merge into the existing deck
 * @returns {object} The updated deck
 * @throws {Error} When no deck file exists for the given id
 */
function updateDeck(id, data) {
  const existing = getDeck(id); // throws with clear message if not found

  const updated = {
    ...existing,
    ...data,
    id: existing.id,
    created_at: existing.created_at,
    updated_at: new Date().toISOString(),
  };

  atomicWrite(deckPath(id), updated);

  return updated;
}

/**
 * Deletes the deck file for the given id.
 *
 * @param {string} id - UUID v4 deck identifier
 * @returns {{ deleted: true }}
 * @throws {Error} When no deck file exists for the given id
 */
function deleteDeck(id) {
  const filePath = deckPath(id);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Deck not found: ${id}`);
  }

  fs.unlinkSync(filePath);

  return { deleted: true };
}

module.exports = { listDecks, getDeck, createDeck, updateDeck, deleteDeck };