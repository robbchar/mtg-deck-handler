# Firebase Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the MTG Deck Handler to Firebase (Hosting + Cloud Functions + Firestore + Auth), migrating from file-based JSON storage, with all tests remaining fully offline.

**Architecture:** The React/Vite frontend is served via Firebase Hosting with `/api/*` rewritten to a Cloud Function that wraps the existing Express app. All services access Firestore through a single `db.js` abstraction layer — the only file tests need to mock. Google Sign-In is restricted to `robbchar@gmail.com`.

**Tech Stack:** Firebase Hosting, Cloud Functions (Node.js), Firestore (Admin SDK), Firebase Auth (Google provider), Firebase SDK v11 (client), Firebase Emulator Suite (local dev), firebase-functions, firebase-admin.

---

## File Map

**New files (server):**
- `server/services/db.js` — Firestore instance; single mock point for all tests
- `server/middleware/auth.js` — Firebase ID token verification middleware
- `server/middleware/auth.test.js` — auth middleware unit tests
- `server/functions/index.js` — Cloud Functions entry point; exports Express app as `api`

**Modified files (server):**
- `server/services/deckService.js` — replace `fs` with Firestore via `db.js`
- `server/services/deckService.test.js` — rewrite to mock `db.js` instead of temp dir
- `server/services/gameService.js` — replace `fs` with Firestore subcollection
- `server/services/gameService.test.js` — rewrite to mock `db.js`
- `server/services/cardService.js` — replace `fs` cache with Firestore
- `server/services/cardService.test.js` — update cache mocking
- `server/index.js` — remove `fs` dir creation; add auth middleware; keep `module.exports = app`
- `server/index.test.js` — add auth mock
- `server/routes/decks.test.js` — add auth mock
- `server/routes/games.test.js` — add auth mock
- `server/routes/cards.test.js` — add auth mock
- `server/routes/importExport.test.js` — add auth mock
- `server/routes/e2e.test.js` — add auth mock
- `server/package.json` — add `firebase-admin`, `firebase-functions`; set `main` to `functions/index.js`

**New files (client):**
- `client/src/firebase.ts` — Firebase app init and `auth` export
- `client/src/context/AuthContext.tsx` — auth state provider + `useAuth` hook
- `client/src/context/AuthContext.test.tsx` — unit tests for auth context
- `client/src/components/LoginPage.tsx` — Google Sign-In button UI
- `client/src/api/client.ts` — Axios instance with Firebase ID token interceptor

**Modified files (client):**
- `client/src/hooks/useDecks.ts` — import axios from `../api/client` instead of `axios`
- `client/src/hooks/useCards.ts` — same
- `client/src/hooks/useGames.ts` — same
- `client/src/main.tsx` — wrap app with `<AuthProvider>`
- `client/vite.config.js` — update proxy target for Firebase emulator
- `client/package.json` — add `firebase`

**Root / config:**
- `firebase.json` (root) — Hosting + Functions + Emulator config
- `.firebaserc` (root) — project alias
- `package.json` (root) — update `dev` script for emulator
- `scripts/migrate-to-firestore.js` — one-time data migration
- `C:/Users/Admin/Projects/firebase-robbchar-config/firestore.rules` — add mtg-deck-handler rules

---

## Task 1: Firebase project config + install deps

**Files:**
- Create: `firebase.json`
- Create: `.firebaserc`
- Modify: `server/package.json`
- Modify: `client/package.json`

- [ ] **Step 1: Install `firebase-tools` globally if not already present**

```bash
npm list -g firebase-tools || npm install -g firebase-tools
firebase --version
```

Expected: prints a version number (e.g. `13.x.x`).

- [ ] **Step 2: Create `.firebaserc`**

```json
{
  "projects": {
    "default": "robbchar-3db11"
  }
}
```

Save to `C:/Users/Admin/Projects/mtg-deck-handler/.firebaserc`.

- [ ] **Step 3: Create `firebase.json`**

```json
{
  "hosting": {
    "public": "client/dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "/api/**",
        "function": "api"
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  },
  "functions": {
    "source": "server",
    "runtime": "nodejs20"
  },
  "emulators": {
    "auth": { "port": 9099 },
    "functions": { "port": 5001 },
    "firestore": { "port": 8080 },
    "hosting": { "port": 5000 },
    "ui": { "enabled": true, "port": 4000 }
  }
}
```

Save to `C:/Users/Admin/Projects/mtg-deck-handler/firebase.json`.

- [ ] **Step 4: Add server dependencies**

```bash
cd server && npm install firebase-admin firebase-functions
```

Expected: both packages appear in `server/node_modules`.

- [ ] **Step 5: Change server `package.json` `main` to functions entry**

In `server/package.json`, change:
```json
"main": "index.js",
```
to:
```json
"main": "functions/index.js",
```

The `start` and `dev` scripts still reference `index.js` directly, so local dev is unaffected.

