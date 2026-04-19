# Snapshot Timeline Pruning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user makes new edits after restoring a past snapshot, automatically delete all snapshots that are newer than the restored point — keeping the history linear and preventing orphaned "future" checkpoints.

**Architecture:** A new `deleteSnapshotsAfter(deckId, snapshotId)` service function queries Firestore for snapshots with a `createdAt` timestamp strictly later than the pivot snapshot and batch-deletes them. A new `DELETE /api/decks/:id/snapshots/after/:snapshotId` route exposes this. On the client, `DeckEditor` tracks the ID of the last restored snapshot in a ref (`revertedToSnapshotIdRef`). When the inactivity snapshot timer fires, if that ref is set the client first calls the prune endpoint then creates the new snapshot, then clears the ref. The "Revert" button label is also renamed to "Restore" to match the "point in time" mental model.

**Tech Stack:** Node.js/Express + Firestore (server), React 18 + TypeScript + Tailwind + Vitest (client), Jest (server tests), supertest (route tests), firebase-admin (server).

**Builds on:** `docs/superpowers/plans/2026-04-16-deck-history.md` — all files from that plan already exist.

---

## File Map

| File | Change | Responsibility |
|------|--------|---------------|
| `server/services/snapshotService.js` | Modify | Add `deleteSnapshotsAfter` |
| `server/services/snapshotService.test.js` | Modify | Tests for `deleteSnapshotsAfter` |
| `server/routes/snapshots.js` | Modify | Add `DELETE /after/:snapshotId` route |
| `server/routes/snapshots.test.js` | Modify | Route tests for the new endpoint |
| `client/src/pages/DeckEditor.tsx` | Modify | Add `revertedToSnapshotIdRef`, update `handleRevert` and `scheduleSnapshot` |
| `client/src/pages/DeckEditor.test.tsx` | Modify | Test pruning call before new snapshot |
| `client/src/components/SnapshotEntry.tsx` | Modify | Rename "Revert" button to "Restore" |
| `client/src/components/SnapshotEntry.test.tsx` | Modify | Update button-name assertions |
| `client/src/components/DeckHistory.test.tsx` | Modify | Update button-name assertions |

---

## Task 1: `deleteSnapshotsAfter` service function

**Files:**
- Modify: `server/services/snapshotService.js`
- Modify: `server/services/snapshotService.test.js`

The existing mock in `snapshotService.test.js` exposes `db` with only `collection`. The new function also calls `db.batch()`, so the mock needs extending. `db` is already required from `./db` in the service, so no new imports are needed.

- [ ] **Step 1: Extend the mock and write failing tests** — add the following to `server/services/snapshotService.test.js`.

First, replace the existing `jest.mock('./db', ...)` block (line 20-22) with this expanded version that adds `batch` support:

```js
const mockBatch = {
  delete: jest.fn(),
  commit: jest.fn().mockResolvedValue(undefined),
};

const mockWhereRef = { get: jest.fn() };

// add `where` to the existing mockSnapshotsRef object (insert before the closing brace)
// mockSnapshotsRef gains: where: jest.fn(() => mockWhereRef)
```

Replace the `mockSnapshotsRef` declaration (lines 12-16) with:

```js
const mockSnapshotDocRef = { get: jest.fn() };
const mockOrderByRef = { get: jest.fn() };
const mockWhereRef = { get: jest.fn() };
const mockBatch = {
  delete: jest.fn(),
  commit: jest.fn().mockResolvedValue(undefined),
};
const mockSnapshotsRef = {
  orderBy: jest.fn(() => mockOrderByRef),
  add: jest.fn(),
  doc: jest.fn(() => mockSnapshotDocRef),
  where: jest.fn(() => mockWhereRef),
};
```

Replace the `jest.mock('./db', ...)` block with:

```js
jest.mock('./db', () => ({
  db: {
    collection: jest.fn(() => mockDeckCollRef),
    batch: jest.fn(() => mockBatch),
  },
}));
```

Add `mockSnapshotsRef.where.mockReturnValue(mockWhereRef)` to the `beforeEach` block.

Update the destructured require on line 29 to include `deleteSnapshotsAfter`:

```js
const { listSnapshots, createSnapshot, revertToSnapshot, deleteSnapshotsAfter } = require('./snapshotService');
```

Then append the new test block at the end of the file:

