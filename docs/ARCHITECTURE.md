# MTG Deck Manager — Architecture

## Overview

A Magic: The Gathering deck management app. Decks, game logs, and snapshot history are stored in Firebase Firestore. The React frontend talks to an Express API server, which proxies Scryfall card lookups (cached locally on disk) and owns all Firestore reads/writes. The app supports full deck editing, MTGA import/export, per-session snapshot checkpoints, and a history timeline with per-snapshot W/L records and card diffs.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     React Frontend                       │
│  DeckList │ DeckEditor │ DeckHistory │ CardSearch        │
└─────────────────────┬───────────────────────────────────┘
                      │ fetch/axios
┌─────────────────────▼───────────────────────────────────┐
│                  Express API Server                      │
│  /decks  /games  /snapshots  /cards  /import  /export   │
└──────┬──────────────────┬────────────────────────────────┘
       │                  │
┌──────▼──────────┐  ┌────▼──────────────────┐
│  Firebase       │  │  Scryfall API          │
│  Firestore      │  │  api.scryfall.com      │
│  (decks/games/  │  │  (cached locally in    │
│   snapshots)    │  │   /data/cache/)        │
└─────────────────┘  └───────────────────────┘
```

---

## Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | React 19 + Vite | Fast dev server, familiar, good ecosystem. React Compiler enabled — automatic memoisation, no manual `useCallback`/`useMemo` needed. |
| Styling | Tailwind CSS | Utility-first, no CSS file sprawl |
| State | React Context + useReducer | Sufficient for this scope, no Redux overhead |
| Backend | Express (Node) | Lightweight, handles file I/O and API proxy cleanly |
| Storage | Firebase Firestore | Cloud-hosted document DB; decks, games, and snapshots stored as subcollections |
| Card data cache | JSON files in `/data/cache/` | Avoids hammering Scryfall, respects their rate limits |
| External API | Scryfall REST API | Free, comprehensive, well-documented |

---

## Data Model

### Deck document: Firestore `/mtg-deck-handler/{deckId}`

```json
{
  "id": "firestore-doc-id",
  "name": "Mono Red Burn",
  "format": "Standard",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-20T14:22:00Z",
  "notes": "Main strategy: go fast, burn face. Sideboard for control matchups.",
  "activeSnapshotId": "snapshot-doc-id",
  "cards": [
    {
      "quantity": 4,
      "scryfall_id": "abc123",
      "name": "Lightning Bolt",
      "section": "mainboard"
    }
  ],
  "sideboard": [
    {
      "quantity": 2,
      "scryfall_id": "def456",
      "name": "Smash to Smithereens",
      "section": "sideboard"
    }
  ],
  "tags": ["aggro", "burn", "red"]
}
```

`activeSnapshotId` is set server-side on every `createSnapshot` and `revertToSnapshot` call. The client reads it on deck load and uses it to display the "Current" badge on the correct snapshot entry.

### Snapshot document: Firestore `/mtg-deck-handler/{deckId}/snapshots/{snapshotId}`

```json
{
  "createdAt": "2024-01-20T14:22:00Z",
  "cards": [...],
  "sideboard": [...],
  "format": "Standard",
  "notes": "..."
}
```

### Card cache: `/data/cache/{scryfall-id}.json`

Raw Scryfall card object, stored as-is. Cache is considered stale after 7 days.
Scryfall objects include: name, mana cost, type line, oracle text, image URIs,
legalities, prices, set info.

### MTGA export format

Plain text, one card per line:
```
4 Lightning Bolt
2 Mountain
```

Sections separated by blank line (mainboard then sideboard).

---

## API Routes (Express)

### Decks
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/decks` | List all decks (metadata only, no card details) |
| GET | `/api/decks/:id` | Get full deck with card data |
| POST | `/api/decks` | Create new deck |
| PUT | `/api/decks/:id` | Update deck (cards, notes, name) |
| DELETE | `/api/decks/:id` | Delete deck |

### Cards
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/cards/search?q=` | Search Scryfall, cache results |
| GET | `/api/cards/:scryfallId` | Get single card (cache-first) |

### Import / Export
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/decks/:id/export` | Generate MTGA-format text, return as string |
| POST | `/api/import` | Parse MTGA-format text, create deck JSON |
| POST | `/api/decks/:id/import` | Parse MTGA text, replace cards/sideboard on existing deck |

