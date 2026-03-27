'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

let listDecks, getDeck, createDeck, updateDeck, deleteDeck;
let tempDir;
let decksDir;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtg-deck-test-'));
  decksDir = path.join(tempDir, 'decks');
  fs.mkdirSync(decksDir, { recursive: true });

  process.env.DATA_DIR = tempDir;

  jest.resetModules();
  ({ listDecks, getDeck, createDeck, updateDeck, deleteDeck } = require('./deckService'));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

// ── listDecks ─────────────────────────────────────────────────────────────────

describe('listDecks()', () => {
  it('returns an empty array when the decks directory is empty', () => {
    expect(listDecks()).toEqual([]);
  });

  it('does not crash when the decks directory does not exist yet', () => {
    fs.rmSync(decksDir, { recursive: true, force: true });
    expect(() => listDecks()).not.toThrow();
    expect(listDecks()).toEqual([]);
  });

  it('returns one metadata entry per deck file', () => {
    createDeck({ name: 'Alpha', format: 'Standard' });
    createDeck({ name: 'Beta', format: 'Modern' });
    expect(listDecks()).toHaveLength(2);
  });

  it('returns id, name, format, notes, card_count, and updated_at', () => {
    createDeck({ name: 'Test Deck', format: 'Legacy', notes: 'some notes' });
    const [meta] = listDecks();

    expect(meta).toHaveProperty('id');
    expect(meta).toHaveProperty('name', 'Test Deck');
    expect(meta).toHaveProperty('format', 'Legacy');
    expect(meta).toHaveProperty('card_count');
    expect(meta).toHaveProperty('notes', 'some notes');
    expect(meta).toHaveProperty('updated_at');
  });

  it('returns notes field with empty string when notes not set', () => {
    createDeck({ name: 'No Notes Deck' });
    const [meta] = listDecks();
    expect(meta).toHaveProperty('notes', '');
  });

  it('does NOT include the full cards array', () => {
    createDeck({
      name: 'No Cards Visible',
      cards: [{ quantity: 4, name: 'Bolt', scryfall_id: 'x', section: 'mainboard' }],
    });
    const [meta] = listDecks();
    expect(meta).not.toHaveProperty('cards');
    expect(meta).not.toHaveProperty('sideboard');
  });

  it('card_count sums quantities across mainboard and sideboard', () => {
    createDeck({
      name: 'Counted',
      format: 'Standard',
      cards: [
        { quantity: 4, name: 'Lightning Bolt', scryfall_id: 'a', section: 'mainboard' },
        { quantity: 2, name: 'Mountain', scryfall_id: 'b', section: 'mainboard' },
      ],
      sideboard: [
        { quantity: 3, name: 'Smash', scryfall_id: 'c', section: 'sideboard' },
      ],
    });
    const [meta] = listDecks();
    expect(meta.card_count).toBe(9);
  });

  it('card_count is 0 for a deck with no cards', () => {
    createDeck({ name: 'Empty', format: 'Standard' });
    const [meta] = listDecks();
    expect(meta.card_count).toBe(0);
  });

  it('reflects updated notes after updateDeck', () => {
    const deck = createDeck({ name: 'Notes Test', notes: 'original notes' });
    updateDeck(deck.id, { notes: 'updated notes' });

    const [meta] = listDecks();
    expect(meta.notes).toBe('updated notes');
  });

  it('reflects updated name after updateDeck', () => {
    const deck = createDeck({ name: 'Old Name', format: 'Standard' });
    updateDeck(deck.id, { name: 'New Name' });

    const [meta] = listDecks();
    expect(meta.name).toBe('New Name');
  });
});

// ── getDeck ───────────────────────────────────────────────────────────────────

describe('getDeck(id)', () => {
  it('returns the full deck object for a known id', () => {
    const created = createDeck({ name: 'Full Deck', format: 'Modern' });
    const fetched = getDeck(created.id);
    expect(fetched).toEqual(created);
  });

  it('includes the cards array in the returned object', () => {
    const created = createDeck({
      name: 'With Cards',
      cards: [{ quantity: 4, name: 'Bolt', scryfall_id: 'x', section: 'mainboard' }],
    });
    const fetched = getDeck(created.id);
    expect(fetched.cards).toHaveLength(1);
  });

  it('throws with a clear message when the id does not exist', () => {
    expect(() => getDeck('non-existent-id')).toThrow('Deck not found: non-existent-id');
  });
});

// ── createDeck ────────────────────────────────────────────────────────────────

