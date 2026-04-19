# MTG Deck Manager

A Magic: The Gathering deck management app with a React frontend and an Express API backed by Firebase Firestore. Supports full deck editing, game logging, card search via Scryfall, MTGA import/export, and a snapshot-based deck history that lets you track how your deck has evolved over time and restore any past version.

## Project Structure

```
mtg-deck-manager/
├── client/          # React + Vite frontend
├── server/          # Express API server
│   ├── routes/      # Route handlers
│   │   ├── decks.js         # Deck CRUD routes
│   │   ├── cards.js         # Scryfall proxy routes
│   │   ├── games.js         # Game log routes
│   │   ├── snapshots.js     # Deck history snapshot routes
│   │   └── importExport.js  # MTGA import/export routes
│   ├── services/    # Business logic
│   │   ├── db.js            # Firebase Admin SDK initialisation
│   │   ├── deckService.js   # Deck CRUD — Firestore reads/writes
│   │   ├── gameService.js   # Game log CRUD
│   │   ├── snapshotService.js # Snapshot create/list/revert + timeline pruning
│   │   ├── cardService.js   # Scryfall cache-first lookup + search
│   │   └── mtgaService.js   # MTGA text import/export format conversion
│   ├── middleware/  # Shared middleware
│   │   ├── rateLimiter.js   # Async FIFO queue for Scryfall rate limiting
│   │   └── validate.js      # Request validation middleware for POST/PUT routes
│   ├── index.js     # App entry point
│   └── .env.example # Environment variable template
├── data/            # Runtime data — gitignored, auto-created on startup
│   └── cache/       # Scryfall card response cache (7-day TTL)
└── docs/            # Architecture and task documentation
```

## Quick Start

### 1. Install all dependencies

```bash
npm install
```

### 2. Configure the server

```bash
cp server/.env.example server/.env
# Default values work out of the box — edit only if you need non-standard ports
```

### 3. Start both server and client

```bash
# Start both concurrently (recommended for development)
npm run dev

# Or start the server only
node server/index.js
```

The server starts on **http://localhost:3001** by default.
The Vite dev server starts on **http://localhost:5173** and proxies `/api`
requests to the Express backend automatically.

The `data/decks/` and `data/cache/` directories are created automatically on
first boot — no manual setup required.

### 4. Verify it's running

```bash
curl http://localhost:3001/health
# → {"status":"ok"}
```

## Environment Variables

All variables live in `server/.env` (copy from `server/.env.example`):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Express listen port |
| `DATA_DIR` | `../data` | Path to the data directory (relative to `server/`) |
| `SCRYFALL_RATE_LIMIT_MS` | `100` | Minimum ms between Scryfall requests (≤ 10 req/s) |

## Running Tests

```bash
# All workspace tests from the repo root
npm test

# Server tests only
cd server && npm test

# Client tests only
cd client && npm test
```

## Frontend

The React frontend is built with Vite and uses Tailwind CSS for styling.
All state is managed via React Context + `useReducer` — no external state
library. API calls go through axios, proxied by Vite to the Express backend.

### Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `DeckList` | Browse all decks, create new, import from MTGA |
| `/deck/:id` | `DeckEditor` | Edit a specific deck (cards, notes, format) |

### Key Components

#### `ErrorBoundary`

Located at `client/src/components/ErrorBoundary.tsx`.

Wraps each page in `App.tsx`. Catches uncaught JavaScript errors in the child
component tree and renders a fallback UI with a "Try again" button and a "Back
to decks" link instead of crashing the entire page.

#### `ToastContainer` + `useToast`

Located at `client/src/components/ToastContainer.tsx` and
`client/src/hooks/useToast.ts`.

Lightweight in-app notification system with no external dependencies. API errors
surface as toast notifications in the bottom-right corner. Toasts auto-dismiss
after 4 seconds and are also manually dismissible via the × button.

Usage: consume `addToast` via `useToastContext()` from `context/ToastContext` in
any component wrapped by `ToastProvider`.

#### `CardImagePlaceholder`

Located at `client/src/components/CardImagePlaceholder.tsx`.

