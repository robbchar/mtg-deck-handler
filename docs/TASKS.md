# MTG Deck Manager — Task List

## How This File Works

Tasks are grouped into milestones. The agentic loop works through all tasks
within a milestone autonomously. At the end of each milestone a human reviews
before the next milestone begins.

Each task has:
- Clear acceptance criteria the QA agent can verify
- Explicit file(s) to produce
- Dependencies noted where relevant

Before tasks are complete
- the README must be updated with any recent changes or functionality
- tests covering the new/changed behavior must be added
- all tests MUST pass


**Status values:** `pending` | `in-progress` | `complete` | `blocked`

---

## Milestone 1: Project Scaffold + Data Layer
> Goal: Repo structure exists, server runs, deck CRUD works against JSON files.
> No frontend yet. Verified by hitting API routes directly.

### Task 1.1 — Project scaffold
**Status:** complete

Set up the monorepo structure with npm workspaces.

Produce:
- `package.json` (root, workspaces: client + server)
- `server/package.json` (express, uuid, cors, dotenv)
- `client/package.json` (react, vite, tailwind, react-router-dom, axios)
- `server/index.js` (Express app, mounts routes, serves on PORT from .env)
- `server/.env.example`
- `.gitignore` (excludes `data/`, `node_modules/`, `.env`)
- `data/decks/.gitkeep`
- `data/cache/.gitkeep`

Acceptance criteria:
- `npm install` runs without errors from root
- `node server/index.js` starts without errors
- Server responds to `GET /health` with `{ status: "ok" }`

---

### Task 1.2 — Deck service (file I/O)
**Status:** complete
**Depends on:** 1.1

Produce:
- `server/services/deckService.js`

Functions to implement:
- `listDecks()` — reads all files in `data/decks/`, returns array of deck metadata (id, name, format, notes, card_count, updated_at). Does NOT return full card arrays.
- `getDeck(id)` — reads and returns full deck JSON
- `createDeck(data)` — generates uuid, sets created_at/updated_at, writes file, returns deck
- `updateDeck(id, data)` — merges changes, updates updated_at, writes file, returns deck
- `deleteDeck(id)` — deletes file, returns `{ deleted: true }`

Acceptance criteria:
- Each function handles file-not-found gracefully (throws with clear message)
- `listDecks()` does not crash if `data/decks/` is empty
- All file writes use atomic pattern (write to `.tmp` then rename) to avoid corrupt files on crash

---

### Task 1.3 — Deck API routes
**Status:** complete
**Depends on:** 1.2

Produce:
- `server/routes/decks.js`

Implement all 5 routes from ARCHITECTURE.md (GET list, GET by id, POST, PUT, DELETE).

Acceptance criteria:
- All routes return proper HTTP status codes (200, 201, 404, 400, 500)
- POST validates required fields (name), returns 400 with message if missing
- PUT with unknown id returns 404
- All responses are JSON

---

### Task 1.4 — MTGA import/export service
**Status:** complete
**Depends on:** 1.2

Produce:
- `server/services/mtgaService.js`
- `server/routes/importExport.js`

MTGA format spec:
- One card per line: `{quantity} {card name}`
- Also supports full MTGA Arena export format: `{quantity} {card name} ({set}) {collector}`
- Collector token may be numeric, alphanumeric, variant-suffixed, or a promo symbol (★)
- Mainboard and sideboard separated by a blank line OR a "Sideboard"/"Commander" keyword
- Lines starting with `//` are comments, ignore them
- "Deck" / "Sideboard" / "Commander" section header keywords are handled
- Empty lines elsewhere are ignored

Functions:
- `exportDeck(deck)` — converts deck JSON to MTGA text string
- `parseMtgaText(text)` — parses MTGA text, returns `{ mainboard: [...], sideboard: [...], unknown: [...] }`

Routes:
- `POST /api/decks/:id/export` — returns `{ text: "4 Lightning Bolt\n..." }`
- `POST /api/import` — accepts `{ text, name, format }`, creates deck, returns deck JSON. Cards not found in Scryfall cache go into `unknown[]` on the deck object, do not block import.

Acceptance criteria:
- Round-trip test: export a deck then re-import it, card counts must match
- Parser handles Windows line endings (`\r\n`) and Unix (`\n`)
- Quantity of 0 or negative is treated as invalid, line is skipped

---

### ✅ MILESTONE 1 CHECKPOINT
**Human review before proceeding.**

