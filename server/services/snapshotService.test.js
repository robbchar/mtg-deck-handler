'use strict';

// ── Firestore mock ────────────────────────────────────────────────────────────
// Chain: db.collection('mtg-deck-handler').doc(deckId).collection('snapshots')
// snapshotsRef.orderBy('createdAt','desc').get()  → listSnapshots
// snapshotsRef.add(entry)                         → createSnapshot
// snapshotsRef.doc(snapshotId).get()              → revertToSnapshot (read)
// deckService.updateDeck(deckId, data)            → revertToSnapshot (write)

const mockSnapshotDocRef = { get: jest.fn() };
const mockOrderByRef = { get: jest.fn() };
const mockSnapshotsRef = {
  orderBy: jest.fn(() => mockOrderByRef),
  add: jest.fn(),
  doc: jest.fn(() => mockSnapshotDocRef),
};
const mockDeckDocRef = { collection: jest.fn(() => mockSnapshotsRef) };
const mockDeckCollRef = { doc: jest.fn(() => mockDeckDocRef) };

jest.mock('./db', () => ({
  db: { collection: jest.fn(() => mockDeckCollRef) },
}));

jest.mock('./deckService', () => ({
  updateDeck: jest.fn(),
}));

const { updateDeck } = require('./deckService');
const { listSnapshots, createSnapshot, revertToSnapshot } = require('./snapshotService');

const DECK_ID = 'deck-abc';
const SNAP_ID = 'snap-xyz';

beforeEach(() => {
  jest.clearAllMocks();
  mockDeckCollRef.doc.mockReturnValue(mockDeckDocRef);
  mockDeckDocRef.collection.mockReturnValue(mockSnapshotsRef);
  mockSnapshotsRef.orderBy.mockReturnValue(mockOrderByRef);
  mockSnapshotsRef.doc.mockReturnValue(mockSnapshotDocRef);
});

// ── listSnapshots ─────────────────────────────────────────────────────────────

describe('listSnapshots(deckId)', () => {
  it('returns an empty array when no snapshots exist', async () => {
    mockOrderByRef.get.mockResolvedValue({ docs: [] });
    expect(await listSnapshots(DECK_ID)).toEqual([]);
  });

  it('orders by createdAt descending', async () => {
    mockOrderByRef.get.mockResolvedValue({ docs: [] });
    await listSnapshots(DECK_ID);
    expect(mockSnapshotsRef.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
  });

  it('returns snapshots with id merged from doc.id', async () => {
    const data = { createdAt: '2026-04-16T10:00:00.000Z', cards: [], sideboard: [], format: 'Standard', notes: '' };
    mockOrderByRef.get.mockResolvedValue({
      docs: [{ id: SNAP_ID, data: () => data }],
    });
    const result = await listSnapshots(DECK_ID);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: SNAP_ID, ...data });
  });

  it('targets the correct Firestore path', async () => {
    const { db } = require('./db');
    mockOrderByRef.get.mockResolvedValue({ docs: [] });
    await listSnapshots(DECK_ID);
    expect(db.collection).toHaveBeenCalledWith('mtg-deck-handler');
    expect(mockDeckCollRef.doc).toHaveBeenCalledWith(DECK_ID);
    expect(mockDeckDocRef.collection).toHaveBeenCalledWith('snapshots');
  });
});

// ── createSnapshot ────────────────────────────────────────────────────────────

describe('createSnapshot(deckId, data)', () => {
  it('returns the new snapshot with a generated id', async () => {
    mockSnapshotsRef.add.mockResolvedValue({ id: 'new-snap' });
    const snap = await createSnapshot(DECK_ID, { cards: [], sideboard: [], format: 'Modern', notes: '' });
    expect(snap.id).toBe('new-snap');
    expect(snap.format).toBe('Modern');
  });

  it('sets createdAt to an ISO timestamp', async () => {
    mockSnapshotsRef.add.mockResolvedValue({ id: 'x' });
    const before = new Date().toISOString();
    const snap = await createSnapshot(DECK_ID, { cards: [], sideboard: [], format: '', notes: '' });
    const after = new Date().toISOString();
    expect(snap.createdAt >= before).toBe(true);
    expect(snap.createdAt <= after).toBe(true);
  });

  it('defaults cards and sideboard to empty arrays when omitted', async () => {
    mockSnapshotsRef.add.mockResolvedValue({ id: 'x' });
    const snap = await createSnapshot(DECK_ID, { format: 'Standard', notes: '' });
    expect(snap.cards).toEqual([]);
    expect(snap.sideboard).toEqual([]);
  });

  it('stores the snapshot via collection().add()', async () => {
    mockSnapshotsRef.add.mockResolvedValue({ id: 'x' });
    const cards = [{ name: 'Lightning Bolt', quantity: 4, scryfall_id: null, section: 'mainboard' }];
    await createSnapshot(DECK_ID, { cards, sideboard: [], format: 'Modern', notes: 'test' });
    expect(mockSnapshotsRef.add).toHaveBeenCalledWith(
      expect.objectContaining({ cards, format: 'Modern', notes: 'test' }),
    );
  });
});

// ── revertToSnapshot ──────────────────────────────────────────────────────────

describe('revertToSnapshot(deckId, snapshotId)', () => {
  const snapData = {
    createdAt: '2026-04-15T10:00:00.000Z',
    cards: [{ name: 'Bolt', quantity: 4, scryfall_id: null, section: 'mainboard' }],
    sideboard: [],
    format: 'Modern',
    notes: 'original',
  };

  it('calls updateDeck with the snapshot fields', async () => {
    mockSnapshotDocRef.get.mockResolvedValue({ exists: true, data: () => snapData });
    updateDeck.mockResolvedValue({ id: DECK_ID, ...snapData });
    await revertToSnapshot(DECK_ID, SNAP_ID);
    expect(updateDeck).toHaveBeenCalledWith(DECK_ID, {
      cards: snapData.cards,
      sideboard: snapData.sideboard,
      format: snapData.format,
      notes: snapData.notes,
    });
  });

  it('returns the result of updateDeck', async () => {
    const updatedDeck = { id: DECK_ID, name: 'Test', ...snapData };
    mockSnapshotDocRef.get.mockResolvedValue({ exists: true, data: () => snapData });
    updateDeck.mockResolvedValue(updatedDeck);
    const result = await revertToSnapshot(DECK_ID, SNAP_ID);
    expect(result).toEqual(updatedDeck);
  });

  it('throws when the snapshot does not exist', async () => {
    mockSnapshotDocRef.get.mockResolvedValue({ exists: false });
    await expect(revertToSnapshot(DECK_ID, 'missing')).rejects.toThrow('Snapshot not found: missing');
  });

  it('reads from the correct snapshot document path', async () => {
    mockSnapshotDocRef.get.mockResolvedValue({ exists: true, data: () => snapData });
    updateDeck.mockResolvedValue({});
    await revertToSnapshot(DECK_ID, SNAP_ID);
    expect(mockSnapshotsRef.doc).toHaveBeenCalledWith(SNAP_ID);
  });
});
