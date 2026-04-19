'use strict';

const { db } = require('./db');
const { updateDeck } = require('./deckService');

const DECK_COLLECTION = 'mtg-deck-handler';
const SNAPSHOTS_SUBCOLLECTION = 'snapshots';

function snapshotsRef(deckId) {
  return db.collection(DECK_COLLECTION).doc(deckId).collection(SNAPSHOTS_SUBCOLLECTION);
}

/**
 * Returns all snapshots for a deck, ordered newest first.
 * @param {string} deckId
 * @returns {Promise<object[]>}
 */
async function listSnapshots(deckId) {
  const snapshot = await snapshotsRef(deckId).orderBy('createdAt', 'desc').get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * Creates a snapshot of the current deck state.
 * @param {string} deckId
 * @param {{ cards?, sideboard?, format?, notes? }} data
 * @returns {Promise<object>}
 */
async function createSnapshot(deckId, data) {
  const entry = {
    createdAt: new Date().toISOString(),
    cards: data.cards ?? [],
    sideboard: data.sideboard ?? [],
    format: data.format ?? '',
    notes: data.notes ?? '',
  };
  const docRef = await snapshotsRef(deckId).add(entry);
  await updateDeck(deckId, { activeSnapshotId: docRef.id });
  return { id: docRef.id, ...entry };
}

/**
 * Reverts a deck to the state captured in the given snapshot.
 * @param {string} deckId
 * @param {string} snapshotId
 * @returns {Promise<object>} the updated deck
 */
async function revertToSnapshot(deckId, snapshotId) {
  const snapDoc = await snapshotsRef(deckId).doc(snapshotId).get();
  if (!snapDoc.exists) throw new Error(`Snapshot not found: ${snapshotId}`);
  const { cards, sideboard, format, notes } = snapDoc.data();
  return updateDeck(deckId, { cards, sideboard, format, notes, activeSnapshotId: snapshotId });
}

/**
 * Deletes all snapshots for a deck that were created after the given pivot snapshot.
 * Used to prune "future" history when the user makes new edits after a restore.
 * @param {string} deckId
 * @param {string} snapshotId - the pivot; snapshots strictly newer than this are deleted
 * @returns {Promise<{ deleted: number }>}
 */
async function deleteSnapshotsAfter(deckId, snapshotId) {
  const ref = snapshotsRef(deckId);
  const pivotDoc = await ref.doc(snapshotId).get();
  if (!pivotDoc.exists) throw new Error(`Snapshot not found: ${snapshotId}`);
  const { createdAt } = pivotDoc.data();

  const querySnap = await ref.where('createdAt', '>', createdAt).get();
  if (querySnap.docs.length === 0) return { deleted: 0 };

  const batch = db.batch();
  querySnap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return { deleted: querySnap.docs.length };
}

module.exports = { listSnapshots, createSnapshot, revertToSnapshot, deleteSnapshotsAfter };