Test checklist:
- [ ] `GET /api/decks` returns empty array on fresh install
- [ ] `POST /api/decks` with `{ name: "Test", format: "Standard" }` creates a file in `data/decks/`
- [ ] `GET /api/decks/:id` returns the created deck
- [ ] `PUT /api/decks/:id` with updated notes persists the change and `GET /api/decks` reflects the new notes field
- [ ] `DELETE /api/decks/:id` removes the file
- [ ] `POST /api/import` with valid MTGA text creates a deck
- [ ] `POST /api/decks/:id/export` returns correctly formatted text

---

## Milestone 2: Card Service + Scryfall Integration
> Goal: Card search and lookup work. Cache is populated on demand.
> Verified by searching for real cards and inspecting cache files.


### Task 2.01 — bugs/followup from 1
**Status:** complete
**Depends on:** all

Fixes applied:

**Bug 1 — `GET /api/decks` not reflecting updated notes:**
`listDecks()` in `deckService.js` now always includes the `notes` field in
every metadata entry (defaulting to `''`). The `PUT /api/decks/:id` route
calls `updateDeck()` which writes the merged deck atomically to disk; a
subsequent `GET /api/decks` reads from disk and surfaces the latest value.
Verified by both a mocked HTTP-level test in `decks.test.js` and a true E2E
test with a real temp filesystem in `e2e.test.js`.

**Bug 2 — MTGA Arena import format not handled:**
`parseMtgaText` now handles the full MTGA Arena export format:
- `Deck` / `Sideboard` / `Commander` section header keywords are recognised.
  `Deck` is silently skipped; `Sideboard`/`Commander` switch the active section.
- Card lines with the set/collector suffix
  `{quantity} {card name} ({set}) {collector}` are parsed correctly — the
  suffix is stripped and only the clean card name is stored.
- `MTGA_SUFFIX_RE` matches non-numeric collector tokens (`[\w★]+`) to handle
  promo cards (`★`), alphanumeric codes (`2017F`), and variant frames (`279a`).

**Acceptance criteria correction — "24-card" → "23-entry":**
The original requirement stated "Import correctly processes the provided
24-card sample deck". Counting the actual sample reveals **23 distinct card
lines** (entries) totalling 61 individual cards by quantity. The "24-card"
figure was a counting error in the original requirements. This document
constitutes the formal correction; all tests use `toHaveLength(23)` and the
README documents this clarification.

Acceptance criteria (corrected):
- `PUT /api/decks/:id` updates the deck and `GET /api/decks` returns the updated `notes` field
- `POST /api/import` successfully parses and imports MTGA Arena format starting with `Deck` header
- Import handles card lines in format `{quantity} {card name} ({set}) {collector}` extracting quantity and card name
- Import correctly processes the provided **23-entry** sample deck without errors
- After import via `POST /api/import`, the created deck can be retrieved via `GET /api/decks/:id` with all 23 card entries present

---

### Task 2.1 — Scryfall rate limiter
**Status:** complete
**Depends on:** 1.1

Produced:
- `server/middleware/rateLimiter.js`
- `server/middleware/rateLimiter.test.js`

Implements an async FIFO queue that enforces a minimum `SCRYFALL_RATE_LIMIT_MS`
delay between outgoing Scryfall requests. All Scryfall fetches in `cardService`
must route through the exported `scryfallLimiter` singleton.

Acceptance criteria:
- ✅ Rate limiter module created at `server/middleware/rateLimiter.js`
- ✅ Enforces minimum `SCRYFALL_RATE_LIMIT_MS` ms between outgoing requests
- ✅ Two simultaneous calls do not both fire immediately — second waits for delay
- ✅ Queue resolves promises in FIFO order
- ✅ Accepts configurable delay parameter for unit testing in isolation
- ✅ Unit tests verify rate limiting behaviour without hitting real Scryfall API

---

### Task 2.2 — Card service (cache + Scryfall fetch)
**Status:** complete
**Depends on:** 2.1

Produced:
- `server/services/cardService.js`
- `server/services/cardService.test.js`

Functions implemented:
- `getCard(scryfallId)` — cache-first lookup. Returns cached card if fresh (< 7 days). Otherwise fetches from Scryfall through the rate-limiter queue, saves to `data/cache/{id}.json` atomically, returns card.
- `searchCards(query)` — calls `api.scryfall.com/cards/search?q={query}&order=name`. Caches each card result individually. Returns array of card objects.
- `getCacheAge(scryfallId)` — returns age in ms of cached file, or null if not cached.

