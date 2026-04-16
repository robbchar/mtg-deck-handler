# Deck History Design

**Date:** 2026-04-16
**Branch target:** `feat/deck-history`
**Status:** Approved

---

## Problem Statement

Decks evolve over time but the app only stores the current state. There is no way to see what a deck looked like previously, compare changes across sessions, or roll back an accidental or unsuccessful change. Players also want to correlate deck configuration with win/loss performance at a specific point in time.

---

## Goals

- Record snapshots of a deck's full state at meaningful points in time
- Show a history view within the deck editor listing all snapshots, newest first
- Show a diff summary for each snapshot (what changed vs. the previous snapshot)
- Show the W/L record as it stood at each snapshot point
- Allow reverting the deck to any past snapshot
- Keep storage overhead low by snapshotting at session boundaries, not on every keystroke

## Non-Goals (deferred)

- Granular per-action undo (replaying changesets without a specific operation — complex, deferred)
- Named/labelled snapshots (user-defined checkpoint labels — deferred)
- Per-deck or user-facing configurable snapshot window (deferred — single constant for now)
- Expandable game log per snapshot (deferred — only W/L count shown)
- Notes text diff in the change summary (notes changes are flagged as "notes changed" only — deferred)

---

## Data Model

### New Firestore subcollection

Path: `mtg-deck-handler/{deckId}/snapshots/{snapshotId}`

Mirrors the existing `games` subcollection pattern.

```ts
interface DeckSnapshot {
  id:        string        // Firestore auto-generated
  createdAt: string        // ISO timestamp
  cards:     CardEntry[]   // mainboard at time of snapshot
  sideboard: CardEntry[]   // sideboard at time of snapshot
  format:    string
  notes:     string
}
```

No label field. No reference to the parent deck ID (implicit from subcollection path).

### Derived data (not stored)

**W/L record at snapshot point** — computed client-side by filtering the deck's `games` array where `logged_at <= snapshot.createdAt` and counting wins/losses.

**Diff between snapshots** — computed client-side by diffing consecutive `cards` + `sideboard` arrays. A card diff entry is:

```ts
interface CardDiff {
  name:     string
  delta:    number   // positive = added, negative = removed
  section:  'mainboard' | 'sideboard'
}
```

Format and notes changes are also surfaced if they differ between consecutive snapshots.

---

## Server

### New routes

All routes are mounted under `/api/decks/:id/snapshots` and protected by `requireAuth`. Ownership is verified by confirming the parent deck's `userId` matches `req.user.uid` before any read or write.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/decks/:id/snapshots` | List all snapshots for a deck, ordered by `createdAt` descending |
| `POST` | `/api/decks/:id/snapshots` | Create a snapshot. Body: `{ cards, sideboard, format, notes }` |
| `POST` | `/api/decks/:id/snapshots/:snapshotId/revert` | Revert deck to snapshot state. Calls `updateDeck` with snapshot fields |

### New service

`server/services/snapshotService.js` — alongside `deckService.js`.

```
listSnapshots(deckId)         → Promise<DeckSnapshot[]>
createSnapshot(deckId, data)  → Promise<DeckSnapshot>
revertToSnapshot(deckId, snapshotId) → Promise<Deck>
```

`revertToSnapshot` reads the snapshot document, then calls the existing `updateDeck` with `{ cards, sideboard, format, notes }` from the snapshot. It does not delete the snapshot — the revert itself will create a new snapshot the next time the inactivity window fires.

---

## Client

### Snapshot timer (`DeckEditor`)

A second debounce timer runs alongside the existing 2-second auto-save debounce:

```ts
const SNAPSHOT_WINDOW_MS = 3 * 60 * 1000  // 3 minutes
```

**Behaviour:**
- Timer starts (or resets) on every deck change, the same way the auto-save timer does
- When the timer fires (3 min of inactivity), POST a snapshot with the current deck state
- A `beforeunload` listener fires a best-effort snapshot flush via `fetch` with `keepalive: true` if the window is still open when the user navigates away or closes the tab — guarding against the case where the timer hasn't fired yet. `keepalive: true` allows the request to outlive the page; failures are silently ignored

The constant lives in a single place in `DeckEditor.tsx` and is not exposed in the UI.

### New hook: `useSnapshots(deckId)`

Mirrors `useGames`. Located at `client/src/hooks/useSnapshots.ts`.

```ts
interface UseSnapshotsResult {
  snapshots:  DeckSnapshot[]
  loading:    boolean
  error:      string | null
  revert:     (snapshotId: string) => Promise<void>
}
```