describe('createDeck(data)', () => {
  it('returns a deck object with a uuid v4 id', () => {
    const deck = createDeck({ name: 'New Deck' });
    expect(deck.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('sets created_at as an ISO 8601 timestamp', () => {
    const before = new Date().toISOString();
    const deck = createDeck({ name: 'Timed' });
    const after = new Date().toISOString();
    expect(deck.created_at >= before).toBe(true);
    expect(deck.created_at <= after).toBe(true);
  });

  it('sets updated_at equal to created_at on creation', () => {
    const deck = createDeck({ name: 'Timestamps' });
    expect(deck.updated_at).toBe(deck.created_at);
  });

  it('persists the deck to disk as a JSON file', () => {
    const deck = createDeck({ name: 'Persisted' });
    const filePath = path.join(decksDir, `${deck.id}.json`);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('file on disk matches the returned deck object', () => {
    const deck = createDeck({ name: 'Verified' });
    const filePath = path.join(decksDir, `${deck.id}.json`);
    const fromDisk = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(fromDisk).toEqual(deck);
  });

  it('does not allow the caller to override the generated id', () => {
    const deck = createDeck({ name: 'Override Attempt', id: 'fixed-id' });
    expect(deck.id).not.toBe('fixed-id');
    expect(deck.id).toMatch(/^[0-9a-f]{8}-/i);
  });

  it('uses atomic write: no .tmp file remains after creation', () => {
    const deck = createDeck({ name: 'Atomic' });
    const tmpPath = path.join(decksDir, `${deck.id}.json.tmp`);
    expect(fs.existsSync(tmpPath)).toBe(false);
  });
});

// ── updateDeck ────────────────────────────────────────────────────────────────

describe('updateDeck(id, data)', () => {
  it('merges data into the existing deck', () => {
    const deck = createDeck({ name: 'Before', format: 'Standard', notes: '' });
    const updated = updateDeck(deck.id, { notes: 'Updated notes' });
    expect(updated.notes).toBe('Updated notes');
    expect(updated.name).toBe('Before');
  });

  it('updates the updated_at timestamp', () => {
    const deck = createDeck({ name: 'Timing' });
    const originalUpdatedAt = deck.updated_at;
    const updated = updateDeck(deck.id, { name: 'After' });
    expect(updated.updated_at >= originalUpdatedAt).toBe(true);
  });

  it('does not change created_at', () => {
    const deck = createDeck({ name: 'Stable' });
    const updated = updateDeck(deck.id, { created_at: '1970-01-01T00:00:00.000Z' });
    expect(updated.created_at).toBe(deck.created_at);
  });

  it('does not allow the caller to change the deck id', () => {
    const deck = createDeck({ name: 'Id Safe' });
    const updated = updateDeck(deck.id, { id: 'hijacked' });
    expect(updated.id).toBe(deck.id);
  });

  it('persists changes to disk', () => {
    const deck = createDeck({ name: 'Disk Persist' });
    updateDeck(deck.id, { name: 'Updated Name' });
    const fromDisk = JSON.parse(
      fs.readFileSync(path.join(decksDir, `${deck.id}.json`), 'utf8'),
    );
    expect(fromDisk.name).toBe('Updated Name');
  });

  it('persists notes changes to disk', () => {
    const deck = createDeck({ name: 'Notes Persist', notes: '' });
    updateDeck(deck.id, { notes: 'My strategy notes' });
    const fromDisk = JSON.parse(
      fs.readFileSync(path.join(decksDir, `${deck.id}.json`), 'utf8'),
    );
    expect(fromDisk.notes).toBe('My strategy notes');
  });

  it('uses atomic write: no .tmp file remains after update', () => {
    const deck = createDeck({ name: 'Atomic Update' });
    updateDeck(deck.id, { name: 'Post-Update' });
    const tmpPath = path.join(decksDir, `${deck.id}.json.tmp`);
    expect(fs.existsSync(tmpPath)).toBe(false);
  });

  it('throws with a clear message when the id does not exist', () => {
    expect(() => updateDeck('ghost-id', { name: 'Ghost' })).toThrow(
      'Deck not found: ghost-id',
    );
  });
});

// ── deleteDeck ────────────────────────────────────────────────────────────────

describe('deleteDeck(id)', () => {
  it('returns { deleted: true }', () => {
    const deck = createDeck({ name: 'To Delete' });
    expect(deleteDeck(deck.id)).toEqual({ deleted: true });
  });

  it('removes the deck file from disk', () => {
    const deck = createDeck({ name: 'Gone' });
    const filePath = path.join(decksDir, `${deck.id}.json`);
    deleteDeck(deck.id);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('throws with a clear message when the id does not exist', () => {
    expect(() => deleteDeck('missing-id')).toThrow('Deck not found: missing-id');
  });

  it('deleted deck is no longer returned by listDecks()', () => {
    const deck = createDeck({ name: 'Will Be Deleted' });
    deleteDeck(deck.id);
    expect(listDecks()).toHaveLength(0);
  });
});

// ── Atomic write (integration) ────────────────────────────────────────────────

describe('atomic write pattern', () => {
  it('final file is valid JSON after create', () => {
    const deck = createDeck({ name: 'Valid JSON' });
    const raw = fs.readFileSync(path.join(decksDir, `${deck.id}.json`), 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('final file is valid JSON after update', () => {
    const deck = createDeck({ name: 'Pre-update' });
    updateDeck(deck.id, { name: 'Post-update', tags: ['red', 'aggro'] });
    const raw = fs.readFileSync(path.join(decksDir, `${deck.id}.json`), 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});