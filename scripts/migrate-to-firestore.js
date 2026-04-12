#!/usr/bin/env node
'use strict';

/**
 * One-time migration: local JSON files → Firestore
 *
 * Prerequisites:
 *   1. Set GOOGLE_APPLICATION_CREDENTIALS env var to a service account key file
 *      with Firestore write access, OR run `firebase login` first.
 *   2. Run from the repo root: node scripts/migrate-to-firestore.js
 *
 * Dry-run against emulator:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/migrate-to-firestore.js
 *
 * Data migrated:
 *   data/decks/{id}.json       → mtg-deck-handler/{id}
 *   data/games/{deckId}.json   → mtg-deck-handler/{deckId}/games/{gameId}
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

admin.initializeApp({ projectId: 'robbchar-3db11' });
const db = admin.firestore();

const DATA_DIR = path.resolve(__dirname, '../data');
const DECKS_DIR = path.join(DATA_DIR, 'decks');
const GAMES_DIR = path.join(DATA_DIR, 'games');
const DECK_COLLECTION = 'mtg-deck-handler';

async function migrateDecks() {
  if (!fs.existsSync(DECKS_DIR)) {
    console.log('No decks directory found, skipping deck migration.');
    return;
  }

  const files = fs.readdirSync(DECKS_DIR).filter((f) => f.endsWith('.json'));
  console.log(`Migrating ${files.length} deck(s)...`);

  for (const file of files) {
    const deck = JSON.parse(fs.readFileSync(path.join(DECKS_DIR, file), 'utf8'));
    const { id, ...data } = deck;
    await db.collection(DECK_COLLECTION).doc(id).set(data, { merge: true });
    console.log(`  ✓ Deck: ${deck.name} (${id})`);
  }
}

async function migrateGames() {
  if (!fs.existsSync(GAMES_DIR)) {
    console.log('No games directory found, skipping game migration.');
    return;
  }

  const files = fs.readdirSync(GAMES_DIR).filter((f) => f.endsWith('.json'));
  console.log(`Migrating games from ${files.length} deck log(s)...`);

  for (const file of files) {
    const log = JSON.parse(fs.readFileSync(path.join(GAMES_DIR, file), 'utf8'));
    const gamesRef = db.collection(DECK_COLLECTION).doc(log.deck_id).collection('games');

    for (const game of log.games) {
      const { id, ...entry } = game;
      await gamesRef.doc(id).set(entry, { merge: true });
    }
    console.log(`  ✓ Games for deck ${log.deck_id}: ${log.games.length} entries`);
  }
}

async function main() {
  console.log('Starting migration to Firestore...\n');
  await migrateDecks();
  await migrateGames();
  console.log('\nMigration complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