`revert` calls the revert endpoint then re-fetches the deck via the existing `useDecks` mechanism (invalidate / refetch).

### New components

**`DeckHistory`** (`client/src/components/DeckHistory.tsx`)

The history tab panel. Calls `useSnapshots(deckId)` internally for snapshot data. Receives `games` as a prop (already loaded by `DeckEditor`). Props: `deckId`, `games`, `onRevert`. Renders a list of `SnapshotEntry` rows. Computes diffs and W/L counts internally before passing them down. Shows a loading spinner, empty state ("No history yet — changes will appear here after your first editing session"), and error state.

**`SnapshotEntry`** (`client/src/components/SnapshotEntry.tsx`)

One history row. Props: `snapshot`, `diff: CardDiff[]`, `formatChange`, `notesChanged`, `winsAtPoint`, `lossesAtPoint`, `onRevert`.

Layout:
- **Left:** Timestamp (e.g. "Apr 16 · 2:14 PM"), card count, `{W}W – {L}L` in green/red
- **Collapsed diff:** Aggregate counts (`+2 added · −4 removed`) with a `▸ show` expand toggle. If format changed, appended inline. If no changes vs previous snapshot (e.g. a revert created an identical state), shows "No card changes".
- **Expanded diff:** Named card chips, green for added, red for removed, per card name with quantity delta.
- **Right:** Revert button (indigo, confirms with a brief "Reverted" toast on success)

### `DeckEditor` changes

**Tab navigation** — added between the format selector and the game log section:

```
[ Current Deck ]  [ Deck History ]
```

Underline tab style: active tab has an indigo bottom border, inactive is muted grey. Tab state is `useState<'current' | 'history'>('current')` — local, not persisted.

**Conditional rendering:**
- `current` tab: existing mainboard, sideboard, game log sections (no change to existing layout)
- `history` tab: `DeckHistory` component fills the space; mainboard/sideboard/game log are unmounted

**Snapshot timer:** wired to the same change events that trigger auto-save (`handleCardChange`, `handleSideboardChange`, `handleNameChange`, `handleFormatChange`, `handleNotesChange`).

---

## Revert confirmation

No modal confirmation dialog — the Revert button triggers immediately and shows a toast ("Deck reverted to [timestamp]"). This matches the app's existing pattern (no confirmation dialogs for destructive-ish actions). The previous state is itself captured as a snapshot by the inactivity timer, so the revert is effectively undoable.

---

## Error handling

- Snapshot POST failures are silent (logged to console, no user-facing error) — a missed snapshot is not critical
- `beforeunload` snapshot failures are silently ignored — the browser may not honour async requests on unload
- Revert failures show an error toast: "Failed to revert deck. Please try again."
- History load failures show an inline error state in the `DeckHistory` panel

---

## Testing

### Server
- `snapshotService.test.js` — unit tests for `listSnapshots`, `createSnapshot`, `revertToSnapshot` (Firestore mock pattern matching existing service tests)
- `routes/snapshots.test.js` — route tests for all three endpoints (auth, ownership, success, error cases)

### Client
- `useSnapshots.test.tsx` — mirrors `useGames.test.tsx` structure
- `SnapshotEntry.test.tsx` — renders collapsed/expanded diff, W/L display, revert callback
- `DeckHistory.test.tsx` — empty state, loading state, list rendering, diff/W/L computation
- `DeckEditor.test.tsx` — tab switching shows/hides sections; snapshot timer fires after inactivity; `beforeunload` triggers snapshot

---

## File list (new or modified)

| File | Change |
|------|--------|
| `server/services/snapshotService.js` | New |
| `server/services/snapshotService.test.js` | New |
| `server/routes/snapshots.js` | New |
| `server/routes/snapshots.test.js` | New |
| `server/index.js` | Mount snapshot routes |
| `client/src/hooks/useSnapshots.ts` | New |
| `client/src/hooks/useSnapshots.test.tsx` | New |
| `client/src/components/DeckHistory.tsx` | New |
| `client/src/components/DeckHistory.test.tsx` | New |
| `client/src/components/SnapshotEntry.tsx` | New |
| `client/src/components/SnapshotEntry.test.tsx` | New |
| `client/src/types.ts` | Add `DeckSnapshot`, `CardDiff` interfaces |
| `client/src/pages/DeckEditor.tsx` | Add tabs, snapshot timer, `beforeunload` |
| `client/src/pages/DeckEditor.test.tsx` | Extend with tab + timer tests |