Acceptance criteria:
- ✅ Card service module created at `server/services/cardService.js`
- ✅ `getCard(scryfallId)` returns cached card if cache file exists and is less than 7 days old
- ✅ `getCard(scryfallId)` fetches from Scryfall API if cache is missing or stale (> 7 days), saves to `data/cache/{id}.json`, and returns card
- ✅ `searchCards(query)` calls `api.scryfall.com/cards/search` with query parameter and `order=name`
- ✅ `searchCards(query)` caches each individual card result from search response
- ✅ `searchCards(query)` returns array of card objects
- ✅ `getCacheAge(scryfallId)` returns age in milliseconds of cached file or null if not cached
- ✅ Second call for same card id does not hit Scryfall API (verified by mocking fetch)
- ✅ Stale cache older than 7 days triggers a re-fetch from Scryfall
- ✅ Scryfall 404 response (card not found) returns null without throwing an error
- ✅ Scryfall 429 response (rate limited) throws with `{ retryable: true, type: 'RATE_LIMITED' }`
- ✅ All Scryfall requests go through the rate limiter queue from Task 2.1

---

### Task 2.3 — Card API routes
**Status:** complete
**Depends on:** 2.2

Produced:
- `server/routes/cards.js`
- `server/routes/cards.test.js`

Routes:
- `GET /api/cards/search?q={query}` — returns array of card objects
- `GET /api/cards/:scryfallId` — returns single card object

Acceptance criteria:
- ✅ Card routes module created at `server/routes/cards.js`
- ✅ `GET /api/cards/search?q={query}` returns array of card objects from `cardService.searchCards`
- ✅ `GET /api/cards/search` with empty or missing query string returns HTTP 400 with error message
- ✅ `GET /api/cards/:scryfallId` returns single card object from `cardService.getCard`
- ✅ `GET /api/cards/:scryfallId` with unknown scryfall id returns HTTP 404
- ✅ `GET /api/cards/search` with query that returns no results returns empty array with HTTP 200 (not 404)
- ✅ All route responses are JSON format
- ✅ Routes are mounted on the Express app and accessible

---

### ✅ MILESTONE 2 CHECKPOINT
**Human review before proceeding.**

Test checklist:
- [ ] `GET /api/cards/search?q=lightning+bolt` returns results
- [ ] Repeat the same search — second call should be faster (cache hit)
- [ ] Check `data/cache/` — files should exist for searched cards
- [ ] `GET /api/cards/{valid-scryfall-id}` returns card data
- [ ] `GET /api/cards/fake-id` returns 404

---

## Milestone 3: React Frontend
> Goal: Full UI working against the running Express server.
> All deck operations work in the browser.

### Task 3.1 — Vite + Tailwind setup and routing
**Status:** complete
**Depends on:** Milestone 1 complete

Produce:
- `client/vite.config.js` (proxy `/api` to `localhost:3001`)
- `client/src/main.jsx`
- `client/src/App.jsx` (React Router with routes: `/` and `/deck/:id`)
- `client/tailwind.config.js`
- `client/index.html`

Acceptance criteria:
- `npm run dev` in client starts Vite dev server
- `/` and `/deck/test` routes render without errors (can be placeholder components)
- Tailwind utility classes apply correctly

---

### Task 3.2 — Deck context and data hooks
**Status:** complete
**Depends on:** 3.1

Produce:
- `client/src/context/DeckContext.jsx`
- `client/src/hooks/useDecks.js`
- `client/src/hooks/useCards.js`

`useDecks` exposes: `decks`, `loading`, `error`, `createDeck`, `updateDeck`, `deleteDeck`, `getDeck`
`useCards` exposes: `searchCards`, `getCard`, `searching`

All API calls go through axios to `/api/*` (proxied by Vite to Express).

Acceptance criteria:
- `useDecks` fetches deck list on mount
- `createDeck` optimistically updates local state before server confirms
- Errors from API calls are captured in `error` state, not thrown

---

### Task 3.3 — Deck list page
**Status:** complete
**Depends on:** 3.2

Produce:
- `client/src/pages/DeckList.jsx`
- `client/src/components/DeckCard.jsx`

DeckList shows: grid of DeckCard components, "New Deck" button, loading state, empty state.
DeckCard shows: deck name, format badge, card count, last updated date, delete button with confirmation.

Acceptance criteria:
- "New Deck" creates a deck with a default name and navigates to editor
- Delete shows a confirmation before calling API
- Empty state has a helpful message (not just a blank page)
- Loading state shown while fetching

---

### Task 3.4a — CardRow component
**Status:** complete
**Depends on:** 3.2