- [ ] **Step 6: Add Firebase SDK to client**

```bash
cd client && npm install firebase
```

Expected: `firebase` appears in `client/package.json` dependencies.

- [ ] **Step 7: Commit**

```bash
git add firebase.json .firebaserc server/package.json server/package-lock.json client/package.json client/package-lock.json
git commit -m "chore: add Firebase project config and install firebase deps"
```

---

## Task 2: db.js abstraction layer

**Files:**
- Create: `server/services/db.js`

- [ ] **Step 1: Create `server/services/db.js`**

```js
'use strict';

const admin = require('firebase-admin');

// initializeApp is idempotent — safe to call on every require.
// In Cloud Functions the SDK auto-configures from the runtime environment.
// With emulators the FIRESTORE_EMULATOR_HOST env var is set automatically.
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

module.exports = { db };
```

- [ ] **Step 2: Verify the module loads without errors in isolation**

```bash
cd server && node -e "require('./services/db'); console.log('ok')"
```

Expected: prints `ok` (may warn about missing credentials — that's fine for local without emulator; will be resolved when emulator runs).

- [ ] **Step 3: Commit**

```bash
git add server/services/db.js
git commit -m "feat: add Firestore db.js abstraction layer"
```

---

## Task 3: Migrate deckService to Firestore

**Files:**
- Modify: `server/services/deckService.js`
- Modify: `server/services/deckService.test.js`

Firestore collection: `mtg-deck-handler` (top-level). Each deck is a document `{deckId}`. Cards and sideboard are stored as arrays within the deck document (same shape as current JSON files).

- [ ] **Step 1: Rewrite `server/services/deckService.test.js`**

Replace the entire file content with:

```js
'use strict';

// ── Firestore mock ────────────────────────────────────────────────────────────
// Set up mock refs that the service's Firestore chain will hit.
// db.collection('mtg-deck-handler').get()            → listDecks
// db.collection('mtg-deck-handler').doc(id).get()    → getDeck / updateDeck / deleteDeck
// db.collection('mtg-deck-handler').add(data)        → createDeck

const mockCollRef = {
  get: jest.fn(),
  doc: jest.fn(),
  add: jest.fn(),
};
const mockDocRef = {
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};
mockCollRef.doc.mockReturnValue(mockDocRef);

jest.mock('./db', () => ({
  db: { collection: jest.fn(() => mockCollRef) },
}));

const { listDecks, getDeck, createDeck, updateDeck, deleteDeck } = require('./deckService');

beforeEach(() => {
  jest.clearAllMocks();
  mockCollRef.doc.mockReturnValue(mockDocRef);
});

// ── listDecks ─────────────────────────────────────────────────────────────────

describe('listDecks()', () => {
  it('returns an empty array when no decks exist', async () => {
    mockCollRef.get.mockResolvedValue({ docs: [] });
    expect(await listDecks()).toEqual([]);
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
    const result = await listDecks();
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
    const [meta] = await listDecks();
    expect(meta.card_count).toBe(0);
  });
});

// ── getDeck ───────────────────────────────────────────────────────────────────

describe('getDeck(id)', () => {
  it('returns the full deck object', async () => {
    const deckData = { name: 'Mono Red', format: 'Standard', cards: [], sideboard: [], notes: '', tags: [] };
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
    const deck = await createDeck({ name: 'New Deck' });
    expect(deck.id).toBe('new-uuid');
    expect(deck.name).toBe('New Deck');
  });

  it('sets created_at and updated_at to ISO timestamps', async () => {
    mockCollRef.add.mockResolvedValue({ id: 'x' });
    const before = new Date().toISOString();
    const deck = await createDeck({ name: 'Timed' });
    const after = new Date().toISOString();
    expect(deck.created_at >= before).toBe(true);
    expect(deck.created_at <= after).toBe(true);
    expect(deck.updated_at).toBe(deck.created_at);
  });

  it('calls collection().add() with the deck data', async () => {
    mockCollRef.add.mockResolvedValue({ id: 'x' });
    await createDeck({ name: 'Stored' });
    expect(mockCollRef.add).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Stored' }),
    );
  });
});

// ── updateDeck ────────────────────────────────────────────────────────────────

describe('updateDeck(id, data)', () => {
  const existing = { name: 'Before', format: 'Standard', notes: '', created_at: '2024-01-01T00:00:00.000Z', tags: [], cards: [], sideboard: [] };

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
});

// ── deleteDeck ────────────────────────────────────────────────────────────────

describe('deleteDeck(id)', () => {
  it('returns { deleted: true }', async () => {
    mockDocRef.get.mockResolvedValue({ exists: true, id: 'deck-1', data: () => ({}) });
    mockDocRef.delete.mockResolvedValue(undefined);
    expect(await deleteDeck('deck-1')).toEqual({ deleted: true });
  });

  it('throws when deck does not exist', async () => {
    mockDocRef.get.mockResolvedValue({ exists: false });
    await expect(deleteDeck('missing')).rejects.toThrow('Deck not found: missing');
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail (deckService still uses fs)**

```bash
cd server && npm test -- --testPathPattern=services/deckService
```

Expected: FAIL — tests call async functions but current service is synchronous.

- [ ] **Step 3: Rewrite `server/services/deckService.js`**

Replace entire file:

```js
'use strict';

const { db } = require('./db');

const COLLECTION = 'mtg-deck-handler';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Lists all decks (metadata only — no cards array).
 * @returns {Promise<Array>}
 */
async function listDecks() {
  const snapshot = await db.collection(COLLECTION).get();
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
 * Creates a new deck and returns it.
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
    id: existing.id,
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
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd server && npm test -- --testPathPattern=services/deckService
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/deckService.js server/services/deckService.test.js
git commit -m "feat: migrate deckService from file system to Firestore"
```

---

## Task 4: Migrate gameService to Firestore

**Files:**
- Modify: `server/services/gameService.js`
- Modify: `server/services/gameService.test.js`

Firestore path: `mtg-deck-handler/{deckId}/games/{gameId}` (subcollection per deck).

- [ ] **Step 1: Rewrite `server/services/gameService.test.js`**

Replace entire file:

```js
'use strict';

// ── Firestore mock ────────────────────────────────────────────────────────────
// Chain: db.collection('mtg-deck-handler').doc(deckId).collection('games')
// gamesRef.orderBy(...).get()     → getGames
// gamesRef.add(entry)             → addGame
// gamesRef.doc(gameId).get()      → removeGame (existence check)
// gamesRef.doc(gameId).delete()   → removeGame

const mockGameDocRef = { get: jest.fn(), delete: jest.fn() };
const mockOrderByRef = { get: jest.fn() };
const mockGamesRef = {
  orderBy: jest.fn(() => mockOrderByRef),
  add: jest.fn(),
  doc: jest.fn(() => mockGameDocRef),
};
const mockDeckDocRef = { collection: jest.fn(() => mockGamesRef) };
const mockDeckCollRef = { doc: jest.fn(() => mockDeckDocRef) };

jest.mock('./db', () => ({
  db: { collection: jest.fn(() => mockDeckCollRef) },
}));

const { getGames, addGame, removeGame } = require('./gameService');

const DECK_ID = 'deck-abc';

beforeEach(() => {
  jest.clearAllMocks();
  mockDeckCollRef.doc.mockReturnValue(mockDeckDocRef);
  mockDeckDocRef.collection.mockReturnValue(mockGamesRef);
  mockGamesRef.orderBy.mockReturnValue(mockOrderByRef);
  mockGamesRef.doc.mockReturnValue(mockGameDocRef);
});

// ── getGames ──────────────────────────────────────────────────────────────────

describe('getGames(deckId)', () => {
  it('returns an empty array when no games exist', async () => {
    mockOrderByRef.get.mockResolvedValue({ docs: [] });
    expect(await getGames(DECK_ID)).toEqual([]);
  });

  it('returns games ordered newest first (orderBy logged_at desc)', async () => {
    const entry1 = { id: 'g1', result: 'win', logged_at: '2024-01-01T00:00:00.000Z' };
    const entry2 = { id: 'g2', result: 'loss', logged_at: '2024-01-02T00:00:00.000Z' };
    mockOrderByRef.get.mockResolvedValue({
      docs: [
        { id: 'g2', data: () => entry2 },
        { id: 'g1', data: () => entry1 },
      ],
    });
    const games = await getGames(DECK_ID);
    expect(games[0].id).toBe('g2');
    expect(games[1].id).toBe('g1');
  });

  it('calls orderBy with logged_at desc', async () => {
    mockOrderByRef.get.mockResolvedValue({ docs: [] });
    await getGames(DECK_ID);
    expect(mockGamesRef.orderBy).toHaveBeenCalledWith('logged_at', 'desc');
  });
});

// ── addGame ───────────────────────────────────────────────────────────────────

describe('addGame(deckId, gameData)', () => {
  it('returns the new entry with the generated id', async () => {
    mockGamesRef.add.mockResolvedValue({ id: 'new-game-id' });
    const entry = await addGame(DECK_ID, { result: 'win' });
    expect(entry.id).toBe('new-game-id');
    expect(entry.result).toBe('win');
  });

  it('throws when result is missing', async () => {
    await expect(addGame(DECK_ID, {})).rejects.toThrow('result is required');
  });

  it('throws when result is invalid', async () => {
    await expect(addGame(DECK_ID, { result: 'draw' })).rejects.toThrow('result is required');
  });

  it('sets default values for optional fields', async () => {
    mockGamesRef.add.mockResolvedValue({ id: 'x' });
    const entry = await addGame(DECK_ID, { result: 'loss' });
    expect(entry.turn_ended).toBeNull();
    expect(entry.opponent_colors).toEqual([]);
    expect(entry.cards_in_hand).toEqual([]);
    expect(entry.mtga_rank).toBeNull();
  });

  it('stores the entry in Firestore via collection().add()', async () => {
    mockGamesRef.add.mockResolvedValue({ id: 'x' });
    await addGame(DECK_ID, { result: 'win', turn_ended: 6 });
    expect(mockGamesRef.add).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'win', turn_ended: 6 }),
    );
  });
});