```js
// ── deleteSnapshotsAfter ──────────────────────────────────────────────────────

describe('deleteSnapshotsAfter(deckId, snapshotId)', () => {
  const pivotData = { createdAt: '2026-04-16T10:00:00.000Z', cards: [], sideboard: [], format: 'Modern', notes: '' };

  it('throws when the pivot snapshot does not exist', async () => {
    mockSnapshotDocRef.get.mockResolvedValue({ exists: false });
    await expect(deleteSnapshotsAfter(DECK_ID, 'missing')).rejects.toThrow('Snapshot not found: missing');
  });

  it('queries snapshots with createdAt greater than the pivot', async () => {
    mockSnapshotDocRef.get.mockResolvedValue({ exists: true, data: () => pivotData });
    mockWhereRef.get.mockResolvedValue({ docs: [] });
    await deleteSnapshotsAfter(DECK_ID, SNAP_ID);
    expect(mockSnapshotsRef.where).toHaveBeenCalledWith('createdAt', '>', pivotData.createdAt);
  });

  it('returns { deleted: 0 } when no snapshots are newer', async () => {
    mockSnapshotDocRef.get.mockResolvedValue({ exists: true, data: () => pivotData });
    mockWhereRef.get.mockResolvedValue({ docs: [] });
    const result = await deleteSnapshotsAfter(DECK_ID, SNAP_ID);
    expect(result).toEqual({ deleted: 0 });
  });

  it('batch-deletes all newer snapshots and returns the count', async () => {
    const fakeRef1 = {};
    const fakeRef2 = {};
    mockSnapshotDocRef.get.mockResolvedValue({ exists: true, data: () => pivotData });
    mockWhereRef.get.mockResolvedValue({
      docs: [
        { ref: fakeRef1 },
        { ref: fakeRef2 },
      ],
    });
    const { db } = require('./db');
    const result = await deleteSnapshotsAfter(DECK_ID, SNAP_ID);
    expect(db.batch).toHaveBeenCalled();
    expect(mockBatch.delete).toHaveBeenCalledWith(fakeRef1);
    expect(mockBatch.delete).toHaveBeenCalledWith(fakeRef2);
    expect(mockBatch.commit).toHaveBeenCalled();
    expect(result).toEqual({ deleted: 2 });
  });

  it('reads from the correct snapshot doc path', async () => {
    const { db } = require('./db');
    mockSnapshotDocRef.get.mockResolvedValue({ exists: true, data: () => pivotData });
    mockWhereRef.get.mockResolvedValue({ docs: [] });
    await deleteSnapshotsAfter(DECK_ID, SNAP_ID);
    expect(db.collection).toHaveBeenCalledWith('mtg-deck-handler');
    expect(mockDeckCollRef.doc).toHaveBeenCalledWith(DECK_ID);
    expect(mockSnapshotsRef.doc).toHaveBeenCalledWith(SNAP_ID);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd server && npx jest services/snapshotService.test.js --no-coverage
```

Expected: `deleteSnapshotsAfter is not a function`

- [ ] **Step 3: Implement `deleteSnapshotsAfter`** — append to `server/services/snapshotService.js` before `module.exports`:

```js
/**
 * Deletes all snapshots for a deck that were created after the given pivot snapshot.
 * Used to prune "future" history when the user makes new edits after a restore.
 * @param {string} deckId
 * @param {string} snapshotId - the pivot; snapshots strictly newer than this are deleted
 * @returns {Promise<{ deleted: number }>}
 */
async function deleteSnapshotsAfter(deckId, snapshotId) {
  const ref = snapshotsRef(deckId);
  const pivotDoc = await ref.doc(snapshotId).get();
  if (!pivotDoc.exists) throw new Error(`Snapshot not found: ${snapshotId}`);
  const { createdAt } = pivotDoc.data();

  const querySnap = await ref.where('createdAt', '>', createdAt).get();
  if (querySnap.docs.length === 0) return { deleted: 0 };

  const batch = db.batch();
  querySnap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return { deleted: querySnap.docs.length };
}
```

Also update `module.exports` at the bottom:

```js
module.exports = { listSnapshots, createSnapshot, revertToSnapshot, deleteSnapshotsAfter };
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd server && npx jest services/snapshotService.test.js --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/services/snapshotService.js server/services/snapshotService.test.js
git commit -m "feat: add deleteSnapshotsAfter to snapshotService"
```

---

## Task 2: `DELETE /after/:snapshotId` route

**Files:**
- Modify: `server/routes/snapshots.js`
- Modify: `server/routes/snapshots.test.js`

The router already uses `mergeParams: true` and has `verifyDeckOwnership` applied to all routes. The new `DELETE /after/:snapshotId` path is unambiguous — Express will not confuse `/after/snap-xyz` with `/:snapshotId/revert` because the method differs and the path literal `after` is distinct.