Rendered in place of a broken or missing card image. Displays a styled MTG
card-back motif (diamond + oval SVG) on a dark gradient background. Used by
`CardResultItem` for both the thumbnail position and the section-picker preview.

#### `CardResultItem`

Located at `client/src/components/CardResultItem.tsx`.

Renders a single search result with:
- **Thumbnail** using the Scryfall `small` image URI (with `loading="lazy"`)
- **Fallback** to `CardImagePlaceholder` when image is missing or fails to load
- **DFC support** — falls back to `card_faces[0].image_uris` for double-faced cards
- **Section picker** — inline picker showing `normal`-size preview and section buttons

#### `ImportModal`

Located at `client/src/components/ImportModal.jsx`.

Opens from the **Import Deck** button on the deck list page. Accepts MTGA
Arena-format deck text and creates a new deck via `POST /api/import`.

Features:
- **Textarea** for pasting MTGA-format or full Arena export text
- **Deck Name** input (required before import)
- **Format** input (optional — e.g. "Standard", "Modern")
- **Preview button** — parses the text client-side (no API call) and shows:
  - Total card count and per-section entry counts
  - Any unparseable lines as amber warnings (import still works)
  - Empty-parse notice if no valid card lines are found
- **Import Deck button** — POSTs to `/api/import` and navigates to the new
  deck's editor on success
- Unknown/unresolvable card names are shown as warnings, never errors
- Validates that the textarea and deck name are non-empty before submitting
- Dismissible via the × button, clicking the backdrop, or pressing Escape
- All form state resets when the modal closes

**Architecture note on preview:** The API does not expose a dry-run mode, so
preview parsing happens entirely client-side using `utils/mtgaFormat.js`, which
mirrors the server-side `mtgaService.parseMtgaText` parser. This gives accurate
previews with zero network round-trips.

#### `ImportPreview`

Located at `client/src/components/ImportPreview.jsx`.

Rendered inside `ImportModal` when a preview has been generated. Shows the
card count summary and any unparseable lines (amber warning list).

#### `DeckHistory`

Located at `client/src/components/DeckHistory.tsx`.

History tab panel inside `DeckEditor`. Calls `useSnapshots(deckId)` internally. Receives `games` and `currentState` as props from `DeckEditor`. Renders:
- **Working changes** — a dashed pending entry showing unsaved edits vs the latest committed snapshot, with an expand/collapse chip list. Appears whenever the live deck state differs from the most recent snapshot. Also shown for first-time decks that have cards but no snapshots yet.
- **Snapshot entries** — a `SnapshotEntry` per committed snapshot, connected by visual upward arrows, newest first.
- Loading, empty, and error states.

W/L counts and card diffs are computed entirely client-side — no extra network calls.

#### `SnapshotEntry`

Located at `client/src/components/SnapshotEntry.tsx`.

One row in the history timeline. Props: `snapshot`, `diff`, `formatChange`, `notesChanged`, `winsAtPoint`, `lossesAtPoint`, `onRevert`, `isCurrent`.

- **Left:** Timestamp, card count, `{W}W {L}L` record
- **Collapsed diff:** `+N added · −M removed` aggregate with a `▸ show` toggle
- **Expanded diff:** Named chips (green = added, red = removed) with quantity deltas
- **Right:** Either a `Restore` button (indigo) or a muted `Current` badge when `isCurrent` is true

#### `CardSearch`

Located at `client/src/components/CardSearch.tsx`.

Slide-in panel for searching and adding cards to a deck. Search fires on form
submit and is debounced at 300 ms on input change. Displays results using
`CardResultItem`. Errors surface with a Retry button. Accepts `sectionNames`
so the inline section picker is not hardcoded to mainboard/sideboard.

### Client-Side Utilities

#### `utils/mtgaFormat.js` — `parseMtgaText(text)`

Parses MTGA deck text on the client without a network call. Supports:

- Simple format: `4 Lightning Bolt`
- Full Arena export format: `4 Lightning Bolt (LEA) 161` (set/collector stripped)
- Section headers: `Deck`, `Sideboard`, `Commander`
- Comment lines starting with `//`
- Windows (`\r\n`) and Unix (`\n`) line endings

