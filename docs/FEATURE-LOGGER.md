# Feature Handoff: Game Logger

## Context

This is the MTG Deck Manager app — a local-first React + Express app for managing Magic: The Gathering decks. The frontend is React 18 + Vite + Tailwind CSS, state is managed via React Context + useReducer, and data is stored as JSON files on disk under `/data/`. The full architecture is documented in `ARCHITECTURE.md`.

The platform context: the player uses **MTG Arena (MTGA), Standard format, Bo1 only** — no sideboard is relevant. The active deck being tracked is a **Boros (red/white) goblin token aggro deck**.

---

## Goal

Add a **Game Logger** feature to the Deck Editor view (`/deck/:id`) that lets the player quickly log the result of each game they play with a deck. The logged data will feed future analytics and visualization features — but for this PR, **the goal is data capture only**. No charts or trend views yet.

### Design Philosophy

> An annoying form is an unused form.

The logger must be fast to fill out after a game. Win/Loss is the only truly required field. Everything else is optional and should feel low-friction. Use dropdowns and multi-selects over free text wherever the input domain is bounded. A player should be able to log the minimum ("I won") in under 5 seconds, and a richer entry in under 30.

---

## Data Model

Add a new file per deck: `/data/games/{deck-id}.json`

```json
{
  "deck_id": "uuid-v4",
  "games": [
    {
      "id": "uuid-v4",
      "logged_at": "2025-04-03T18:00:00Z",
      "result": "win",
      "turn_ended": 6,
      "opponent_colors": ["R", "G"],
      "opponent_archetype": "aggro",
      "opening_hand_feel": "good",
      "cards_in_hand": ["Impact Tremors", "Warleader's Call"],
      "tough_opponent_card": "",
      "notes": ""
    }
  ]
}
```

### Field Reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `result` | `"win" \| "loss"` | **Yes** | Primary action |
| `turn_ended` | integer 1–20 | No | When the game ended |
| `opponent_colors` | array of `W\|U\|B\|R\|G` | No | Multi-select, 0–5 values |
| `opponent_archetype` | enum | No | `aggro \| midrange \| control \| combo \| unknown` |
| `opening_hand_feel` | enum | No | `flood \| good \| screw` — mana feel, not specific cards |
| `cards_in_hand` | array of card names | No | Bounded to this deck's card list |
| `tough_opponent_card` | string | No | Free text, optional escape hatch |
| `notes` | string | No | General free text |

---

## UI / UX Requirements

### Placement

Add the Game Logger as a **collapsible panel** within the existing Deck Editor view (`/deck/:id`), below the card list. It should be collapsed by default with a clear "Log a Game" button to expand it.

### Form Layout

1. **Win / Loss — primary action, must be visually dominant.** Two large toggle buttons side by side. Selecting one opens the rest of the form below (progressive disclosure — don't show the detail fields until result is selected).

2. **Turn Ended** — number stepper or small number input, labeled "Game ended on turn". Range 1–20. Optional.

3. **Opponent Colors** — row of 5 color pip buttons (W/U/B/R/G), each toggleable, multi-select. Use MTG color initials. Optional.

4. **Opponent Archetype** — single-select dropdown: Aggro / Midrange / Control / Combo / Unknown. Optional.

5. **Opening Hand Feel** — single-select dropdown or 3-button toggle: Mana Flood / Good Hand / Mana Screw. Optional.

6. **Cards in Hand** — multi-select from this deck's card list (names only, sourced from the deck's `cards` array). Labeled "Key cards in opening hand". Optional. Limit selection to ~4 cards max.

7. **Tough Opponent Card** — single-line free text input. Labeled "Opponent card that caused problems". Optional.

8. **Notes** — small textarea. Optional.

9. **Submit button** — "Log Game". Clears the form on success and shows a brief toast confirmation. The panel can stay open for back-to-back logging.

### Behavior Notes

- Win/Loss is the only field that blocks submission — everything else can be empty.
- After submit, show a success toast ("Game logged") and reset the form.
- The game log list (see below) should update immediately after logging.

### Game Log List

Below the logger form, render a **simple chronological list** of past games for this deck. Each row shows:
- Win/Loss badge
- Turn ended (if present)
- Opponent colors as color pips (if present)
- Archetype (if present)
- Logged timestamp (relative: "2 hours ago")

This is a raw data view, not analytics. Keep it simple — a scrollable list is fine.

---

## Backend Requirements

### New API Routes (add to `server/routes/`)

| Method | Route | Description |
|---|---|---|
| GET | `/api/decks/:id/games` | Return all logged games for a deck |
| POST | `/api/decks/:id/games` | Append a new game entry |

### New Service

Create `server/services/gameService.js` to handle file I/O for `/data/games/{deck-id}.json`. Follow the same pattern as `deckService.js`:
- Load file if it exists, create it if not
- Append new game entries (do not overwrite existing)
- Return full game list on GET

---

## Frontend Requirements

### New Files

- `client/src/components/GameLogger.tsx` — the log form component
- `client/src/components/GameLogList.tsx` — the past games list component
- `client/src/hooks/useGames.ts` — data fetching hook for games (follow pattern of `useDecks.ts`)

### Integration Point

Import and render `<GameLogger />` and `<GameLogList />` in `client/src/pages/DeckEditor.tsx`, below the existing card list section. Pass the current `deck` object so the logger can populate the card multi-select from `deck.cards`.

---

## Out of Scope (Future Work)

- Analytics, charts, trend graphs — deferred
- MTGA log file parsing — deferred
- Filtering or searching the game log — deferred
- Firebase sync for game entries — follow the same deferred pattern as decks; architecture should support it without refactor

---

## Ordered Task List

### Task 1 — Data layer: game service + API routes
- Create `server/services/gameService.js` with `getGames(deckId)` and `addGame(deckId, gameData)` functions
- Create `/data/games/` directory (or ensure it is created on first write)
- Add `GET /api/decks/:id/games` and `POST /api/decks/:id/games` routes in a new `server/routes/games.js`
- Register the new router in `server/index.js`
- Test both routes manually (curl or Postman) before moving on

### Task 2 — Frontend hook: `useGames`
- Create `client/src/hooks/useGames.ts` following the pattern of `useDecks.ts`
- Expose `games`, `loading`, `error`, and `addGame(gameData)` 
- `addGame` should POST and then refresh the list

### Task 3 — GameLogger component
- Build `client/src/components/GameLogger.tsx`
- Implement progressive disclosure: Win/Loss buttons first, detail fields appear after selection
- Wire up all fields per the UI spec above
- Card multi-select should accept `cards: DeckCard[]` as a prop and derive names from it
- On submit: call `addGame`, show success toast (use existing `ToastContext`), reset form

### Task 4 — GameLogList component
- Build `client/src/components/GameLogList.tsx`
- Accepts `games` array as prop
- Renders chronological list (newest first) with win/loss badge, turn, colors, archetype, relative timestamp
- Empty state: "No games logged yet"

### Task 5 — Wire into DeckEditor
- Import and render `<GameLogger />` and `<GameLogList />` in `DeckEditor.tsx`
- Place below the existing card list
- Wrap in a collapsible panel with a "Log a Game" toggle button
- Pass `deck.cards` to `<GameLogger />` for the card multi-select
- Pass `games` from `useGames` to both components

### Task 6 — Smoke test end-to-end
- Open a deck, log a win with minimal data (result only)
- Log a second game with all fields filled
- Confirm both appear in the game log list
- Confirm data is persisted in `/data/games/{deck-id}.json`
- Confirm the form resets and toast appears after each submission