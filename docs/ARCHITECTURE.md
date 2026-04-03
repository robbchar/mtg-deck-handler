# MTG Deck Manager — Architecture

## Overview

A local-first Magic: The Gathering deck management app. Decks are stored as
JSON files on disk, with a React frontend for editing, notes, and card lookup
via the Scryfall API. Firebase sync is an optional future layer — the app works
fully offline without it.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                   React Frontend                     │
│  DeckList │ DeckEditor │ CardSearch │ ImportModal    │
└─────────────────────┬───────────────────────────────┘
                      │ fetch/axios
┌─────────────────────▼───────────────────────────────┐
│                 Express API Server                   │
│   /decks    /cards (proxy)    /import    /export     │
└──────┬──────────────┬────────────────────────────────┘
       │              │
┌──────▼──────┐  ┌────▼──────────────────┐
│  JSON files │  │  Scryfall API          │
│  /data/     │  │  api.scryfall.com      │
│  decks/     │  │  (cached locally)      │
└─────────────┘  └───────────────────────┘
```

---

## Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | React 18 + Vite | Fast dev server, familiar, good ecosystem |
| Styling | Tailwind CSS | Utility-first, no CSS file sprawl |
| State | React Context + useReducer | Sufficient for this scope, no Redux overhead |
| Backend | Express (Node) | Lightweight, handles file I/O and API proxy cleanly |
| Storage | JSON files on disk | Local-first, human-readable, easy to inspect/debug |
| Card data cache | JSON files in `/data/cache/` | Avoids hammering Scryfall, respects their rate limits |
| External API | Scryfall REST API | Free, comprehensive, well-documented |
| Future: sync | Firebase Firestore | Optional layer, architecture supports it without refactor |

---

## Data Model

### Deck file: `/data/decks/{deck-id}.json`

```json
{
  "id": "uuid-v4",
  "name": "Mono Red Burn",
  "format": "Standard",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-20T14:22:00Z",
  "notes": "Main strategy: go fast, burn face. Sideboard for control matchups.",
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

---

## Frontend Pages / Views

### Deck List (`/`)
- Grid of deck cards showing name, format, card count, last updated
- Create new deck button
- Delete deck with confirmation

### Deck Editor (`/deck/:id`)
- Deck name and format (editable inline)
- Mainboard and sideboard sections with card rows (quantity, name, mana cost, type)
- Notes textarea (auto-saves on blur)
- Add card via search (opens card search panel)
- Remove card / adjust quantity
- Export button (copies MTGA text to clipboard)

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
│   │   ├── components/
│   │   │   ├── DeckCard.tsx
│   │   │   ├── CardRow.tsx
│   │   │   ├── CardSearch.tsx
│   │   │   ├── ImportModal.tsx
│   │   │   ├── ImportPreview.tsx
│   │   │   └── Spinner.tsx
│   │   ├── context/
│   │   │   ├── DeckContext.tsx
│   │   │   └── ToastContext.tsx
│   │   ├── hooks/
│   │   │   ├── useDecks.ts
│   │   │   └── useCards.ts
│   │   ├── pages/
│   │   │   ├── DeckList.tsx
│   │   │   └── DeckEditor.tsx
│   │   ├── utils/
│   │   │   └── mtgaFormat.ts   # MTGA text parsing/generation
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   └── vite.config.js
│
├── server/                  # Express backend
│   ├── routes/
│   │   ├── decks.js
│   │   ├── cards.js
│   │   └── importExport.js
│   ├── services/
│   │   ├── deckService.js    # File I/O for deck JSON
│   │   ├── cardService.js    # Scryfall fetch + cache logic
│   │   └── mtgaService.js    # Import/export format logic
│   ├── middleware/
│   │   └── rateLimiter.js    # Scryfall rate limit queue
│   └── index.js
│
├── data/                    # Runtime data (gitignored)
│   ├── decks/               # One JSON file per deck
│   └── cache/               # Scryfall card cache
│
├── ARCHITECTURE.md
├── TASKS.md
└── package.json             # Workspaces: client + server
```

---

## Firebase (Future / Optional)

When added, Firebase sits alongside the local JSON layer — it does not replace it.
The sync strategy: local file is always source of truth, Firebase is a mirror.

Changes needed when adding Firebase:
- `server/services/firebaseService.js` — sync on deck write
- `server/index.js` — initialize Firebase Admin SDK
- No frontend changes required (all sync is server-side)
- Environment variable: `FIREBASE_ENABLED=true`

This means the Firebase addition is a single PR touching only the server,
with zero risk to the existing local-first behavior.

---

## Environment Variables

```
# server/.env
PORT=3001
DATA_DIR=../data
SCRYFALL_RATE_LIMIT_MS=100   # min ms between Scryfall requests
FIREBASE_ENABLED=false        # set true when adding Firebase
```