Returns `{ mainboard, sideboard, unknownLines }` — unparseable lines go into
`unknownLines` rather than silently being dropped, so the UI can surface them
as warnings.

## Rate Limiter (`server/middleware/rateLimiter.js`)

An async FIFO queue that enforces a configurable minimum delay between outgoing
Scryfall API requests. All Scryfall fetches in `cardService` must be routed
through this queue so the 10 req/s hard limit is enforced server-wide.

```js
const { scryfallLimiter } = require('../middleware/rateLimiter');

// Inside cardService — every Scryfall fetch goes through the queue:
const data = await scryfallLimiter.enqueue(() =>
  fetch('https://api.scryfall.com/cards/named?exact=Lightning+Bolt')
    .then((r) => r.json())
);
```

The delay is read from `SCRYFALL_RATE_LIMIT_MS` at startup (default `100` ms).
The `RateLimiter` class is also exported for unit testing with an isolated,
custom-delay instance — no live API required.

| Export | Type | Description |
|---|---|---|
| `RateLimiter` | class | Instantiate with `new RateLimiter(delayMs)` |
| `scryfallLimiter` | instance | Singleton used by production code |

### Behaviour

- The first request in a new queue fires immediately (no previous request to wait for).
- Subsequent requests wait until `delayMs` has elapsed since the previous dispatch.
- Promises resolve in the exact order they were enqueued (FIFO).
- Errors thrown or rejected by an enqueued function reject only that promise;
  the queue continues draining normally.

## Validation Middleware (`server/middleware/validate.js`)

Request validation middleware applied to all POST and PUT routes. Returns HTTP
400 with a JSON error message when required fields are missing or invalid.

| Middleware | Applied to | Validates |
|---|---|---|
| `validateDeckName` | `POST /api/decks`, `PUT /api/decks/:id` | `name` required on POST; must be non-empty string if provided on PUT |
| `validateImport` | `POST /api/import` | `text` and `name` required, both non-empty strings |

## Card Service (`server/services/cardService.js`)

Cache-first Scryfall card lookup. All outgoing requests are serialised through
the shared rate-limiter queue (10 req/s hard limit). Cache files are stored at
`data/cache/{scryfallId}.json` and expire after 7 days.

| Function | Description |
|---|---|
| `getCard(scryfallId)` | Returns a cached card if fresh (< 7 days). Otherwise fetches from Scryfall, writes to `data/cache/{id}.json` atomically, and returns the card. Returns `null` for 404; throws a retryable error (`type: 'RATE_LIMITED'`) for 429. |
| `searchCards(query)` | Calls `api.scryfall.com/cards/search?q={query}&order=name`. Caches each result card individually. Returns an array of card objects (empty array when no matches). Throws a retryable error on 429. |
| `getCacheAge(scryfallId)` | Returns the age in milliseconds of the cached file, or `null` if not cached. Useful for debugging. |

### Cache-first flow

```
getCard(id)
  └─ cache file exists AND age < 7 days?
       ├─ yes → return from disk (no network call)
       └─ no  → scryfallLimiter.enqueue(fetch)
                  ├─ 200 → atomicWrite(cache) → return card
                  ├─ 404 → return null
                  └─ 429 → throw { retryable: true, type: 'RATE_LIMITED' }
```

### Retryable errors

HTTP 429 responses produce an error with two extra properties:

```js
try {
  const card = await getCard(id);
} catch (err) {
  if (err.type === 'RATE_LIMITED') {
    // err.retryable === true — safe to retry after a delay
  }
}
```

## Deck Service (`server/services/deckService.js`)

Provides all file I/O for deck management. Each deck is stored as a single JSON
file at `data/decks/{uuid}.json`. All writes use an atomic tmp-then-rename
pattern to prevent corrupt files on crash.