- [ ] **Step 1: Write failing route tests** — append to `server/routes/snapshots.test.js`:

First, update the mock at the top to include `deleteSnapshotsAfter`:

```js
// find the line: jest.mock('../services/snapshotService');
// After requiring snapshotService below it, add deleteSnapshotsAfter to the calls
```

Specifically, update the `snapshotService` require block so it reads:

```js
const snapshotService = require('../services/snapshotService');
// snapshotService is auto-mocked; all functions (listSnapshots, createSnapshot,
// revertToSnapshot, deleteSnapshotsAfter) are jest.fn() automatically.
```

No change needed to the require — `jest.mock('../services/snapshotService')` auto-mocks all exports including the new function. Just add the test block:

```js
// ── DELETE /api/decks/:id/snapshots/after/:snapshotId ─────────────────────────

describe('DELETE /api/decks/:id/snapshots/after/:snapshotId', () => {
  it('returns 200 with deleted count on success', async () => {
    snapshotService.deleteSnapshotsAfter.mockResolvedValue({ deleted: 2 });
    const res = await request(app).delete(`/api/decks/${DECK_ID}/snapshots/after/${SNAP_ID}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ deleted: 2 });
  });

  it('calls deleteSnapshotsAfter with deck id and snapshot id', async () => {
    snapshotService.deleteSnapshotsAfter.mockResolvedValue({ deleted: 0 });
    await request(app).delete(`/api/decks/${DECK_ID}/snapshots/after/${SNAP_ID}`);
    expect(snapshotService.deleteSnapshotsAfter).toHaveBeenCalledWith(DECK_ID, SNAP_ID);
  });

  it('returns 403 when deck belongs to a different user', async () => {
    deckService.getDeck.mockResolvedValue({ ...MOCK_DECK, userId: 'other-uid' });
    const res = await request(app).delete(`/api/decks/${DECK_ID}/snapshots/after/${SNAP_ID}`);
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when pivot snapshot not found', async () => {
    snapshotService.deleteSnapshotsAfter.mockRejectedValue(new Error(`Snapshot not found: ${SNAP_ID}`));
    const res = await request(app).delete(`/api/decks/${DECK_ID}/snapshots/after/${SNAP_ID}`);
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on unexpected errors', async () => {
    snapshotService.deleteSnapshotsAfter.mockRejectedValue(new Error('db failure'));
    const res = await request(app).delete(`/api/decks/${DECK_ID}/snapshots/after/${SNAP_ID}`);
    expect(res.statusCode).toBe(500);
  });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd server && npx jest routes/snapshots.test.js --no-coverage
```

Expected: 404s or method not allowed on the new endpoint.

- [ ] **Step 3: Implement the route** — in `server/routes/snapshots.js`:

Update the import at the top to include `deleteSnapshotsAfter`:

```js
const { listSnapshots, createSnapshot, revertToSnapshot, deleteSnapshotsAfter } = require('../services/snapshotService');
```

Append the new route handler before `module.exports = router`:

```js
/**
 * DELETE /api/decks/:id/snapshots/after/:snapshotId
 * Deletes all snapshots created after the given pivot snapshot.
 * Called before creating a new snapshot when the user edits after a restore.
 */