### Snapshots
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/decks/:id/snapshots` | List all snapshots, newest first |
| POST | `/api/decks/:id/snapshots` | Create a snapshot of current deck state |
| POST | `/api/decks/:id/snapshots/:snapshotId/revert` | Revert deck to snapshot; updates `activeSnapshotId` on deck |
| DELETE | `/api/decks/:id/snapshots/after/:snapshotId` | Prune snapshots created after a given snapshot (called after revert to remove invalidated future checkpoints) |

---

## Frontend Pages / Views

### Deck List (`/`)
- Grid of deck cards showing name, format, card count, last updated
- Create new deck button
- Delete deck with confirmation

### Deck Editor (`/deck/:id`)
- Deck name and format (editable inline)
- Tab navigation: **Current Deck** (mainboard, sideboard, game log) | **Deck History** (snapshot timeline)
- Mainboard and sideboard sections with card rows (quantity, name, mana cost, type)
- Notes textarea (auto-saves on blur)
- Add card via search (opens card search panel)
- Remove card / adjust quantity
- Import button (opens ImportModal in create mode — creates new deck from MTGA text)
- Update from MTGA button (opens ImportModal in update mode — replaces existing deck's card list, no name/format fields)
- Export button (copies MTGA text to clipboard)
- Snapshot timer: fires a `POST /snapshots` after 3 minutes of inactivity; also sends a best-effort `keepalive` snapshot on `beforeunload`

### Deck History tab
- Pending "Working changes" entry showing live edits vs latest snapshot (client-side diff, no network call)
- Timeline of committed snapshots, newest → oldest, with upward-arrow connectors
- Each entry: timestamp, card count, W/L record at that point, card diff (expand/collapse chips), Restore button
- "Current" badge on whichever snapshot is `activeSnapshotId`
- Reverting a snapshot deletes newer snapshots (timeline pruning) then sets the deck back to that state

### Card Search Panel (slide-in)
- Text search → calls `/api/cards/search`
- Shows card image, name, mana cost, type
- Click to add to deck (prompts mainboard vs sideboard)

### Import Modal
- Paste MTGA-format text
- Preview parsed result before confirming
- Handles unknown cards gracefully (flags them, doesn't block import)

---

## Caching Strategy

Scryfall requests go through the Express server, never directly from the browser.
This keeps API key handling server-side (if ever needed) and centralizes cache logic.

Cache flow:
1. Frontend requests `/api/cards/:id`
2. Server checks `/data/cache/{id}.json` — if exists and fresh (< 7 days), return it
3. If stale or missing, fetch from `api.scryfall.com/cards/{id}`, save to cache, return
4. Scryfall rate limit: 10 requests/second max — server enforces this with a simple queue

---

## File Structure

```
mtg-deck-manager/
├── client/                  # React frontend
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts        # Axios instance with Firebase auth interceptor
│   │   ├── components/
│   │   │   ├── CardCompactView.tsx
│   │   │   ├── CardDetailModal.tsx
│   │   │   ├── CardGridView.tsx
│   │   │   ├── CardImagePlaceholder.tsx
│   │   │   ├── CardResultItem.tsx
│   │   │   ├── CardRow.tsx
│   │   │   ├── CardSearch.tsx
│   │   │   ├── CloseButton.tsx
│   │   │   ├── DeckCard.tsx
│   │   │   ├── DeckHistory.tsx      # Snapshot timeline + pending diff
│   │   │   ├── ErrorBoundary.tsx
│   │   │   ├── FormatSelect.tsx
│   │   │   ├── GameLogList.tsx
│   │   │   ├── GameLogger.tsx
│   │   │   ├── ImportModal.tsx
│   │   │   ├── ImportPreview.tsx
│   │   │   ├── LoginPage.tsx
│   │   │   ├── SnapshotEntry.tsx    # One row in the history timeline
│   │   │   ├── Spinner.tsx
│   │   │   ├── ToastContainer.tsx
│   │   │   └── UserAvatar.tsx
│   │   ├── context/
│   │   │   ├── AuthContext.tsx      # Firebase Auth state
│   │   │   ├── DeckContext.tsx      # Global deck list state (useReducer)
│   │   │   └── ToastContext.tsx
│   │   ├── hooks/
│   │   │   ├── useCards.ts
│   │   │   ├── useDecks.ts
│   │   │   ├── useGames.ts
│   │   │   ├── useSnapshots.ts
│   │   │   └── useToast.ts
│   │   ├── pages/
│   │   │   ├── DeckList.tsx
│   │   │   └── DeckEditor.tsx
│   │   ├── utils/
│   │   │   ├── index.ts
│   │   │   └── mtgaFormat.ts    # MTGA text parsing/generation
│   │   ├── firebase.ts          # Firebase app initialisation
│   │   ├── types.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── eslint.config.js         # ESLint with react-compiler + react-hooks rules
│   ├── index.html
│   └── vite.config.js
│
├── server/                  # Express backend (runs as Firebase Function)
│   ├── functions/
│   │   └── index.js         # Firebase Functions entry point
│   ├── routes/
│   │   ├── decks.js
│   │   ├── cards.js
│   │   ├── games.js
│   │   ├── snapshots.js
│   │   └── importExport.js
│   ├── services/
│   │   ├── db.js            # Firebase Admin SDK singleton
│   │   ├── deckService.js   # Firestore reads/writes for decks
│   │   ├── gameService.js   # Game log CRUD
│   │   ├── snapshotService.js
│   │   ├── cardService.js   # Scryfall fetch + cache logic
│   │   └── mtgaService.js   # Import/export format logic
│   ├── middleware/
│   │   ├── rateLimiter.js   # Scryfall rate limit queue
│   │   └── validate.js      # Request validation middleware
│   └── index.js
│
├── data/                    # Runtime data (gitignored)
│   └── cache/               # Scryfall card cache (7-day TTL)
│
├── docs/                    # Architecture documentation
├── firebase.json            # Firebase hosting, functions, emulator config
├── firestore.rules
└── package.json             # Workspaces: client + server
```

---

## Firebase / Firestore

Firebase Firestore is the live storage backend for deck documents, game logs, and snapshot history. Decks are no longer stored as local JSON files — Firestore is the source of truth.

`server/services/db.js` initialises the Firebase Admin SDK using the service account key at `server/serviceAccountKey.json` (gitignored). All service modules (`deckService`, `gameService`, `snapshotService`) import the shared `db` singleton.

### Snapshot subcollection

Each deck document has a `snapshots` subcollection at:
```
/mtg-deck-handler/{deckId}/snapshots/{snapshotId}
```

A snapshot document stores `{ createdAt, cards, sideboard, format, notes }` — a full point-in-time copy of the deck's card state.

`activeSnapshotId` is a field on the **deck document** itself, updated server-side on every snapshot creation or revert. The client reads this field on deck load and uses it to mark the correct timeline entry as "Current" — surviving tab switches and page reloads.

---

## Environment Variables

```
# server/.env
PORT=3001
DATA_DIR=../data
SCRYFALL_RATE_LIMIT_MS=100   # min ms between Scryfall requests
```