| Function | Description |
|---|---|
| `listDecks()` | Returns an array of deck metadata (`id`, `name`, `format`, `notes`, `card_count`, `updated_at`). Never includes full card arrays. Safe on empty directory. |
| `getDeck(id)` | Returns the full deck JSON. Throws `Error: Deck not found: {id}` if missing. |
| `createDeck(data)` | Generates a UUID v4 id, sets `created_at`/`updated_at`, writes file, returns deck. |
| `updateDeck(id, data)` | Merges `data` into the existing deck, bumps `updated_at`, writes file, returns updated deck. Throws if not found. |
| `deleteDeck(id)` | Deletes the deck file, returns `{ deleted: true }`. Throws if not found. |

## MTGA Service (`server/services/mtgaService.js`)

Converts between internal deck JSON and the plain-text format used by
Magic: The Gathering Arena for import/export.

| Function | Description |
|---|---|
| `exportDeck(deck)` | Converts a deck object to an MTGA text string. Mainboard first, then a blank line, then sideboard. Cards with quantity ≤ 0 are omitted. |
| `parseMtgaText(text)` | Parses MTGA text and returns `{ mainboard, sideboard, unknown }`. Handles `\r\n` and `\n`. Ignores comment lines (`//`) and skips invalid quantities. |

### MTGA Text Format

```
4 Lightning Bolt
2 Mountain
20 Plains

2 Smash to Smithereens
3 Rest in Peace
```

- One card per line: `{quantity} {card name}`
- Mainboard and sideboard separated by a **blank line**
- Lines starting with `//` are comments and are ignored
- Quantity of 0 or less causes the line to be skipped

## API

| Method | Route | Description | Status |
|--------|-------|-------------|--------|
| `GET` | `/health` | Server health check | ✅ Live |
| `GET` | `/api/decks` | List all decks | ✅ Live |
| `GET` | `/api/decks/:id` | Get full deck | ✅ Live |
| `POST` | `/api/decks` | Create deck | ✅ Live |
| `PUT` | `/api/decks/:id` | Update deck | ✅ Live |
| `DELETE` | `/api/decks/:id` | Delete deck | ✅ Live |
| `POST` | `/api/import` | Import MTGA-format text as a new deck | ✅ Live |
| `POST` | `/api/decks/:id/export` | Export deck as MTGA-format text | ✅ Live |
| `GET` | `/api/cards/search?q=` | Search Scryfall (cached) | ✅ Live |
| `GET` | `/api/cards/:id` | Get single card (cache-first) | ✅ Live |
| `GET` | `/api/decks/:id/snapshots` | List deck snapshots (newest first) | ✅ Live |
| `POST` | `/api/decks/:id/snapshots` | Create a snapshot of current deck state | ✅ Live |
| `POST` | `/api/decks/:id/snapshots/:snapshotId/revert` | Revert deck to a past snapshot | ✅ Live |
| `DELETE` | `/api/decks/:id/snapshots/after/:snapshotId` | Prune snapshots newer than a given snapshot (used after revert) | ✅ Live |

### Deck endpoints

#### `GET /api/decks`
Returns an array of deck metadata (no card arrays).

```bash
curl http://localhost:3001/api/decks
# → [{ "id": "...", "name": "Mono Red", "format": "Standard", "card_count": 20, "updated_at": "..." }]
```

#### `GET /api/decks/:id`
Returns the full deck JSON including `cards` and `sideboard`.

```bash
curl http://localhost:3001/api/decks/<uuid>
# 200 → full deck object
# 404 → { "error": "Deck not found: <uuid>" }
```

#### `POST /api/decks`
Creates a new deck. `name` is required.

```bash
curl -X POST http://localhost:3001/api/decks \
  -H 'Content-Type: application/json' \
  -d '{ "name": "Mono Red Burn", "format": "Standard" }'
# 201 → created deck object
# 400 → { "error": "name is required and must be a non-empty string" }
```

#### `PUT /api/decks/:id`
Merges the request body into the existing deck. `id` and `created_at` are immutable.

```bash
curl -X PUT http://localhost:3001/api/decks/<uuid> \
  -H 'Content-Type: application/json' \
  -d '{ "notes": "Updated notes" }'
# 200 → updated deck object
# 404 → { "error": "Deck not found: <uuid>" }
```

#### `DELETE /api/decks/:id`

```bash
curl -X DELETE http://localhost:3001/api/decks/<uuid>
# 200 → { "deleted": true }
# 404 → { "error": "Deck not found: <uuid>" }
```

