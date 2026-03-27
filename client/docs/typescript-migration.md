# Client TypeScript Migration

**Branch:** `feat/client-typescript-migration`
**Scope:** Client only (`client/`) — server remains JavaScript

---

## Problem Statement

The client codebase is JavaScript with JSDoc annotations. Several bugs stem from implicit, unverified data shapes moving through the app:

1. **Missing card data on add** — `DeckEditor` adds cards from search results without copying `mana_cost`/`type_line`, so those fields are lost in storage and never rendered by `CardRow`.
2. **Inconsistent field names** — Scryfall returns `mana_cost`/`type_line` (snake_case); `CardRow` expects `manaCost`/`typeLine` (camelCase); there is no canonical shape enforced anywhere.
3. **Ambiguous reducer action payloads** — `DeckAction.payload` is typed as `unknown`, meaning any caller can dispatch malformed actions with no compile-time feedback.

Migrating to TypeScript with a canonical shared types file will surface these bugs at compile time, establish a single source of truth for data shapes, and make the codebase significantly more maintainable.

---

## Goals

- Migrate all client source and test files from JS/JSX to TS/TSX
- Define canonical types for `Deck`, `DeckMetadata`, `CardEntry`, `ScryfallCard`, and all reducer actions
- Fix the three logic bugs identified above as part of the migration
- All existing tests continue to pass after migration
- No change to the server or the API contract

---

## Out of Scope

- Server TypeScript migration
- New features or UI changes
- Changes to the API contract
- End-to-end tests

---

## Canonical Types (to be defined in `client/src/types.ts`)

```ts
// Stored card entry — snake_case to match server persistence
export interface CardEntry {
  name: string
  quantity: number
  scryfall_id: string | null
  section: 'mainboard' | 'sideboard'
  mana_cost?: string
  type_line?: string
}

// Full deck as returned by GET /api/decks/:id
export interface Deck {
  id: string
  name: string
  format: string
  notes: string
  cards: CardEntry[]
  sideboard: CardEntry[]
  tags?: string[]
  created_at: string
  updated_at: string
  unknown?: string[]
}

// Slim shape returned by GET /api/decks (list)
export interface DeckMetadata {
  id: string
  name: string
  format: string
  notes: string
  card_count: number
  updated_at: string
}

// Scryfall card as returned by the API (fields used by the client)
export interface ScryfallCard {
  id: string
  name: string
  mana_cost: string
  type_line: string
  image_uris?: { small: string }
  card_faces?: Array<{ image_uris?: { small: string } }>
}

// Discriminated union for all reducer actions
export type DeckAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: DeckMetadata[] }
  | { type: 'FETCH_ERROR'; payload: string }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'ADD_DECK'; payload: DeckMetadata }
  | { type: 'REPLACE_TEMP_DECK'; payload: { tempId: string; deck: DeckMetadata } }
  | { type: 'ROLLBACK_ADD'; payload: string }
  | { type: 'UPDATE_DECK'; payload: DeckMetadata }
  | { type: 'REMOVE_DECK'; payload: string }
  | { type: 'ROLLBACK_REMOVE'; payload: DeckMetadata }
```

---

## Implementation Plan

### Phase 1 — Config & Tooling

- [x] Add `typescript`, `@types/react`, `@types/react-dom`, `@types/react-router-dom`, `@types/axios` to `client/package.json`
- [x] Create `client/tsconfig.json` with strict mode, JSX preserve, path aliases
- [x] Update `client/vite.config.js` if needed for TS support (Vite supports TS out of the box via esbuild)

### Phase 2 — Canonical Types

- [x] Create `client/src/types.ts` with all interfaces and the `DeckAction` discriminated union as defined above

### Phase 3 — Context & Hooks (foundational, no UI deps)

- [x] `context/DeckContext.jsx` → `.tsx` — apply `DeckState`, `DeckAction`, `DeckMetadata`
- [x] `hooks/useDecks.js` → `.ts` — type all parameters and return values against `Deck`, `DeckMetadata`
- [x] `hooks/useCards.js` → `.ts` — type `ScryfallCard` return values
- [x] `utils/mtgaFormat.js` → `.ts`
- [x] `utils/index.ts` — already `.ts`, add explicit return type

### Phase 4 — Components

- [x] `components/CardRow.jsx` → `.tsx` — use `CardEntry` for card prop; fix field names to snake_case
- [x] `components/CardResultItem.jsx` → `.tsx` — use `ScryfallCard`
- [x] `components/CardSearch.jsx` → `.tsx`
- [x] `components/DeckCard.jsx` → `.tsx` — use `DeckMetadata`
- [x] `components/ImportModal.jsx` → `.tsx`
- [x] `components/ImportPreview.jsx` → `.tsx`
- [x] `components/CloseButton.jsx` → `.tsx`
- [x] `components/Spinner.jsx` → `.tsx`

### Phase 5 — Pages & Bug Fixes

- [x] `pages/DeckList.jsx` → `.tsx`
- [x] `pages/DeckEditor.jsx` → `.tsx`
  - **Fix:** when adding a card from search, copy `mana_cost` and `type_line` from `ScryfallCard` into the `CardEntry`
  - **Fix:** standardize all card field references to snake_case (`mana_cost`, `type_line`)

### Phase 6 — Entry Points & Test Files

- [x] `App.jsx` → `.tsx`
- [x] `main.jsx` → `.tsx`
- [x] All `.test.jsx`/`.test.js` → `.test.tsx`/`.test.ts`
- [x] Run full test suite — 233/234 pass (1 pre-existing timeout failure unrelated to migration)

---

## Definition of Done

- `yarn --cwd client build` completes with zero TypeScript errors
- All existing tests pass
- No `any` types introduced (use `unknown` at boundaries if needed)
- `DeckEditor` correctly persists `mana_cost`/`type_line` when adding a card from search
- `CardRow` renders mana cost and type line for newly added cards
