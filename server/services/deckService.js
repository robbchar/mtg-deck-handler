'use strict';

const { db } = require('./db');

const COLLECTION = 'mtg-deck-handler';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Lists decks belonging to the given user (metadata only — no cards array).
 * @param {string} userId
 * @returns {Promise<Array>}
 */
async function listDecks(userId) {
  const snapshot = await db.collection(COLLECTION).where('userId', '==', userId).get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    const allCards = [...(data.cards || []), ...(data.sideboard || [])];
    const card_count = allCards.reduce((sum, c) => sum + (c.quantity || 0), 0);
    return {
      id: doc.id,
      name: data.name,
      format: data.format,
      notes: data.notes || '',
      card_count,
      updated_at: data.updated_at,
    };
  });
}

/**
 * Returns the full deck document for the given id.
 * @param {string} id
 * @returns {Promise<object>}
 */
async function getDeck(id) {
  const snap = await db.collection(COLLECTION).doc(id).get();
  if (!snap.exists) throw new Error(`Deck not found: ${id}`);
  return { id: snap.id, ...snap.data() };
}

/**
 * Creates a new deck and returns it. Caller must include userId in data.
 * @param {object} data
 * @returns {Promise<object>}
 */
async function createDeck(data) {
  const now = new Date().toISOString();
  const deck = {
    cards: [],
    sideboard: [],
    notes: '',
    tags: [],
    format: '',
    ...data,
    created_at: now,
    updated_at: now,
  };
  // Remove caller-supplied id (Firestore generates it via add())
  delete deck.id;
  const docRef = await db.collection(COLLECTION).add(deck);
  return { id: docRef.id, ...deck };
}

/**
 * Merges data into an existing deck and returns the updated deck.
 * @param {string} id
 * @param {object} data
 * @returns {Promise<object>}
 */
async function updateDeck(id, data) {
  const docRef = db.collection(COLLECTION).doc(id);
  const snap = await docRef.get();
  if (!snap.exists) throw new Error(`Deck not found: ${id}`);

  const existing = snap.data();
  const updated = {
    ...existing,
    ...data,
    created_at: existing.created_at,
    updated_at: new Date().toISOString(),
  };
  delete updated.id; // Firestore doc id is not a field

  await docRef.update(updated);
  return { id, ...updated };
}

/**
 * Deletes the deck for the given id.
 * @param {string} id
 * @returns {Promise<{ deleted: true }>}
 */
async function deleteDeck(id) {
  const docRef = db.collection(COLLECTION).doc(id);
  const snap = await docRef.get();
  if (!snap.exists) throw new Error(`Deck not found: ${id}`);
  await docRef.delete();
  return { deleted: true };
}

module.exports = { listDecks, getDeck, createDeck, updateDeck, deleteDeck };