### Card endpoints

#### `GET /api/cards/search?q={query}`
Searches Scryfall using the provided query string. Results are cached
individually at `data/cache/{id}.json` (7-day TTL). A query that matches
no cards returns an empty array — not a 404.

```bash
curl "http://localhost:3001/api/cards/search?q=lightning+bolt"
# 200 → [ { "id": "...", "name": "Lightning Bolt", ... }, ... ]
# 200 → []   (no matches — empty array, not 404)
# 400 → { "error": "query parameter q is required" }   (missing/blank q)
# 429 → { "error": "Scryfall rate limit exceeded. Please retry shortly." }
```

#### `GET /api/cards/:scryfallId`
Returns a single card by Scryfall UUID, using the local cache when fresh.

```bash
curl http://localhost:3001/api/cards/5f8287b1-5bb6-5f4c-ad17-316a40d5bb0c
# 200 → { "id": "...", "name": "Lightning Bolt", ... }
# 404 → { "error": "Card not found: <id>" }
# 429 → { "error": "Scryfall rate limit exceeded. Please retry shortly." }
```

### Import / Export endpoints

#### `POST /api/import`
Parses MTGA-format text and creates a new deck. `text` and `name` are required.
`format` is optional.

Accepts both simple format (`4 Lightning Bolt`) and full Arena export format
(`4 Lightning Bolt (LEA) 161`). The `Deck`, `Sideboard`, and `Commander`
section header keywords are handled automatically.

Cards not yet resolved via Scryfall appear in the `unknown[]` array on the
returned deck — this does not block the import.

```bash
curl -X POST http://localhost:3001/api/import \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "4 Lightning Bolt\n2 Mountain\n\n2 Smash to Smithereens",
    "name": "Mono Red Burn",
    "format": "Standard"
  }'
# 201 → created deck object (includes unknown[] array)
# 400 → { "error": "text is required and must be a non-empty string" }
# 400 → { "error": "name is required and must be a non-empty string" }
```

#### `POST /api/decks/:id/export`
Returns the deck formatted as MTGA plain text.

```bash
curl -X POST http://localhost:3001/api/decks/<uuid>/export
# 200 → { "text": "4 Lightning Bolt\n2 Mountain\n\n2 Smash to Smithereens" }
# 404 → { "error": "Deck not found: <uuid>" }
```

## Deck JSON Schema

```json
{
  "id": "uuid-v4",
  "name": "Mono Red Burn",
  "format": "Standard",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-20T14:22:00Z",
  "notes": "Main strategy: go fast, burn face.",
  "activeSnapshotId": "snapshot-uuid",
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
  "unknown": [],
  "tags": ["aggro", "burn", "red"]
}
```

`activeSnapshotId` identifies which snapshot represents the current deck state. It is set server-side whenever a new snapshot is created or the deck is reverted to a past snapshot, and used client-side to render the "Current" badge in the history timeline.

The `unknown` array contains the names of cards that could not be resolved
against the Scryfall cache at import time. It is present on imported decks and
will be empty once all cards are resolved (Task 2.2+).

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full technical spec,
data models, caching strategy, and planned frontend structure.

## Bug Fixes

### Notes auto-save: data loss on navigation (Task 3.6)

**Problem:** The notes auto-save debounce timer was set to 1 second, which was
short enough that the `updateDeck` API could be called while the user was still
actively typing. More critically, when the user navigated away from the
`DeckEditor` page, the React cleanup effect only called `clearTimeout` —
discarding the pending save without ever calling `updateDeck`. Any notes edits
made within the debounce window before navigation were silently lost.

**Fix:**
1. **Debounce increased to 2 seconds** — reduces unnecessary API calls during
   active typing.
2. **Flush on unmount** — the cleanup `useEffect` now checks `pendingRef` and
   calls `updateDeck` synchronously before the component is torn down, ensuring
   no in-flight changes are ever discarded on navigation. A `updateDeckRef` is
   kept in sync via a layout-free effect so the cleanup always has access to the
   latest `updateDeck` function without creating stale closures.
