'use strict';

jest.mock('../middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { uid: 'test-uid', email: 'robbchar@gmail.com' };
    next();
  },
}));

const request = require('supertest');

jest.mock('../services/deckService');
jest.mock('../services/mtgaService');
jest.mock('../services/cardService');

const deckService = require('../services/deckService');
const mtgaService = require('../services/mtgaService');
const cardService = require('../services/cardService');
const app = require('../index');

const MOCK_DECK = {
  id: 'deck-uuid-001',
  name: 'Mono Red',
  format: 'Standard',
  cards: [
    { quantity: 4, name: 'Lightning Bolt', scryfall_id: 'abc', section: 'mainboard' },
  ],
  sideboard: [
    { quantity: 2, name: 'Smash to Smithereens', scryfall_id: 'def', section: 'sideboard' },
  ],
  notes: '',
  tags: [],
  unknown: [],
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const MTGA_TEXT = '4 Lightning Bolt\n\n2 Smash to Smithereens';

beforeEach(() => {
  jest.clearAllMocks();
  // Default: no Scryfall results — all cards remain unresolved (scryfall_id: null).
  cardService.searchCards.mockResolvedValue([]);
  cardService.getCardBySetCollector.mockResolvedValue(null);
});

// ── POST /api/decks/:id/export ─────────────────────────────────────────────────

describe('POST /api/decks/:id/export', () => {
  it('returns 200 with { text } for a valid deck', async () => {
    deckService.getDeck.mockReturnValue(MOCK_DECK);
    mtgaService.exportDeck.mockReturnValue(MTGA_TEXT);

    const res = await request(app).post('/api/decks/deck-uuid-001/export');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ text: MTGA_TEXT });
  });

  it('calls getDeck with the route param id', async () => {
    deckService.getDeck.mockReturnValue(MOCK_DECK);
    mtgaService.exportDeck.mockReturnValue(MTGA_TEXT);

    await request(app).post('/api/decks/deck-uuid-001/export');

    expect(deckService.getDeck).toHaveBeenCalledWith('deck-uuid-001');
  });

  it('calls exportDeck with the full deck object', async () => {
    deckService.getDeck.mockReturnValue(MOCK_DECK);
    mtgaService.exportDeck.mockReturnValue(MTGA_TEXT);

    await request(app).post('/api/decks/deck-uuid-001/export');

    expect(mtgaService.exportDeck).toHaveBeenCalledWith(MOCK_DECK);
  });

  it('returns 404 when deck does not exist', async () => {
    deckService.getDeck.mockImplementation(() => { throw new Error('Deck not found: missing-id'); });
    const res = await request(app).post('/api/decks/missing-id/export');
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on unexpected getDeck errors', async () => {
    deckService.getDeck.mockImplementation(() => { throw new Error('disk read failure'); });
    const res = await request(app).post('/api/decks/deck-uuid-001/export');
    expect(res.statusCode).toBe(500);
  });

  it('returns 500 when exportDeck throws', async () => {
    deckService.getDeck.mockReturnValue(MOCK_DECK);
    mtgaService.exportDeck.mockImplementation(() => { throw new Error('format error'); });
    const res = await request(app).post('/api/decks/deck-uuid-001/export');
    expect(res.statusCode).toBe(500);
  });
});

// ── POST /api/import ───────────────────────────────────────────────────────────