// ── removeGame ────────────────────────────────────────────────────────────────

describe('removeGame(deckId, gameId)', () => {
  it('returns { deleted: true } on success', async () => {
    mockGameDocRef.get.mockResolvedValue({ exists: true });
    mockGameDocRef.delete.mockResolvedValue(undefined);
    expect(await removeGame(DECK_ID, 'g1')).toEqual({ deleted: true });
  });

  it('calls delete on the correct doc ref', async () => {
    mockGameDocRef.get.mockResolvedValue({ exists: true });
    mockGameDocRef.delete.mockResolvedValue(undefined);
    await removeGame(DECK_ID, 'g1');
    expect(mockGamesRef.doc).toHaveBeenCalledWith('g1');
    expect(mockGameDocRef.delete).toHaveBeenCalled();
  });

  it('throws when game does not exist', async () => {
    mockGameDocRef.get.mockResolvedValue({ exists: false });
    await expect(removeGame(DECK_ID, 'missing')).rejects.toThrow('Game not found: missing');
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd server && npm test -- --testPathPattern=services/gameService
```

Expected: FAIL.

- [ ] **Step 3: Rewrite `server/services/gameService.js`**

Replace entire file:

```js
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
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd server && npm test -- --testPathPattern=services/gameService
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/gameService.js server/services/gameService.test.js
git commit -m "feat: migrate gameService from file system to Firestore subcollection"
```

---

## Task 5: Migrate cardService cache to Firestore

**Files:**
- Modify: `server/services/cardService.js`
- Modify: `server/services/cardService.test.js`

Card cache Firestore collection: `mtg-deck-handler-card-cache`. Documents are keyed by Scryfall ID or `{set}_{collectorNumber}`. TTL is checked via a stored `cached_at` timestamp field.

- [ ] **Step 1: Add `mtg-deck-handler-card-cache` to the top of `cardService.js` imports and remove all `fs` cache logic**

In `server/services/cardService.js`:

a) Remove the `fs`, `path`, `dataDir`, `CACHE_DIR`, `CACHE_TTL_MS`, `cachePath`, and `atomicWrite` declarations.

b) Add at the top (after `'use strict'`):

```js
const { db } = require('./db');

const CACHE_COLLECTION = 'mtg-deck-handler-card-cache';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
```

c) Replace the `getCacheAge` function with a Firestore-based version:

```js
/**
 * Returns age in ms of a cached card, or null if not cached.
 * @param {string} cacheKey
 * @returns {Promise<number|null>}
 */
async function getCacheAge(cacheKey) {
  const snap = await db.collection(CACHE_COLLECTION).doc(cacheKey).get();
  if (!snap.exists) return null;
  const { cached_at } = snap.data();
  return Math.max(0, Date.now() - new Date(cached_at).getTime());
}
```

d) Replace the cache-read logic inside `getCard`:

Old pattern:
```js
if (age !== null && age < CACHE_TTL_MS) {
  return JSON.parse(fs.readFileSync(cachePath(scryfallId), 'utf8'));
}
```

New pattern:
```js
const age = await getCacheAge(scryfallId);
if (age !== null && age < CACHE_TTL_MS) {
  const snap = await db.collection(CACHE_COLLECTION).doc(scryfallId).get();
  return snap.data().card;
}
```

e) Replace the cache-write after successful fetch (inside `getCard`):

Old: `atomicWrite(cachePath(scryfallId), card);`

New:
```js
await db.collection(CACHE_COLLECTION).doc(scryfallId).set({ card, cached_at: new Date().toISOString() });
```

f) Apply the same cache-read and cache-write replacement inside `searchCards` (each card in the results array) and `getCardBySetCollector` (both the ID-based and set-collector-based cache keys).

For `searchCards`, the per-card cache write:
```js
await db.collection(CACHE_COLLECTION).doc(card.id).set({ card, cached_at: new Date().toISOString() });
```

For `getCardBySetCollector`, the set-collector cache key (`${setCode}_${collectorNumber}` instead of a file path):

```js
const cacheKey = `${setCode.toLowerCase()}_${collectorNumber}`;
const age = await getCacheAge(cacheKey);
if (age !== null && age < CACHE_TTL_MS) {
  const snap = await db.collection(CACHE_COLLECTION).doc(cacheKey).get();
  return snap.data().card;
}
// ... after fetch:
await db.collection(CACHE_COLLECTION).doc(card.id).set({ card, cached_at: new Date().toISOString() });
await db.collection(CACHE_COLLECTION).doc(cacheKey).set({ card, cached_at: new Date().toISOString() });
```

- [ ] **Step 2: Run existing cardService tests to see what breaks**

```bash
cd server && npm test -- --testPathPattern=services/cardService
```

Note which tests fail — they mock `fs` and will need to be updated to mock `db`.

- [ ] **Step 3: Update `server/services/cardService.test.js` to mock `db.js` for cache operations**

At the top of the file (before existing mocks), add the Firestore mock:

```js
const mockCacheDocRef = { get: jest.fn(), set: jest.fn() };
const mockCacheCollRef = { doc: jest.fn(() => mockCacheDocRef) };

jest.mock('./db', () => ({
  db: { collection: jest.fn(() => mockCacheCollRef) },
}));
```

For any test that previously set up `fs.existsSync` / `fs.statSync` / `fs.readFileSync` / `fs.writeFileSync` to simulate a cache hit:

Replace with:
```js
// cache hit: fresh entry
const cachedCard = { id: 'abc', name: 'Lightning Bolt' };
mockCacheDocRef.get.mockResolvedValue({
  exists: true,
  data: () => ({ card: cachedCard, cached_at: new Date().toISOString() }),
});
```

For cache miss (no cached entry):
```js
mockCacheDocRef.get.mockResolvedValue({ exists: false });
```

For stale cache (older than 7 days):
```js
const staleDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
mockCacheDocRef.get.mockResolvedValue({
  exists: true,
  data: () => ({ card: oldCard, cached_at: staleDate }),
});
```

Remove all `jest.mock('fs')` and `jest.mock('path')` blocks from the file. Remove any `process.env.DATA_DIR` setup.

- [ ] **Step 4: Run cardService tests — confirm they pass**

```bash
cd server && npm test -- --testPathPattern=services/cardService
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/cardService.js server/services/cardService.test.js
git commit -m "feat: migrate cardService cache from file system to Firestore"
```

---

## Task 6: Auth middleware

**Files:**
- Create: `server/middleware/auth.js`
- Create: `server/middleware/auth.test.js`

- [ ] **Step 1: Write failing tests in `server/middleware/auth.test.js`**

```js
'use strict';

const mockVerifyIdToken = jest.fn();

jest.mock('firebase-admin', () => ({
  apps: ['existing-app'], // simulate already initialised
  auth: () => ({ verifyIdToken: mockVerifyIdToken }),
}));

const { requireAuth } = require('./auth');

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('requireAuth middleware', () => {
  it('calls next() when a valid Bearer token is supplied', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-1', email: 'robbchar@gmail.com' });
    const req = { headers: { authorization: 'Bearer valid-token' } };
    const res = makeRes();
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ uid: 'user-1', email: 'robbchar@gmail.com' });
  });

  it('returns 401 when Authorization header is missing', async () => {
    const req = { headers: {} };
    const res = makeRes();
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when the token is invalid', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Token expired'));
    const req = { headers: { authorization: 'Bearer bad-token' } };
    const res = makeRes();
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    expect(next).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd server && npm test -- --testPathPattern=middleware/auth
```

Expected: FAIL — `auth.js` doesn't exist yet.

- [ ] **Step 3: Create `server/middleware/auth.js`**

```js
'use strict';

const admin = require('firebase-admin');

/**
 * Express middleware that verifies Firebase ID tokens.
 * Attaches decoded token to `req.user` on success.
 * Returns 401 on missing or invalid tokens.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { requireAuth };
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd server && npm test -- --testPathPattern=middleware/auth
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/middleware/auth.js server/middleware/auth.test.js
git commit -m "feat: add Firebase auth middleware for ID token verification"
```

---

## Task 7: Wire auth into server + add Cloud Functions entry

**Files:**
- Modify: `server/index.js`
- Modify: `server/index.test.js`
- Modify: `server/routes/decks.test.js`
- Modify: `server/routes/games.test.js`
- Modify: `server/routes/cards.test.js`
- Modify: `server/routes/importExport.test.js`
- Modify: `server/routes/e2e.test.js`
- Create: `server/functions/index.js`

- [ ] **Step 1: Add auth mock to every route test file**

Add the following block to the TOP of each of these files (immediately after `'use strict';`), BEFORE any other `jest.mock` calls:

Files: `server/routes/decks.test.js`, `server/routes/games.test.js`, `server/routes/cards.test.js`, `server/routes/importExport.test.js`, `server/routes/e2e.test.js`, `server/index.test.js`

```js
jest.mock('../middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { uid: 'test-uid', email: 'robbchar@gmail.com' };
    next();
  },
}));
```

Note: `server/index.test.js` uses `./middleware/auth` (no `../`):
```js
jest.mock('./middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { uid: 'test-uid', email: 'robbchar@gmail.com' };
    next();
  },
}));
```

- [ ] **Step 2: Update `server/index.js`**

a) Remove the top `fs`, `path` imports and the directory-creation block (the `mkdirSync` calls for `decksDir`, `cacheDir`, `gamesDir`).

b) Add auth middleware import after the existing requires:
```js
const { requireAuth } = require('./middleware/auth');
```

c) Add auth middleware before the route blocks (after the health check route):
```js
// All API routes require authentication
app.use('/api', requireAuth);
```

The file should look like this after changes (showing the key sections):

```js
'use strict';

require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const { requireAuth } = require('./middleware/auth');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// All API routes require a valid Firebase ID token
app.use('/api', requireAuth);

// ... route loading try/catch blocks (unchanged) ...

// ... global error handler (unchanged) ...

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`MTG Deck Manager server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
```

- [ ] **Step 3: Run all server tests — confirm they pass**

```bash
cd server && npm test
```

Expected: all tests PASS.

- [ ] **Step 4: Create `server/functions/index.js`**

```js
'use strict';

const functions = require('firebase-functions');
const app = require('../index');

exports.api = functions.https.onRequest(app);
```

- [ ] **Step 5: Commit**

```bash
git add server/index.js server/index.test.js server/routes/decks.test.js server/routes/games.test.js server/routes/cards.test.js server/routes/importExport.test.js server/routes/e2e.test.js server/functions/index.js
git commit -m "feat: add auth middleware to all API routes and create Cloud Functions entry"
```

---

## Task 8: Frontend Firebase SDK + AuthContext

**Files:**
- Create: `client/src/firebase.ts`
- Create: `client/src/context/AuthContext.tsx`
- Create: `client/src/context/AuthContext.test.tsx`
- Create: `client/src/components/LoginPage.tsx`

- [ ] **Step 1: Create `client/src/firebase.ts`**

```ts
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyC9hSZ-placeholder',           // replace with actual values from Firebase console
  authDomain: 'robbchar-3db11.firebaseapp.com',
  projectId: 'robbchar-3db11',
  storageBucket: 'robbchar-3db11.appspot.com',
  messagingSenderId: '412261854179',
  appId: '1:412261854179:web:99f5806d1f70a762528ed6',
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
```

**Note:** Replace `apiKey` with the actual value from the Firebase console → Project Settings → Your apps → Web app config.

- [ ] **Step 2: Write failing tests for `client/src/context/AuthContext.test.tsx`**

```tsx
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'

// Mock firebase/auth so tests never touch real Firebase
const mockOnAuthStateChanged = vi.fn()
const mockSignInWithPopup = vi.fn()
const mockSignOut = vi.fn()

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: vi.fn(),
  onAuthStateChanged: mockOnAuthStateChanged,
  signInWithPopup: mockSignInWithPopup,
  signOut: mockSignOut,
}))

vi.mock('../firebase', () => ({ auth: {} }))

function TestConsumer() {
  const { user, loading } = useAuth()
  if (loading) return <div>loading</div>
  return <div>{user ? `user:${user.email}` : 'no-user'}</div>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AuthProvider', () => {
  it('shows loading while auth state is being determined', () => {
    mockOnAuthStateChanged.mockImplementation(() => () => {}) // never resolves
    render(<AuthProvider><TestConsumer /></AuthProvider>)
    expect(screen.getByText('loading')).toBeInTheDocument()
  })

  it('provides user when signed in', async () => {
    mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
      callback({ email: 'robbchar@gmail.com', uid: 'user-1' })
      return () => {}
    })
    render(<AuthProvider><TestConsumer /></AuthProvider>)
    await waitFor(() => {
      expect(screen.getByText('user:robbchar@gmail.com')).toBeInTheDocument()
    })
  })

  it('provides null user when signed out', async () => {
    mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
      callback(null)
      return () => {}
    })
    render(<AuthProvider><TestConsumer /></AuthProvider>)
    await waitFor(() => {
      expect(screen.getByText('no-user')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 3: Run the test — confirm it fails**

```bash
cd client && npm test -- --run --reporter=verbose 2>&1 | grep -A5 "AuthContext"
```

Expected: FAIL — `AuthContext.tsx` doesn't exist.

- [ ] **Step 4: Create `client/src/context/AuthContext.tsx`**

```tsx
import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { auth } from '../firebase'

interface AuthContextValue {
  user: User | null
  loading: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  async function handleSignIn() {
    const provider = new GoogleAuthProvider()
    await signInWithPopup(auth, provider)
  }

  async function handleSignOut() {
    await signOut(auth)
  }

  return (
    <AuthContext value={{ user, loading, signIn: handleSignIn, signOut: handleSignOut }}>
      {children}
    </AuthContext>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

- [ ] **Step 5: Create `client/src/components/LoginPage.tsx`**

```tsx
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { signIn } = useAuth()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg text-center space-y-4">
        <h1 className="text-2xl font-bold text-white">MTG Deck Handler</h1>
        <p className="text-gray-400">Sign in to manage your decks</p>
        <button
          onClick={signIn}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run AuthContext tests — confirm they pass**

```bash
cd client && npm test -- --run --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|AuthContext)"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/firebase.ts client/src/context/AuthContext.tsx client/src/context/AuthContext.test.tsx client/src/components/LoginPage.tsx
git commit -m "feat: add Firebase Auth setup, AuthContext, and LoginPage"
```

---

## Task 9: Axios client with auth interceptor + update hooks

**Files:**
- Create: `client/src/api/client.ts`
- Modify: `client/src/hooks/useDecks.ts`
- Modify: `client/src/hooks/useCards.ts`
- Modify: `client/src/hooks/useGames.ts`

The existing hook tests mock `axios` directly and will continue to work — `api/client.ts` re-exports an axios instance that is mocked the same way.

- [ ] **Step 1: Create `client/src/api/client.ts`**

```ts
import axios from 'axios'
import { auth } from '../firebase'

const client = axios.create()

client.interceptors.request.use(async (config) => {
  const token = await auth.currentUser?.getIdToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default client
```

- [ ] **Step 2: Update `client/src/hooks/useDecks.ts`**

Change the import at the top from:
```ts
import axios from 'axios'
```
to:
```ts
import client from '../api/client'
```

Then replace every occurrence of `axios.get`, `axios.post`, `axios.put`, `axios.delete` with `client.get`, `client.post`, `client.put`, `client.delete`.

- [ ] **Step 3: Update `client/src/hooks/useCards.ts`**

Same change: `import axios from 'axios'` → `import client from '../api/client'`, and replace all `axios.*` with `client.*`.

- [ ] **Step 4: Update `client/src/hooks/useGames.ts`**

Same change.

- [ ] **Step 5: Run all client tests — confirm they still pass**

The existing hook tests mock `axios` at the module level (`vi.mock('axios', ...)`). Since `client.ts` imports from `axios`, those mocks still intercept the underlying axios calls correctly.

```bash
cd client && npm test -- --run
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/api/client.ts client/src/hooks/useDecks.ts client/src/hooks/useCards.ts client/src/hooks/useGames.ts
git commit -m "feat: add Axios client with Firebase ID token interceptor"
```

---

## Task 10: Wire auth gate in App + update main.tsx

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/main.tsx`

- [ ] **Step 1: Read the current `client/src/App.tsx`**

Use Read tool to see the current structure before editing.

- [ ] **Step 2: Add auth gate to `client/src/App.tsx`**

Import and use `useAuth` and `LoginPage` to gate the app:

```tsx
import { useAuth } from './context/AuthContext'
import LoginPage from './components/LoginPage'
import Spinner from './components/Spinner'

// Inside the App component, before the existing return:
const { user, loading } = useAuth()

if (loading) return <Spinner />
if (!user) return <LoginPage />

// ... rest of existing return (Router with routes) unchanged
```

- [ ] **Step 3: Update `client/src/main.tsx`**

Wrap the app with `AuthProvider`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AuthProvider } from './context/AuthContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
```

- [ ] **Step 4: Run all client tests — confirm they pass**

```bash
cd client && npm test -- --run
```

Expected: PASS. (App tests that render `<App />` will need to mock `useAuth`. If they fail, add `vi.mock('./context/AuthContext', () => ({ useAuth: () => ({ user: { email: 'test@test.com', uid: 'u1' }, loading: false, signIn: vi.fn(), signOut: vi.fn() }) }))` to those test files.)

- [ ] **Step 5: Commit**

```bash
git add client/src/App.tsx client/src/main.tsx
git commit -m "feat: gate app behind Firebase Auth — show LoginPage when signed out"
```

---

## Task 11: Local dev emulator setup

**Files:**
- Modify: `client/vite.config.js`
- Modify: `package.json` (root)

- [ ] **Step 1: Update `client/vite.config.js` proxy target**

Change the existing proxy from pointing at Express (port 3001) to the Firebase Functions emulator:

```js
server: {
  port: 5173,
  proxy: {
    '/api': {
      target: 'http://localhost:5001/robbchar-3db11/us-central1/api',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ''),
    },
  },
},
```

- [ ] **Step 2: Update root `package.json` dev script**

Change:
```json
"dev": "concurrently \"npm run dev --workspace=server\" \"npm run dev --workspace=client\""
```

to:
```json
"dev": "concurrently \"firebase emulators:start --only auth,firestore,functions\" \"npm run dev --workspace=client\"",
"dev:server": "npm run dev --workspace=server"
```

The `dev:server` fallback runs the raw Express server (useful for debugging without emulators).

- [ ] **Step 3: Verify emulator starts (manual check)**

```bash
firebase emulators:start --only auth,firestore,functions
```

Expected: emulator UI available at `http://localhost:4000`, functions at port 5001.

Stop the emulator with Ctrl+C after confirming it starts successfully.

- [ ] **Step 4: Commit**

```bash
git add client/vite.config.js package.json
git commit -m "chore: update dev scripts and Vite proxy to use Firebase Emulator Suite"
```

---

## Task 12: Firestore rules in firebase-robbchar-config

**Files:**
- Modify: `C:/Users/Admin/Projects/firebase-robbchar-config/firestore.rules`

- [ ] **Step 1: Read the current rules file**

```
C:/Users/Admin/Projects/firebase-robbchar-config/firestore.rules
```

- [ ] **Step 2: Add mtg-deck-handler namespace rules**

Within the `service cloud.firestore { match /databases/{database}/documents {` block, add after any existing app namespaces:

```
// MTG-DECK-HANDLER
match /mtg-deck-handler/{document=**} {
  allow read, write: if isAdminEmail();
}

// Card cache (shared across all decks)
match /mtg-deck-handler-card-cache/{document=**} {
  allow read, write: if isAdminEmail();
}
```

- [ ] **Step 3: Deploy rules**

```bash
cd C:/Users/Admin/Projects/firebase-robbchar-config
firebase deploy --only firestore:rules --project robbchar-3db11
```

Expected: `Deploy complete!`

- [ ] **Step 4: Commit rules**

```bash
cd C:/Users/Admin/Projects/firebase-robbchar-config
git add firestore.rules
git commit -m "feat: add mtg-deck-handler Firestore rules"
```

---

## Task 13: One-time data migration script

**Files:**
- Create: `scripts/migrate-to-firestore.js`

This script reads existing local JSON files from `data/` and writes them to Firestore. It is idempotent — running it twice produces the same result (uses existing IDs as Firestore document IDs).

**Run this script once with production credentials before deploying.**

- [ ] **Step 1: Create `scripts/migrate-to-firestore.js`**

```js
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
```

- [ ] **Step 2: Make it executable and do a dry-run against emulator**

```bash
# Start emulator first in another terminal: firebase emulators:start --only firestore
FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/migrate-to-firestore.js
```

Expected: migration runs without errors. Verify data appears in emulator UI at `http://localhost:4000`.

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-to-firestore.js
git commit -m "feat: add one-time Firestore data migration script"
```

---

## Task 14: Build verification + deploy docs

**Files:**
- No new files

- [ ] **Step 1: Build the client**

```bash
npm run build --workspace=client
```

Expected: `client/dist/` is created with `index.html` and assets.

- [ ] **Step 2: Run all tests (both client and server)**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 3: Deploy to Firebase**

```bash
firebase deploy --project robbchar-3db11
```

This deploys both Hosting and Cloud Functions.

Expected: URLs printed for Hosting and Functions. App is live at `https://robbchar-3db11.web.app`.

- [ ] **Step 4: Run the data migration against production** (one-time)

```bash
node scripts/migrate-to-firestore.js
```

Run with a service account key or from a machine authenticated via `firebase login`.

- [ ] **Step 5: Smoke test production**

Open `https://robbchar-3db11.web.app` in a browser:
- Sign in with `robbchar@gmail.com` — should succeed
- Decks list loads
- Create a new deck — navigates to deck editor
- Add a card — card appears in the deck
- Log a game — game appears in the game log

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "chore: Firebase deployment complete — Hosting + Functions + Firestore"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✓ Firebase Hosting + Cloud Functions (Task 1, 7, 14)
- ✓ Firestore replacing file-based storage (Tasks 3, 4, 5)
- ✓ `db.js` abstraction for test isolation (Task 2)
- ✓ Auth middleware + Google Sign-In (Tasks 6, 8, 10)
- ✓ All tests remain fully offline — `db.js` mocked in all service tests; `firebase/auth` mocked in client tests; `requireAuth` mocked in route tests (Tasks 3–10)
- ✓ Axios interceptor attaches ID token (Task 9)
- ✓ Firebase Emulator Suite for local dev (Task 11)
- ✓ Firestore rules in centralized config (Task 12)
- ✓ One-time migration script (Task 13)
- ✓ Existing `package.json` scripts updated for emulator (Task 11)

**Type consistency:**
- `getGames`, `addGame`, `removeGame` in gameService match the function signatures used in route tests and hook tests throughout.
- `listDecks`, `getDeck`, `createDeck`, `updateDeck`, `deleteDeck` all become async — route tests already use `await request(app).get(...)` via supertest so they're unaffected.
- `auth.currentUser?.getIdToken()` in `client.ts` uses the Firebase Auth SDK v9 modular API consistently with `AuthContext.tsx`.