Produce:
- `client/src/components/CardRow.jsx`
- `client/src/components/CardRow.test.jsx`

A single presentational row used inside DeckEditor to represent one card entry.

Props: `{ card, quantity, onQuantityChange, onRemove }`
- `card`: `{ name, manaCost, typeLine }` — display only, no API calls
- `quantity`: current count (integer)
- `onQuantityChange(newQty)`: called when quantity changes
- `onRemove()`: called when the remove button is clicked

UI: quantity control (decrement button / number input / increment button), card name, mana cost, type line, remove button.

Acceptance criteria:
- Quantity input accepts direct typing and +/- buttons
- Setting quantity to 0 calls `onRemove` rather than showing a zero-count row
- Renders correctly with quantity 1–99
- `onRemove` is called when the remove button is clicked
- Component has a "renders without crashing" test
- All props are exercised in tests

---

### Task 3.4b — Deck editor page
**Status:** complete
**Depends on:** 3.4a

Produce:
- `client/src/pages/DeckEditor.jsx`
- `client/src/pages/DeckEditor.test.jsx`

`CardRow` (`client/src/components/CardRow.jsx`) already exists — import and use it, do not rewrite it.

Tasks: 
- verify if 3.4a was actually

Features:
- Load deck by `id` param via `useDecks` hook (`getDeck`)
- Editable deck name — click to edit inline, save on blur/Enter
- Format selector dropdown (values: `standard`, `pioneer`, `modern`, `legacy`, `vintage`, `commander`, `draft`)
- Mainboard section listing CardRow components
- Sideboard section listing CardRow components
- Notes textarea — saves on blur (no explicit button)
- "Add Card" button — sets `isSearchOpen` state to open `CardSearch` panel (already exists at `client/src/components/CardSearch.jsx`)
- Export button — copies MTGA-format text to clipboard via `mtgaFormat.js` (already exists at `client/src/utils/mtgaFormat.js`)
- Import button — opens `ImportModal` (already exists at `client/src/components/ImportModal.jsx`)
- Auto-save all changes via `updateDeck` debounced at 1 second

Acceptance criteria:
- Deck loads on mount and displays name, format, mainboard, sideboard, notes
- Name edits persist after page refresh
- Format changes persist after page refresh
- Adding/removing cards via CardSearch updates the deck
- Quantity changes persist after page refresh
- Removing all copies of a card removes the row
- Notes save without an explicit button press
- Component has a "renders without crashing" test wrapped in all required providers

---

### Task 3.5 — Card search panel
**Status:** complete
**Depends on:** 3.4b

Produced:
- `client/src/components/CardSearch.jsx`
- `client/src/components/CardResultItem.jsx`
- `client/src/components/CardSearch.test.jsx`

Slide-in panel (from right). Search input calls `/api/cards/search` with 300ms debounce.
Results show card image thumbnail, name, mana cost, type line.
Clicking a result prompts "Add to mainboard or sideboard?" then adds card.

Acceptance criteria:
- ✅ `CardSearch.jsx` component exists at `client/src/components/CardSearch.jsx`
- ✅ Panel slides in from the right side of the screen (translate-x-0/translate-x-full CSS transform)
- ✅ Search input calls `/api/cards/search` endpoint (via `useCards` hook)
- ✅ Search is debounced with 300ms delay
- ✅ Search results display card image thumbnail (small URI, with DFC fallback)
- ✅ Search results display card name
- ✅ Search results display mana cost
- ✅ Search results display type line
- ✅ Clicking a result prompts user to choose mainboard or sideboard (inline section picker)
- ✅ After selection, `onAddCard(card, section)` callback fires to add card to the chosen section
- ✅ Loading indicator displayed while searching (`search-loading` test id)
- ✅ No results state handled gracefully with "No cards found" message (`no-results` test id)
- ✅ Panel closes when Escape key is pressed
- ✅ Panel closes when clicking outside the panel (backdrop click)

---

### Task 3.6 — Import modal
**Status:** complete
**Depends on:** 3.4b

Produced:
- `client/src/components/ImportModal.jsx`
- `client/src/components/ImportModal.test.jsx`
- `client/src/components/ImportPreview.jsx`
- `client/src/utils/mtgaFormat.js`

Textarea for pasting MTGA text. "Preview" button parses client-side (no API
dry-run needed — `utils/mtgaFormat.js` mirrors the server parser exactly).
Shows parsed card count and any unparseable lines as warnings before confirming.
"Import Deck" button POSTs to `/api/import` and navigates to the editor on success.

