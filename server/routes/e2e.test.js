'use strict';

/**
 * End-to-end integration tests.
 *
 * These tests use a real temporary data directory and do NOT mock deckService
 * or mtgaService. Every HTTP request goes through the full Express → route →
 * service → filesystem stack, verifying the actual write-then-read persistence
 * path that mocked-service tests cannot exercise.
 *
 * Isolation strategy:
 *   - A unique os.tmpdir() subdirectory is created before each test.
 *   - DATA_DIR is set to that directory before the app module is required.
 *   - jest.resetModules() ensures a fresh module graph (fresh deckService
 *     instance pointing at the temp dir) for every test.
 *   - The temp directory is removed after each test.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const request = require('supertest');

let app;
let tempDir;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtg-e2e-'));
  fs.mkdirSync(path.join(tempDir, 'decks'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'cache'), { recursive: true });

  process.env.DATA_DIR = tempDir;

  jest.resetModules();
  // Correct relative path: e2e.test.js lives in server/routes/, index.js in server/
  app = require('../index');
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

// ── PUT /api/decks/:id → GET /api/decks (notes persistence) ──────────────────

describe('E2E: PUT then GET reflects updated notes (real filesystem)', () => {
  it('persists notes to disk and surfaces them in the list endpoint', async () => {
    const createRes = await request(app)
      .post('/api/decks')
      .send({ name: 'Persistence Test', format: 'Standard' });

    expect(createRes.statusCode).toBe(201);
    const deckId = createRes.body.id;
    expect(createRes.body.notes).toBe('');

    const newNotes = 'Aggro strategy: curve out early, burn face.';
    const putRes = await request(app)
      .put(`/api/decks/${deckId}`)
      .send({ notes: newNotes });

    expect(putRes.statusCode).toBe(200);
    expect(putRes.body.notes).toBe(newNotes);

    // GET /api/decks reads from disk — no mock, so this validates atomicWrite flushed
    const listRes = await request(app).get('/api/decks');
    expect(listRes.statusCode).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].id).toBe(deckId);
    expect(listRes.body[0].notes).toBe(newNotes);
  });

  it('GET /api/decks/:id also returns the updated notes', async () => {
    const createRes = await request(app).post('/api/decks').send({ name: 'Full Get Test' });
    const deckId = createRes.body.id;
    const newNotes = 'Control strategy: counter everything.';

    await request(app).put(`/api/decks/${deckId}`).send({ notes: newNotes });

    const getRes = await request(app).get(`/api/decks/${deckId}`);
    expect(getRes.statusCode).toBe(200);
    expect(getRes.body.notes).toBe(newNotes);
  });

  it('multiple sequential updates each persist correctly', async () => {
    const createRes = await request(app).post('/api/decks').send({ name: 'Multi Update' });
    const deckId = createRes.body.id;

    await request(app).put(`/api/decks/${deckId}`).send({ notes: 'first' });
    await request(app).put(`/api/decks/${deckId}`).send({ notes: 'second' });
    await request(app).put(`/api/decks/${deckId}`).send({ notes: 'third' });

    const listRes = await request(app).get('/api/decks');
    expect(listRes.body[0].notes).toBe('third');
  });
});

// ── POST /api/import → GET /api/decks/:id (23-entry sample) ──────────────────
//
// The Task 2.01 sample deck contains 23 distinct card lines ("entries"),
// totalling 61 cards by quantity. The original requirement stated "24-card"
// in error; the acceptance criteria have been formally corrected to
// "23-entry" in TASKS.md.

describe('E2E: POST /api/import with 23-entry MTGA Arena sample (real filesystem)', () => {
  const SAMPLE_TEXT = [
    'Deck',
    '8 Mountain (FDN) 279',
    '2 Dawnwing Marshal (FDN) 570',
    '2 Resolute Reinforcements (FDN) 145',
    '2 Valorous Stance (FDN) 583',
    '3 Crusader of Odric (FDN) 569',
    '2 Dauntless Veteran (FDN) 8',
    '1 Aurelia, the Warleader (FDN) 651',
    '2 Boros Guildgate (FDN) 684',
    '2 Burst Lightning (FDN) 192',
    '9 Plains (FDN) 273',
    '4 Dragon Fodder (FDN) 535',
    '2 Krenko, Mob Boss (FDN) 204',
    '2 Frenzied Goblin (FDN) 199',
    '4 Wind-Scarred Crag (FDN) 271',
    '1 Temple of Triumph (FDN) 705',
    '1 Searslicer Goblin (FDN) 93',
    '3 Fanatical Firebrand (FDN) 195',
    '2 Serra Angel (FDN) 147',
    '2 Release the Dogs (FDN) 580',
    '2 Goblin Surprise (FDN) 200',
    '1 Great Train Heist (OTJ) 125',
    '2 Impact Tremors (FDN) 717',
    "2 Warleader's Call (MKM) 242",
  ].join('\n');

  it('imports without errors and returns 201', async () => {
    const res = await request(app)
      .post('/api/import')
      .send({ text: SAMPLE_TEXT, name: 'FDN Boros', format: 'Standard' });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('FDN Boros');
  });

  it('GET /api/decks/:id returns all 23 card entries after import', async () => {
    const importRes = await request(app)
      .post('/api/import')
      .send({ text: SAMPLE_TEXT, name: 'FDN Boros', format: 'Standard' });

    const getRes = await request(app).get(`/api/decks/${importRes.body.id}`);

    expect(getRes.statusCode).toBe(200);
    expect(getRes.body.cards).toHaveLength(23);
    expect(getRes.body.sideboard).toHaveLength(0);
  });

  it('card names have set/collector suffixes stripped', async () => {
    const importRes = await request(app)
      .post('/api/import')
      .send({ text: SAMPLE_TEXT, name: 'FDN Boros' });

    const getRes = await request(app).get(`/api/decks/${importRes.body.id}`);
    const names = getRes.body.cards.map((c) => c.name);

    expect(names).toContain('Mountain');
    expect(names).toContain('Aurelia, the Warleader');
    expect(names).toContain("Warleader's Call");
    expect(names).toContain('Great Train Heist');

    for (const name of names) {
      expect(name).not.toMatch(/\([A-Z0-9]+\)\s+[\w★]+/);
    }
  });

  it('total card quantity across all 23 entries is 61', async () => {
    const importRes = await request(app)
      .post('/api/import')
      .send({ text: SAMPLE_TEXT, name: 'FDN Boros' });

    const getRes = await request(app).get(`/api/decks/${importRes.body.id}`);
    const total = getRes.body.cards.reduce((sum, c) => sum + c.quantity, 0);
    expect(total).toBe(61);
  });

  it('imported deck appears in GET /api/decks list with correct card_count of 61', async () => {
    await request(app)
      .post('/api/import')
      .send({ text: SAMPLE_TEXT, name: 'FDN Boros', format: 'Standard' });

    const listRes = await request(app).get('/api/decks');
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].name).toBe('FDN Boros');
    expect(listRes.body[0].card_count).toBe(61);
  });

  it('all imported card names appear in the unknown[] array', async () => {
    const importRes = await request(app)
      .post('/api/import')
      .send({ text: SAMPLE_TEXT, name: 'FDN Boros' });

    const getRes = await request(app).get(`/api/decks/${importRes.body.id}`);
    const cardNames = getRes.body.cards.map((c) => c.name);

    for (const name of cardNames) {
      expect(getRes.body.unknown).toContain(name);
    }
  });
});

// ── Simple format import ──────────────────────────────────────────────────────

describe('E2E: POST /api/import with simple format (real filesystem)', () => {
  it('parses simple format and persists mainboard/sideboard correctly', async () => {
    const text = '4 Lightning Bolt\n2 Mountain\n\n2 Smash to Smithereens';

    const importRes = await request(app)
      .post('/api/import')
      .send({ text, name: 'Mono Red', format: 'Standard' });

    expect(importRes.statusCode).toBe(201);

    const getRes = await request(app).get(`/api/decks/${importRes.body.id}`);

    expect(getRes.statusCode).toBe(200);
    expect(getRes.body.cards).toHaveLength(2);
    expect(getRes.body.sideboard).toHaveLength(1);
    expect(getRes.body.cards[0]).toMatchObject({ quantity: 4, name: 'Lightning Bolt', section: 'mainboard' });
    expect(getRes.body.cards[1]).toMatchObject({ quantity: 2, name: 'Mountain', section: 'mainboard' });
    expect(getRes.body.sideboard[0]).toMatchObject({ quantity: 2, name: 'Smash to Smithereens', section: 'sideboard' });
  });
});