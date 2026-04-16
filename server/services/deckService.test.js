'use strict';

// ── Firestore mock ────────────────────────────────────────────────────────────
// db.collection(COLLECTION).where('userId','==',uid).get() → listDecks
// db.collection(COLLECTION).doc(id).get()                  → getDeck / updateDeck / deleteDeck
// db.collection(COLLECTION).add(data)                      → createDeck

const mockCollRef = {
  get: jest.fn(),
  doc: jest.fn(),
  add: jest.fn(),
  where: jest.fn(),
};
const mockDocRef = {
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};
mockCollRef.doc.mockReturnValue(mockDocRef);
mockCollRef.where.mockReturnValue(mockCollRef);

jest.mock('./db', () => ({
  db: { collection: jest.fn(() => mockCollRef) },
}));

const { listDecks, getDeck, createDeck, updateDeck, deleteDeck } = require('./deckService');

const UID = 'user-abc';

beforeEach(() => {
  jest.clearAllMocks();
  mockCollRef.doc.mockReturnValue(mockDocRef);
  mockCollRef.where.mockReturnValue(mockCollRef);
});

// ── listDecks ─────────────────────────────────────────────────────────────────

describe('listDecks(userId)', () => {
  it('returns an empty array when no decks exist', async () => {
    mockCollRef.get.mockResolvedValue({ docs: [] });
    expect(await listDecks(UID)).toEqual([]);
  });

  it('queries by userId', async () => {
    mockCollRef.get.mockResolvedValue({ docs: [] });
    await listDecks(UID);
    expect(mockCollRef.where).toHaveBeenCalledWith('userId', '==', UID);
  });

  it('returns metadata for each deck document', async () => {
    mockCollRef.get.mockResolvedValue({
      docs: [
        {
          id: 'deck-1',
          data: () => ({
            name: 'Mono Red',
            format: 'Standard',
            notes: 'aggro',
            cards: [{ quantity: 4 }, { quantity: 4 }],
            sideboard: [{ quantity: 3 }],
            updated_at: '2024-01-01T00:00:00.000Z',
          }),
        },
      ],
    });
    const result = await listDecks(UID);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'deck-1',
      name: 'Mono Red',
      format: 'Standard',
      notes: 'aggro',
      card_count: 11,
      updated_at: '2024-01-01T00:00:00.000Z',
    });
    expect(result[0]).not.toHaveProperty('cards');
  });

  it('card_count is 0 for a deck with no cards', async () => {
    mockCollRef.get.mockResolvedValue({
      docs: [{ id: 'd', data: () => ({ name: 'Empty', format: '', notes: '', cards: [], sideboard: [], updated_at: '' }) }],
    });
    const [meta] = await listDecks(UID);
    expect(meta.card_count).toBe(0);
  });
});

// ── getDeck ───────────────────────────────────────────────────────────────────

describe('getDeck(id)', () => {
  it('returns the full deck object', async () => {
    const deckData = { name: 'Mono Red', format: 'Standard', cards: [], sideboard: [], notes: '', tags: [], userId: UID };
    mockDocRef.get.mockResolvedValue({ exists: true, id: 'deck-1', data: () => deckData });
    const result = await getDeck('deck-1');
    expect(result).toEqual({ id: 'deck-1', ...deckData });
  });

  it('throws when deck does not exist', async () => {
    mockDocRef.get.mockResolvedValue({ exists: false });
    await expect(getDeck('missing')).rejects.toThrow('Deck not found: missing');
  });
});

// ── createDeck ────────────────────────────────────────────────────────────────