Architecture decision: preview uses `parseMtgaText` from `utils/mtgaFormat.js`
client-side rather than a dry-run API call, since `POST /api/import` has no
dry-run mode in the spec. The client parser is kept in sync with the server parser.

Acceptance criteria:
- ✅ `ImportModal.jsx` component exists at `client/src/components/ImportModal.jsx`
- ✅ Modal contains a textarea for pasting MTGA text
- ✅ Preview button is present and triggers client-side parse-only preview
- ✅ Preview shows parsed card count (total, mainboard entries, sideboard entries)
- ✅ Preview shows any unparseable lines as amber warnings before confirming
- ✅ Import button is present and POSTs to `/api/import` when clicked
- ✅ Successful import navigates to the new deck's editor page (`/deck/:id`)
- ✅ Unknown cards are shown as warnings, not errors (import still works)
- ✅ Empty textarea shows validation message on preview or import attempt
- ✅ Missing deck name shows validation message on import attempt
- ✅ Modal closes via × button, backdrop click, or Escape key
- ✅ All form state resets when modal closes and reopens
- ✅ Full test coverage in `ImportModal.test.jsx`

---

### ✅ MILESTONE 3 CHECKPOINT
**Human review before proceeding.**

Test checklist:
- [x] Deck list loads and shows existing decks
- [x] Create new deck → lands in editor
- [x] Search for "Black Lotus" → results appear
- [x] Add card to mainboard → appears in editor
- [x] Edit quantity → change persists after refresh
- [ ] Edit notes → change persists after refresh - 
- [x] Export deck → valid MTGA text in clipboard
- [x] Import MTGA text → creates deck correctly
- [x] Delete deck from list → deck gone

---

### Task 3.6 — Bug fix
**Status:** pending

- Fix editing notes, time for auto save debounce is too short, should save also on navigation

---

## Milestone 4: Polish + Error Handling
> Goal: App is robust. Edge cases handled. Ready for real use.

### Task 4.1 — Error boundaries and API error handling
**Status:** pending

- React error boundary around DeckEditor and DeckList
- Toast notifications for API errors (use a simple custom hook, no library needed)
- Server: all unhandled errors return `{ error: message }` JSON, never HTML
- Server: request validation middleware for all POST/PUT routes

### Task 4.2 — Billing error handling in claude_client.py (swarm project)
**Status:** pending

In `claude_client.py`, catch `anthropic.APIStatusError` specifically.
If status code is 402 or error message contains "credit balance",
raise a clean `BillingError` with a message telling the user to top up at
console.anthropic.com. All other API errors re-raise as-is.

### Task 4.3 — Loading and empty states audit
**Status:** pending

Walk every page and component. Every async operation must have:
- Loading spinner or skeleton
- Empty state with helpful copy (not blank)
- Error state with retry option where applicable

### Task 4.4 — Scryfall image handling
**Status:** pending

Cards without images (some older cards) should show a placeholder.
Large card images load lazily (use `loading="lazy"` on img tags).
Card images in search results use `small` image URI, card detail uses `normal`.

### ✅ MILESTONE 4 CHECKPOINT — SHIP IT
**Final human review.**

- [ ] Introduce an intentional API error — UI shows toast, doesn't crash
- [ ] Open app with no decks — empty state looks good
- [ ] Add a card with no image — placeholder shown
- [ ] Kill the server mid-session — error handled gracefully
- [ ] Run through a full deck creation → edit → export → delete flow

---

## Agentic Loop Prompt

Use this prompt when invoking the swarm against this task list:

```
You are working on the MTG Deck Manager project. Read ARCHITECTURE.md for the
full technical spec, then read TASKS.md for your work queue.

Rules:
1. Work through tasks in order within the current milestone. Do not skip tasks.
2. Do not start the next milestone — stop and output "MILESTONE COMPLETE: {name}"
   when you finish the last task in a milestone and all its acceptance criteria pass.
3. For each task: read the acceptance criteria first, write the code, then verify
   each criterion before marking the task complete.
4. If a task depends on another that isn't complete, stop and output
   "BLOCKED: Task {x} requires Task {y} to be complete first."
5. Keep TASKS.md updated — change task status to "in-progress" when you start
   and "complete" when done.
6. Do not modify ARCHITECTURE.md. If you find an ambiguity, make a reasonable
   decision and add a comment in the code explaining your choice.

Start by reading both documents, then tell me which milestone you are working on
and which task you are starting with.
```