router.delete('/after/:snapshotId', async (req, res) => {
  try {
    const result = await deleteSnapshotsAfter(req.params.id, req.params.snapshotId);
    res.json(result);
  } catch (err) {
    if (err.message && err.message.startsWith('Snapshot not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('DELETE /api/decks/:id/snapshots/after/:snapshotId error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd server && npx jest routes/snapshots.test.js --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Run full server suite to check for regressions**

```bash
cd server && npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/routes/snapshots.js server/routes/snapshots.test.js
git commit -m "feat: add DELETE /snapshots/after/:snapshotId route for timeline pruning"
```

---

## Task 3: Wire timeline pruning into DeckEditor

**Files:**
- Modify: `client/src/pages/DeckEditor.tsx`
- Modify: `client/src/pages/DeckEditor.test.tsx`

The flow: `handleRevert` stores the restored snapshot's ID in `revertedToSnapshotIdRef`. When the inactivity timer fires to create the next checkpoint, it checks that ref — if set, it first calls `DELETE /api/decks/:id/snapshots/after/:snapshotId`, then creates the new snapshot, then clears the ref. If the user never makes edits after restoring, the ref stays set but nothing is pruned.

`client.delete` is already typed and mocked in tests (`vi.mock('../api/client', () => ({ default: { get, post, put, delete: vi.fn() } }))`).

- [ ] **Step 1: Write failing tests** — append to `client/src/pages/DeckEditor.test.tsx`:

```ts
// ── Timeline pruning ──────────────────────────────────────────────────────────

describe('DeckEditor — timeline pruning', () => {
  it('calls DELETE /snapshots/after/:id before creating a new snapshot when edits follow a restore', async () => {
    mockedClient.delete.mockResolvedValue({ data: { deleted: 1 } })
    mockedClient.post.mockResolvedValue({ data: {} })
    renderEditor()
    await waitFor(() => screen.getByTestId('deck-editor'))

    vi.useFakeTimers()

    // Simulate a restore (mock DeckHistory fires onRevert)
    await act(async () => {
      fireEvent.click(screen.getByTestId('tab-history'))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /mock revert/i }))
    })

    // Trigger an edit to start the snapshot timer
    await act(async () => {
      fireEvent.change(screen.getByTestId('deck-format-select'), { target: { value: 'draft' } })
    })

    // Advance past snapshot window
    await act(async () => { vi.advanceTimersByTime(180_001) })

    // Prune call must precede snapshot creation
    const deleteCalls = mockedClient.delete.mock.invocationCallOrder
    const postCalls = mockedClient.post.mock.invocationCallOrder
    expect(mockedClient.delete).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/decks\/.+\/snapshots\/after\/snap-1/),
    )
    expect(mockedClient.post).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/decks\/.+\/snapshots/),
      expect.any(Object),
    )
    expect(Math.min(...deleteCalls)).toBeLessThan(Math.min(...postCalls))

    vi.useRealTimers()
  })

  it('does not call DELETE when no restore happened before the new snapshot', async () => {
    mockedClient.post.mockResolvedValue({ data: {} })
    renderEditor()
    await waitFor(() => screen.getByTestId('deck-editor'))

    vi.useFakeTimers()

    // Edit without restoring first
    await act(async () => {
      fireEvent.change(screen.getByTestId('deck-format-select'), { target: { value: 'draft' } })
    })

    await act(async () => { vi.advanceTimersByTime(180_001) })

    expect(mockedClient.delete).not.toHaveBeenCalled()

    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd client && npx vitest run src/pages/DeckEditor.test.tsx --reporter=verbose 2>&1 | grep -E "FAIL|timeline"
```

Expected: both new timeline pruning tests fail.

- [ ] **Step 3: Add `revertedToSnapshotIdRef`** — in `DeckEditor.tsx`, in the snapshot timer refs block (around line 103, after `snapshotPendingRef`), add:

```ts
/** Tracks the snapshot ID the user last restored to, so new edits can prune future history. */
const revertedToSnapshotIdRef = useRef<string | null>(null)
```

- [ ] **Step 4: Update `handleRevert` to record the restore point** — in `handleRevert` (around line 370), add one line after `snapshotPendingRef.current = false`:

```ts
revertedToSnapshotIdRef.current = snapshot.id
```

The full updated function:

```ts
function handleRevert(deck: Deck, snapshot: DeckSnapshot) {
  // Cancel any pending auto-save so pre-revert edits don't overwrite the revert
  if (debounceRef.current) clearTimeout(debounceRef.current)
  pendingRef.current = {}
  // Cancel any pending snapshot from the pre-revert session
  if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current)
  snapshotPendingRef.current = false
  // Remember where we restored to so the next snapshot creation can prune future history
  revertedToSnapshotIdRef.current = snapshot.id

  setNameValue(deck.name ?? '')
  savedNameRef.current = deck.name ?? ''
  setFormat(deck.format ?? '')
  setMainboard(deck.cards ?? [])
  setSideboard(deck.sideboard ?? [])
  notesRef.current = deck.notes ?? ''
  setTabView('current')
  addToast(`Restored to ${formatDate(snapshot.createdAt)}`)
}
```

Note: the toast text also changes here from "Deck reverted to" to "Restored to".

- [ ] **Step 5: Update `scheduleSnapshot` to prune before creating** — replace the timer callback inside `scheduleSnapshot` (the `setTimeout` body, around line 164):

```ts
snapshotTimerRef.current = setTimeout(async () => {
  snapshotPendingRef.current = false
  if (!id) return
  try {
    if (revertedToSnapshotIdRef.current) {
      await client.delete(`/api/decks/${id}/snapshots/after/${revertedToSnapshotIdRef.current}`)
      revertedToSnapshotIdRef.current = null
    }
    await client.post(`/api/decks/${id}/snapshots`, snapshotDataRef.current)
  } catch (err) {
    console.error('Snapshot failed silently:', err)
  }
}, SNAPSHOT_WINDOW_MS)
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
cd client && npx vitest run src/pages/DeckEditor.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: all tests pass including the two new timeline pruning tests.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/DeckEditor.tsx client/src/pages/DeckEditor.test.tsx
git commit -m "feat: prune future snapshots before creating new checkpoint after a restore"
```

---

## Task 4: Rename "Revert" button to "Restore"

**Files:**
- Modify: `client/src/components/SnapshotEntry.tsx`
- Modify: `client/src/components/SnapshotEntry.test.tsx`
- Modify: `client/src/components/DeckHistory.test.tsx`

The mock `DeckHistory` in `DeckEditor.test.tsx` uses the text "Mock Revert" — that stays unchanged since it is an independent mock string, not the real button label.

- [ ] **Step 1: Update the SnapshotEntry test assertions** — in `client/src/components/SnapshotEntry.test.tsx`, replace every occurrence of `/revert/i` (used as button name matcher) with `/restore/i`:

There are four occurrences:
1. `it('renders a Revert button', ...)` → rename test to `'renders a Restore button'`, change `{ name: /revert/i }` to `{ name: /restore/i }`
2. `it('calls onRevert when Revert button is clicked', ...)` → rename to `'calls onRevert when Restore button is clicked'`, change matcher to `/restore/i`

Also update the expand/collapse tests that look for `{ name: /show/i }` — those are unaffected.

The two changes in `SnapshotEntry.test.tsx`:

```ts
// was: it('renders a Revert button', ...
it('renders a Restore button', () => {
  // ...same render...
  expect(screen.getByRole('button', { name: /restore/i })).toBeInTheDocument()
})

// was: it('calls onRevert when Revert button is clicked', ...
it('calls onRevert when Restore button is clicked', () => {
  // ...same render and fireEvent...
  fireEvent.click(screen.getByRole('button', { name: /restore/i }))
  expect(onRevert).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Update DeckHistory test assertions** — in `client/src/components/DeckHistory.test.tsx`, replace every `{ name: /revert/i }` matcher with `{ name: /restore/i }`:

```ts
// list rendering test:
expect(screen.getAllByRole('button', { name: /restore/i })).toHaveLength(2)

// revert tests:
fireEvent.click(screen.getByRole('button', { name: /restore/i }))
```

- [ ] **Step 3: Run the tests to confirm they fail**

```bash
cd client && npx vitest run src/components/SnapshotEntry.test.tsx src/components/DeckHistory.test.tsx --reporter=verbose 2>&1 | grep -E "FAIL|restore|revert"
```

Expected: failures because the button still says "Revert".

- [ ] **Step 4: Update the button label** — in `client/src/components/SnapshotEntry.tsx`, change the Revert button text:

```tsx
<button
  type="button"
  onClick={onRevert}
  className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
>
  Restore
</button>
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd client && npx vitest run src/components/SnapshotEntry.test.tsx src/components/DeckHistory.test.tsx --reporter=verbose 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 6: Run the full client suite for regressions**

```bash
cd client && npx vitest run --reporter=verbose 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/SnapshotEntry.tsx client/src/components/SnapshotEntry.test.tsx client/src/components/DeckHistory.test.tsx
git commit -m "feat: rename Revert button to Restore to match point-in-time mental model"
```

---

## Self-Review Checklist

**Spec coverage:**
| Requirement | Task |
|---|---|
| Prune future snapshots when user edits after restore | Tasks 1, 2, 3 |
| Prune happens before new snapshot is created (ordering) | Task 3 |
| No pruning if user hasn't restored | Task 3 (second test) |
| Moving back and forth without editing leaves all snapshots intact | Covered by design — prune only fires on snapshot timer |
| Rename "Revert" to "Restore" | Task 4 |
| Server-side batch delete with ownership guard | Task 2 |

**Known limitation (out of scope):** The `beforeunload` keepalive path creates a snapshot without checking `revertedToSnapshotIdRef`. Pruning on tab-close is not feasible with the keepalive fetch pattern and is intentionally excluded.

**Type consistency check:**
- `deleteSnapshotsAfter` named consistently across service, route, client call
- `revertedToSnapshotIdRef` is `useRef<string | null>(null)` — always set to `snapshot.id` (string) or `null`
- `client.delete(url)` — no body needed, matches axios API
