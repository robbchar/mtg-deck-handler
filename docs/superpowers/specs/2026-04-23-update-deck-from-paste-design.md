# Update Deck from MTGA Paste — Design Spec

**Date:** 2026-04-23
**Status:** Approved

---

## Problem Statement

Users maintain decks in Magic: The Gathering Arena (MTGA) and want to track them in this app for richer data (notes, game logs, snapshot history). Currently, importing an updated MTGA deck export always creates a new deck. The goal is to update an existing deck's card list by pasting the current MTGA export, preserving the deck's identity, notes, and history.

---

## Scope

- Paste an MTGA-format deck list into an existing deck → full replace of `cards` and `sideboard`
- `name`, `format`, and `notes` are left untouched
- Import immediately creates a snapshot of the post-import state; any pending client-side snapshot timer is flushed first to preserve the pre-import state
- No diff/partial-update mode — always a full replace

Out of scope for this feature:
- Diffing two deck versions (future feature, already served by snapshot history)
- Changing deck name/format via this flow

---

## Architecture

### Server: new route

`POST /api/decks/:id/import`

1. Validate `text` field in request body (reuse/extend `validateImport` middleware)
2. `parseMtgaText(text)` → `{ mainboard, sideboard }`
3. Resolve all cards concurrently via existing `resolveCardEntry` helper
4. Build `unknown[]` from unresolved cards (same pattern as create flow)
5. Call `updateDeck(id, { cards, sideboard, unknown })`
6. Call `createSnapshot(id, { cards, sideboard, format, notes })` — `format` and `notes` are read from the deck doc (returned by `updateDeck` or fetched prior); this mirrors what the client sends on a timer-fired snapshot and sets `activeSnapshotId` on the deck
7. Return updated deck as `200`

The route lives in `server/routes/importExport.js` alongside the existing `POST /api/import`.

### Frontend: ImportModal changes

Add three props:

```ts
mode?: 'create' | 'update'        // defaults to 'create'
deckId?: string                   // required when mode === 'update'
onBeforeSubmit?: () => Promise<void>  // awaited before the import fetch; used in update mode to flush pending snapshot
onSuccess?: () => void            // called after successful update, before onClose
```

Behaviour differences in `update` mode:

| Aspect | create mode | update mode |
|--------|-------------|-------------|
| Title | "Import Deck" | "Update Deck" |
| Deck name field | shown, required | hidden |
| Format field | shown, optional | hidden |
| Submit label | "Import Deck" / "Importing…" | "Update Deck" / "Updating…" |
| API call | `POST /api/import` | `POST /api/decks/:deckId/import` |
| On success | navigate to `/deck/:id` | call `onSuccess()` then `onClose()` |

Preview behaviour (client-side parse) is identical in both modes.

### Frontend: DeckEditor integration

- Extract the deck load logic (currently inlined in `useEffect`) into a named `reloadDeck` function callable both on mount and on demand.
- Add a `flushSnapshot()` function: cancels `snapshotTimerRef`, and if a timer was active, immediately POSTs `snapshotDataRef.current` to `POST /api/decks/:id/snapshots`.
- Add an **"Update from MTGA"** button in the toolbar next to the Export button.
- Wire up `ImportModal` in update mode:

```tsx
<ImportModal
  isOpen={isUpdateModalOpen}
  onClose={() => setIsUpdateModalOpen(false)}
  mode="update"
  deckId={id}
  onBeforeSubmit={flushSnapshot}
  onSuccess={() => {
    reloadDeck()
    snapshotTimerRef.current = null  // ensure timer ref is clean after flush+import
  }}
/>
```

---

## Data Flow

```
User pastes MTGA text → Preview (client-side parse, no network)
→ "Update Deck" clicked
→ onBeforeSubmit() → flushSnapshot()
    → if timer pending: cancel timer, POST /api/decks/:id/snapshots (pre-import state)
→ POST /api/decks/:id/import
  → parseMtgaText
  → resolveCardEntry × N (Scryfall, rate-limited)
  → updateDeck (Firestore write)
  → createSnapshot (post-import state, sets activeSnapshotId)
→ 200 response
→ onSuccess() → reloadDeck() (GET /api/decks/:id), clear snapshotTimerRef
→ onClose() → modal dismissed, editor shows updated cards
```

---

## Error Handling

- Validation error (empty text): shown inline, same as create mode
- API error: shown in the modal error banner, same as create mode
- Unknown cards (Scryfall resolution failures): non-fatal, flagged in preview and stored in `unknown[]`, same as create mode

---

## Testing

- `ImportModal`: new test suite for `mode="update"` — verify hidden fields, correct endpoint called, `onBeforeSubmit` awaited before fetch, `onSuccess` invoked, no navigation
- `POST /api/decks/:id/import` route: unit tests mirroring `POST /api/import` tests — valid input, empty text, Scryfall resolution stubbed; additionally verify `createSnapshot` is called with the resolved cards and existing deck `format`/`notes`
- `DeckEditor`: test that "Update from MTGA" button opens the modal in update mode; test that `flushSnapshot` fires an immediate snapshot when a timer is pending; test that `flushSnapshot` is a no-op when no timer is pending; test that `reloadDeck` is called on success and timer ref is cleared
