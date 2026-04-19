# Deck History Design

**Date:** 2026-04-16
**Branch target:** `feat/deck-history`
**Status:** Implemented — see implementation notes below for deviations from this spec

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
  name:             string
  delta:            number   // positive = added, negative = removed
  section:          'mainboard' | 'sideboard'
  previousQuantity: number   // 0 means brand-new card; used to label "additional" copies
}
```

Format and notes changes are also surfaced if they differ between consecutive snapshots.

**`activeSnapshotId` (not in original spec):** A field on the deck document itself, set server-side on every `createSnapshot` and `revertToSnapshot` call. Persists across page reloads. The client reads it on deck load and passes it as a prop to `DeckHistory`, which uses it to mark the "Current" badge — avoiding brittle client-side state that resets on component remount.

---

## Server

### New routes

All routes are mounted under `/api/decks/:id/snapshots` and protected by `requireAuth`. Ownership is verified by confirming the parent deck's `userId` matches `req.user.uid` before any read or write.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/decks/:id/snapshots` | List all snapshots for a deck, ordered by `createdAt` descending |
| `POST` | `/api/decks/:id/snapshots` | Create a snapshot. Body: `{ cards, sideboard, format, notes }` |
| `POST` | `/api/decks/:id/snapshots/:snapshotId/revert` | Revert deck to snapshot state. Calls `updateDeck` with snapshot fields + `activeSnapshotId` |
| `DELETE` | `/api/decks/:id/snapshots/after/:snapshotId` | **Added post-spec:** Delete all snapshots created after `snapshotId`. Called by client after a successful revert to prune the now-invalidated future checkpoints. |

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
  snapshots:       DeckSnapshot[]
  loading:         boolean
  error:           string | null
  revertSnapshot:  (snapshotId: string) => Promise<Deck | null>
}
```

`revertSnapshot` (renamed from `revert` in the spec) calls the revert endpoint and returns the updated `Deck` object (or `null` on failure). The caller (`DeckHistory` → `DeckEditor`) uses the returned deck to update `activeSnapshotId` state and the deck editor fields. The hook also re-fetches snapshots after a successful revert to refresh the timeline.

### New components

**`DeckHistory`** (`client/src/components/DeckHistory.tsx`)

The history tab panel. Calls `useSnapshots(deckId)` internally for snapshot data. Receives `games`, `currentState`, `activeSnapshotId`, and `onRevert` as props from `DeckEditor`. Renders:
- A pending "Working changes" entry (dashed border) when `currentState` differs from the latest snapshot — covers the gap between edits and the next checkpoint. Also shown for fresh decks with cards but no snapshots yet.
- A list of `SnapshotEntry` rows connected by upward-arrow `Connector` elements.
- Loading, empty ("No history yet — changes will appear here after your first editing session"), and error states.
- Empty state is suppressed when there are pending changes (so a first-time user with unsaved cards still sees the pending entry, not "no history").

**`SnapshotEntry`** (`client/src/components/SnapshotEntry.tsx`)

One history row. Props: `snapshot`, `diff: CardDiff[]`, `formatChange`, `notesChanged`, `winsAtPoint`, `lossesAtPoint`, `onRevert`, `isCurrent`.

Layout:
- **Left:** Timestamp (e.g. "Apr 16 · 2:14 PM"), card count, `{W}W {L}L` in green/red
- **Collapsed diff:** Aggregate counts (`+2 added · −4 removed`) with a `▸ show` expand toggle. If format changed, appended inline. If no changes vs previous snapshot (e.g. a revert created an identical state), shows "No card changes".
- **Expanded diff:** Named card chips, green for added, red for removed, with quantity delta. Chips labelled "additional" when the card already existed in the prior snapshot.
- **Right:** `Restore` button (indigo) when `isCurrent` is false; muted `Current` badge when true. (Renamed from "Revert" → "Restore" in final implementation.)

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

## Restore confirmation

No modal confirmation dialog — the Restore button (formerly "Revert" in this spec) triggers immediately and shows a toast ("Deck restored to [timestamp]"). This matches the app's existing pattern (no confirmation dialogs for destructive-ish actions).

After a successful restore, the client fires `DELETE /snapshots/after/:snapshotId` to prune checkpoints that are now ahead of the restored point. The prune is fire-and-forget (errors are silent) and does not block the snapshot timer from creating a new checkpoint on the next inactivity window.

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
