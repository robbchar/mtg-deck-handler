'use strict';

const { db } = require('./db');

const DECK_COLLECTION = 'mtg-deck-handler';
const GAMES_SUBCOLLECTION = 'games';

function gamesRef(deckId) {
  return db.collection(DECK_COLLECTION).doc(deckId).collection(GAMES_SUBCOLLECTION);
}

/**
 * Returns all logged games for a deck, newest first.
 * @param {string} deckId
 * @returns {Promise<object[]>}
 */
async function getGames(deckId) {
  const snapshot = await gamesRef(deckId).orderBy('logged_at', 'desc').get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * Appends a new game entry and returns it.
 * @param {string} deckId
 * @param {object} gameData
 * @returns {Promise<object>}
 */
async function addGame(deckId, gameData) {
  if (!gameData.result || !['win', 'loss'].includes(gameData.result)) {
    throw new Error('result is required and must be "win" or "loss"');
  }

  const entry = {
    logged_at: new Date().toISOString(),
    result: gameData.result,
    turn_ended: gameData.turn_ended ?? null,
    opponent_colors: gameData.opponent_colors ?? [],
    opponent_archetype: gameData.opponent_archetype ?? null,
    opening_hand_feel: gameData.opening_hand_feel ?? null,
    cards_in_hand: gameData.cards_in_hand ?? [],
    tough_opponent_card: gameData.tough_opponent_card ?? '',
    notes: gameData.notes ?? '',
    mtga_rank: gameData.mtga_rank ?? null,
  };

  const docRef = await gamesRef(deckId).add(entry);
  return { id: docRef.id, ...entry };
}

/**
 * Removes a single game entry by id.
 * @param {string} deckId
 * @param {string} gameId
 * @returns {Promise<{ deleted: true }>}
 */
async function removeGame(deckId, gameId) {
  const docRef = gamesRef(deckId).doc(gameId);
  const snap = await docRef.get();
  if (!snap.exists) throw new Error(`Game not found: ${gameId}`);
  await docRef.delete();
  return { deleted: true };
}

module.exports = { getGames, addGame, removeGame };