describe('createDeck(data)', () => {
  it('returns a deck with a generated id', async () => {
    mockCollRef.add.mockResolvedValue({ id: 'new-uuid' });
    const deck = await createDeck({ name: 'New Deck', userId: UID });
    expect(deck.id).toBe('new-uuid');
    expect(deck.name).toBe('New Deck');
  });

  it('stores the userId on the deck', async () => {
    mockCollRef.add.mockResolvedValue({ id: 'x' });
    const deck = await createDeck({ name: 'Owned', userId: UID });
    expect(deck.userId).toBe(UID);
    expect(mockCollRef.add).toHaveBeenCalledWith(expect.objectContaining({ userId: UID }));
  });

  it('sets created_at and updated_at to ISO timestamps', async () => {
    mockCollRef.add.mockResolvedValue({ id: 'x' });
    const before = new Date().toISOString();
    const deck = await createDeck({ name: 'Timed', userId: UID });
    const after = new Date().toISOString();
    expect(deck.created_at >= before).toBe(true);
    expect(deck.created_at <= after).toBe(true);
    expect(deck.updated_at).toBe(deck.created_at);
  });

  it('calls collection().add() with the deck data', async () => {
    mockCollRef.add.mockResolvedValue({ id: 'x' });
    await createDeck({ name: 'Stored', userId: UID });
    expect(mockCollRef.add).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Stored' }),
    );
  });

  it('does not allow the caller to override the generated id', async () => {
    mockCollRef.add.mockResolvedValue({ id: 'generated' });
    const deck = await createDeck({ name: 'Test', id: 'fixed-id', userId: UID });
    expect(deck.id).toBe('generated');
    expect(mockCollRef.add).toHaveBeenCalledWith(
      expect.not.objectContaining({ id: expect.anything() }),
    );
  });
});

// ── updateDeck ────────────────────────────────────────────────────────────────

describe('updateDeck(id, data)', () => {
  const existing = { name: 'Before', format: 'Standard', notes: '', created_at: '2024-01-01T00:00:00.000Z', tags: [], cards: [], sideboard: [], userId: UID };

  it('returns merged deck with new updated_at', async () => {
    mockDocRef.get.mockResolvedValue({ exists: true, id: 'deck-1', data: () => existing });
    mockDocRef.update.mockResolvedValue(undefined);
    const result = await updateDeck('deck-1', { notes: 'Updated notes' });
    expect(result.notes).toBe('Updated notes');
    expect(result.name).toBe('Before');
    expect(result.updated_at > existing.created_at).toBe(true);
  });

  it('does not change created_at', async () => {
    mockDocRef.get.mockResolvedValue({ exists: true, id: 'deck-1', data: () => existing });
    mockDocRef.update.mockResolvedValue(undefined);
    const result = await updateDeck('deck-1', { created_at: '1970-01-01T00:00:00.000Z' });
    expect(result.created_at).toBe(existing.created_at);
  });

  it('throws when deck does not exist', async () => {
    mockDocRef.get.mockResolvedValue({ exists: false });
    await expect(updateDeck('ghost', {})).rejects.toThrow('Deck not found: ghost');
  });

  it('calls docRef.update() with merged data excluding id', async () => {
    mockDocRef.get.mockResolvedValue({ exists: true, id: 'deck-1', data: () => existing });
    mockDocRef.update.mockResolvedValue(undefined);
    await updateDeck('deck-1', { notes: 'x' });
    expect(mockDocRef.update).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'x', name: 'Before' }),
    );
    expect(mockDocRef.update).toHaveBeenCalledWith(
      expect.not.objectContaining({ id: expect.anything() }),
    );
  });

  it('does not allow the caller to change the deck id', async () => {
    mockDocRef.get.mockResolvedValue({ exists: true, id: 'deck-1', data: () => existing });
    mockDocRef.update.mockResolvedValue(undefined);
    const result = await updateDeck('deck-1', { id: 'hijacked' });
    expect(result.id).toBe('deck-1');
    expect(mockDocRef.update).toHaveBeenCalledWith(
      expect.not.objectContaining({ id: expect.anything() }),
    );
  });
});

// ── deleteDeck ────────────────────────────────────────────────────────────────

describe('deleteDeck(id)', () => {
  it('returns { deleted: true } and calls delete()', async () => {
    mockDocRef.get.mockResolvedValue({ exists: true, id: 'deck-1', data: () => ({}) });
    mockDocRef.delete.mockResolvedValue(undefined);
    expect(await deleteDeck('deck-1')).toEqual({ deleted: true });
    expect(mockDocRef.delete).toHaveBeenCalledTimes(1);
  });

  it('throws when deck does not exist', async () => {
    mockDocRef.get.mockResolvedValue({ exists: false });
    await expect(deleteDeck('missing')).rejects.toThrow('Deck not found: missing');
  });
});
