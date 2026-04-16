#!/usr/bin/env node
'use strict';

/**
 * One-time migration: local JSON files → Firestore
 *
 * Usage:
 *   node scripts/migrate-to-firestore.js --userId=<your-firebase-uid>
 *
 * Find your UID in the Firebase Emulator UI (Authentication tab) or
 * Firebase Console → Authentication → Users.
 *
 * Dry-run against emulator:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/migrate-to-firestore.js --userId=<uid>
 *
 * Against production (requires ADC or service account):
 *   node scripts/migrate-to-firestore.js --userId=<uid>
 *
 * Data migrated:
 *   data/decks/{id}.json       → mtg-deck-handler/{id}  (with userId stamped)
 *   data/games/{deckId}.json   → mtg-deck-handler/{deckId}/games/{gameId}
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// ── Parse --userId flag ───────────────────────────────────────────────────────

const userIdArg = process.argv.find((a) => a.startsWith('--userId='));
if (!userIdArg) {
  console.error('Error: --userId=<firebase-uid> is required.');
  console.error('Find your UID in the Firebase Console → Authentication → Users');
  console.error('or in the Emulator UI → Authentication tab after signing in.\n');
  console.error('Usage: node scripts/migrate-to-firestore.js --userId=<uid>');
  process.exit(1);
}
const userId = userIdArg.split('=')[1].trim();
if (!userId) {
  console.error('Error: --userId value cannot be empty.');
  process.exit(1);
}

// ── Firestore init ────────────────────────────────────────────────────────────

admin.initializeApp({ projectId: 'robbchar-3db11' });
const db = admin.firestore();

const DATA_DIR = path.resolve(__dirname, '../data');
const DECKS_DIR = path.join(DATA_DIR, 'decks');
const GAMES_DIR = path.join(DATA_DIR, 'games');
const DECK_COLLECTION = 'mtg-deck-handler';

// ── Migration ─────────────────────────────────────────────────────────────────

async function migrateDecks() {
  if (!fs.existsSync(DECKS_DIR)) {
    console.log('No decks directory found, skipping deck migration.');
    return;
  }

  const files = fs.readdirSync(DECKS_DIR).filter((f) => f.endsWith('.json'));
  console.log(`Migrating ${files.length} deck(s) with userId=${userId}...`);

  for (const file of files) {
    const deck = JSON.parse(fs.readFileSync(path.join(DECKS_DIR, file), 'utf8'));
    const { id, ...data } = deck;
    await db.collection(DECK_COLLECTION).doc(id).set({ ...data, userId }, { merge: true });
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