describe('POST /api/import', () => {
  const PARSED = {
    mainboard: [{ quantity: 4, name: 'Lightning Bolt' }],
    sideboard: [{ quantity: 2, name: 'Smash to Smithereens' }],
    unknown: [],
  };

  it('returns 201 with the created deck on success', async () => {
    mtgaService.parseMtgaText.mockReturnValue(PARSED);
    deckService.createDeck.mockReturnValue(MOCK_DECK);

    const res = await request(app)
      .post('/api/import')
      .send({ text: MTGA_TEXT, name: 'Mono Red', format: 'Standard' });

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(MOCK_DECK);
  });

  it('calls parseMtgaText with the raw text from the request body', async () => {
    mtgaService.parseMtgaText.mockReturnValue(PARSED);
    deckService.createDeck.mockReturnValue(MOCK_DECK);

    await request(app).post('/api/import').send({ text: MTGA_TEXT, name: 'Mono Red' });

    expect(mtgaService.parseMtgaText).toHaveBeenCalledWith(MTGA_TEXT);
  });

  it('passes trimmed name and format to createDeck', async () => {
    mtgaService.parseMtgaText.mockReturnValue(PARSED);
    deckService.createDeck.mockReturnValue(MOCK_DECK);

    await request(app)
      .post('/api/import')
      .send({ text: MTGA_TEXT, name: '  Mono Red  ', format: '  Standard  ' });

    expect(deckService.createDeck).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Mono Red', format: 'Standard' }),
    );
  });

  it('populates unknown[] with all imported card names', async () => {
    mtgaService.parseMtgaText.mockReturnValue(PARSED);
    deckService.createDeck.mockReturnValue(MOCK_DECK);

    await request(app).post('/api/import').send({ text: MTGA_TEXT, name: 'Mono Red' });

    expect(deckService.createDeck).toHaveBeenCalledWith(
      expect.objectContaining({
        unknown: expect.arrayContaining(['Lightning Bolt', 'Smash to Smithereens']),
      }),
    );
  });

  it('stores mainboard cards with section:"mainboard" and null scryfall_id', async () => {
    mtgaService.parseMtgaText.mockReturnValue(PARSED);
    deckService.createDeck.mockReturnValue(MOCK_DECK);

    await request(app).post('/api/import').send({ text: MTGA_TEXT, name: 'Mono Red' });

    const callArg = deckService.createDeck.mock.calls[0][0];
    expect(callArg.cards[0]).toEqual({
      quantity: 4,
      name: 'Lightning Bolt',
      scryfall_id: null,
      section: 'mainboard',
    });
  });

  it('stores sideboard cards with section:"sideboard" and null scryfall_id', async () => {
    mtgaService.parseMtgaText.mockReturnValue(PARSED);
    deckService.createDeck.mockReturnValue(MOCK_DECK);

    await request(app).post('/api/import').send({ text: MTGA_TEXT, name: 'Mono Red' });

    const callArg = deckService.createDeck.mock.calls[0][0];
    expect(callArg.sideboard[0]).toEqual({
      quantity: 2,
      name: 'Smash to Smithereens',
      scryfall_id: null,
      section: 'sideboard',
    });
  });

  it('returns 400 when text is missing', async () => {
    const res = await request(app).post('/api/import').send({ name: 'Mono Red' });
    expect(res.statusCode).toBe(400);
    expect(deckService.createDeck).not.toHaveBeenCalled();
  });

  it('returns 400 when text is an empty string', async () => {
    const res = await request(app).post('/api/import').send({ text: '', name: 'Mono Red' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when text is only whitespace', async () => {
    const res = await request(app).post('/api/import').send({ text: '   ', name: 'Mono Red' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/import').send({ text: MTGA_TEXT });
    expect(res.statusCode).toBe(400);
    expect(deckService.createDeck).not.toHaveBeenCalled();
  });

  it('returns 400 when name is only whitespace', async () => {
    const res = await request(app).post('/api/import').send({ text: MTGA_TEXT, name: '   ' });
    expect(res.statusCode).toBe(400);
  });

  it('unknown cards do not block the import', async () => {
    mtgaService.parseMtgaText.mockReturnValue({
      mainboard: [{ quantity: 4, name: 'Totally Fake Card' }],
      sideboard: [],
      unknown: [],
    });
    deckService.createDeck.mockReturnValue({ ...MOCK_DECK, unknown: ['Totally Fake Card'] });

    const res = await request(app)
      .post('/api/import')
      .send({ text: '4 Totally Fake Card', name: 'Test Deck' });

    expect(res.statusCode).toBe(201);
    expect(res.body.unknown).toContain('Totally Fake Card');
  });

  it('returns 500 when createDeck throws', async () => {
    mtgaService.parseMtgaText.mockReturnValue(PARSED);
    deckService.createDeck.mockImplementation(() => { throw new Error('write failure'); });

    const res = await request(app).post('/api/import').send({ text: MTGA_TEXT, name: 'Mono Red' });
    expect(res.statusCode).toBe(500);
  });

  it('cards that cannot be resolved still produce a 201 (non-fatal)', async () => {
    cardService.searchCards.mockRejectedValue(new Error('Scryfall unreachable'));
    mtgaService.parseMtgaText.mockReturnValue(PARSED);
    deckService.createDeck.mockReturnValue(MOCK_DECK);

    const res = await request(app).post('/api/import').send({ text: MTGA_TEXT, name: 'Mono Red' });
    expect(res.statusCode).toBe(201);
  });

  it('works without an optional format field', async () => {
    mtgaService.parseMtgaText.mockReturnValue(PARSED);
    deckService.createDeck.mockReturnValue(MOCK_DECK);

    await request(app).post('/api/import').send({ text: MTGA_TEXT, name: 'Mono Red' });

    expect(deckService.createDeck).toHaveBeenCalledWith(
      expect.objectContaining({ format: '' }),
    );
  });

  // ── 23-entry MTGA Arena sample (mocked service layer) ─────────────────────

  it('imports the 23-entry MTGA Arena sample and GET /api/decks/:id returns all 23 cards', async () => {
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

    const SAMPLE_MAINBOARD = [
      { quantity: 8, name: 'Mountain' },
      { quantity: 2, name: 'Dawnwing Marshal' },
      { quantity: 2, name: 'Resolute Reinforcements' },
      { quantity: 2, name: 'Valorous Stance' },
      { quantity: 3, name: 'Crusader of Odric' },
      { quantity: 2, name: 'Dauntless Veteran' },
      { quantity: 1, name: 'Aurelia, the Warleader' },
      { quantity: 2, name: 'Boros Guildgate' },
      { quantity: 2, name: 'Burst Lightning' },
      { quantity: 9, name: 'Plains' },
      { quantity: 4, name: 'Dragon Fodder' },
      { quantity: 2, name: 'Krenko, Mob Boss' },
      { quantity: 2, name: 'Frenzied Goblin' },
      { quantity: 4, name: 'Wind-Scarred Crag' },
      { quantity: 1, name: 'Temple of Triumph' },
      { quantity: 1, name: 'Searslicer Goblin' },
      { quantity: 3, name: 'Fanatical Firebrand' },
      { quantity: 2, name: 'Serra Angel' },
      { quantity: 2, name: 'Release the Dogs' },
      { quantity: 2, name: 'Goblin Surprise' },
      { quantity: 1, name: 'Great Train Heist' },
      { quantity: 2, name: 'Impact Tremors' },
      { quantity: 2, name: "Warleader's Call" },
    ];

    mtgaService.parseMtgaText.mockReturnValue({ mainboard: SAMPLE_MAINBOARD, sideboard: [], unknown: [] });

    const SAMPLE_DECK = {
      id: 'fdn-boros-001',
      name: 'FDN Boros',
      format: 'Standard',
      cards: SAMPLE_MAINBOARD.map((c) => ({ ...c, scryfall_id: null, section: 'mainboard' })),
      sideboard: [],
      notes: '',
      tags: [],
      unknown: SAMPLE_MAINBOARD.map((c) => c.name),
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    };

    deckService.createDeck.mockReturnValue(SAMPLE_DECK);
    deckService.getDeck.mockReturnValue(SAMPLE_DECK);

    // Step 1: POST /api/import
    const importRes = await request(app)
      .post('/api/import')
      .send({ text: SAMPLE_TEXT, name: 'FDN Boros', format: 'Standard' });

    expect(importRes.statusCode).toBe(201);
    expect(mtgaService.parseMtgaText).toHaveBeenCalledWith(SAMPLE_TEXT);

    const createArg = deckService.createDeck.mock.calls[0][0];
    expect(createArg.cards).toHaveLength(23);
    expect(createArg.sideboard).toHaveLength(0);

    // Step 2: GET /api/decks/:id
    const getRes = await request(app).get(`/api/decks/${importRes.body.id}`);
    expect(getRes.statusCode).toBe(200);
    expect(getRes.body.cards).toHaveLength(23);
    expect(getRes.body.sideboard).toHaveLength(0);

    const cardNames = getRes.body.cards.map((c) => c.name);
    expect(cardNames).toContain('Mountain');
    expect(cardNames).toContain('Aurelia, the Warleader');
    expect(cardNames).toContain("Warleader's Call");

    for (const n of cardNames) {
      expect(n).not.toMatch(/\([A-Z0-9]+\)\s+[\w★]+/);
    }
  });
});

// ── POST /api/import — Scryfall card resolution ───────────────────────────────

describe('POST /api/import — Scryfall resolution (mocked cardService)', () => {
  const SCRYFALL_CARD = {
    id: 'scryfall-abc',
    name: 'Lightning Bolt',
    mana_cost: '{R}',
    type_line: 'Instant',
    image_uris: { small: 'https://example.com/small.jpg', normal: 'https://example.com/normal.jpg' },
  };

  it('stores scryfall_id and image_uris when searchCards resolves the card', async () => {
    cardService.searchCards.mockResolvedValue([SCRYFALL_CARD]);
    mtgaService.parseMtgaText.mockReturnValue({
      mainboard: [{ quantity: 4, name: 'Lightning Bolt' }],
      sideboard: [],
      unknown: [],
    });
    deckService.createDeck.mockReturnValue(MOCK_DECK);

    await request(app).post('/api/import').send({ text: '4 Lightning Bolt', name: 'Mono Red' });

    const callArg = deckService.createDeck.mock.calls[0][0];
    expect(callArg.cards[0].scryfall_id).toBe('scryfall-abc');
    expect(callArg.cards[0].mana_cost).toBe('{R}');
    expect(callArg.cards[0].image_uris).toEqual({
      small: 'https://example.com/small.jpg',
      normal: 'https://example.com/normal.jpg',
    });
  });

  it('resolved cards are not placed in unknown[]', async () => {
    cardService.searchCards.mockResolvedValue([SCRYFALL_CARD]);
    mtgaService.parseMtgaText.mockReturnValue({
      mainboard: [{ quantity: 4, name: 'Lightning Bolt' }],
      sideboard: [],
      unknown: [],
    });
    deckService.createDeck.mockReturnValue(MOCK_DECK);

    await request(app).post('/api/import').send({ text: '4 Lightning Bolt', name: 'Mono Red' });

    const callArg = deckService.createDeck.mock.calls[0][0];
    expect(callArg.unknown).not.toContain('Lightning Bolt');
  });

  it('uses getCardBySetCollector when set_code and collector_number are present', async () => {
    const mountainCard = {
      id: 'mountain-anb-114',
      name: 'Mountain',
      mana_cost: '',
      type_line: 'Basic Land — Mountain',
      image_uris: { small: 'https://example.com/s.jpg', normal: 'https://example.com/n.jpg' },
    };
    cardService.getCardBySetCollector.mockResolvedValue(mountainCard);
    mtgaService.parseMtgaText.mockReturnValue({
      mainboard: [{ quantity: 9, name: 'Mountain', set_code: 'ANB', collector_number: '114' }],
      sideboard: [],
      unknown: [],
    });
    deckService.createDeck.mockReturnValue(MOCK_DECK);

    await request(app).post('/api/import').send({ text: '9 Mountain (ANB) 114', name: 'Lands' });

    expect(cardService.getCardBySetCollector).toHaveBeenCalledWith('ANB', '114');
    // Set+collector resolved successfully — no fallback to searchCards needed
    expect(cardService.searchCards).not.toHaveBeenCalled();
    const callArg = deckService.createDeck.mock.calls[0][0];
    expect(callArg.cards[0].scryfall_id).toBe('mountain-anb-114');
  });

  it('falls back to searchCards when getCardBySetCollector returns null', async () => {
    cardService.getCardBySetCollector.mockResolvedValue(null);
    cardService.searchCards.mockResolvedValue([SCRYFALL_CARD]);
    mtgaService.parseMtgaText.mockReturnValue({
      mainboard: [{ quantity: 4, name: 'Lightning Bolt', set_code: 'FDN', collector_number: '999' }],
      sideboard: [],
      unknown: [],
    });
    deckService.createDeck.mockReturnValue(MOCK_DECK);

    await request(app).post('/api/import').send({ text: '4 Lightning Bolt (FDN) 999', name: 'Test' });

    expect(cardService.getCardBySetCollector).toHaveBeenCalledWith('FDN', '999');
    expect(cardService.searchCards).toHaveBeenCalledWith('!"Lightning Bolt"');
    const callArg = deckService.createDeck.mock.calls[0][0];
    expect(callArg.cards[0].scryfall_id).toBe('scryfall-abc');
  });
});