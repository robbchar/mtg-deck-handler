# Snapshot on Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a snapshot immediately when a deck is imported via `POST /api/decks/:id/import`, and flush any pending client-side snapshot timer before the import to preserve the pre-import state.

**Architecture:** The server's import route calls `createSnapshot` immediately after `updateDeck` — the deck returned by `updateDeck` already carries `format` and `notes`, so no extra Firestore read is needed. On the client, `DeckEditor` adds a `flushSnapshot` async function that cancels the pending timer and immediately POSTs a snapshot if one was queued; this is passed to `ImportModal` as `onBeforeSubmit` and awaited before the import API call. After a successful import, `onSuccess` also nulls the timer ref as a safety cleanup.

**Tech Stack:** Express (server route), Jest (server tests), React/TypeScript (client), Vitest + Testing Library (client tests)

---

### Task 1: Server — call `createSnapshot` in `POST /api/decks/:id/import`

**Files:**
- Modify: `server/routes/importExport.js`
- Modify: `server/routes/importExport.test.js`

- [ ] **Step 1: Write failing tests**

In `server/routes/importExport.test.js`, add the `snapshotService` mock directly below the existing `jest.mock` calls near the top of the file:

```js
jest.mock('../services/snapshotService');
const snapshotService = require('../services/snapshotService');
```

In `beforeEach`, add a default mock so existing tests aren't broken:
```js
snapshotService.createSnapshot.mockResolvedValue({
  id: 'snap-import-1',
  createdAt: new Date().toISOString(),
  cards: [],
  sideboard: [],
  format: '',
  notes: '',
});
```

Add these three tests inside the existing `describe('POST /api/decks/:id/import', ...)` block:

```js
it('calls createSnapshot after a successful import', async () => {
  mtgaService.parseMtgaText.mockReturnValue(PARSED);
  deckService.updateDeck.mockResolvedValue(MOCK_DECK);

  await request(app).post(`/api/decks/${DECK_ID}/import`).send({ text: MTGA_TEXT });

  expect(snapshotService.createSnapshot).toHaveBeenCalledTimes(1);
});

it('calls createSnapshot with resolved cards and the deck format and notes', async () => {
  mtgaService.parseMtgaText.mockReturnValue(PARSED);
  deckService.updateDeck.mockResolvedValue(MOCK_DECK);

  await request(app).post(`/api/decks/${DECK_ID}/import`).send({ text: MTGA_TEXT });

  expect(snapshotService.createSnapshot).toHaveBeenCalledWith(
    DECK_ID,
    expect.objectContaining({
      cards: expect.any(Array),
      sideboard: expect.any(Array),
      format: MOCK_DECK.format,
      notes: MOCK_DECK.notes,
    }),
  );
});

it('returns 500 when createSnapshot throws', async () => {
  mtgaService.parseMtgaText.mockReturnValue(PARSED);
  deckService.updateDeck.mockResolvedValue(MOCK_DECK);
  snapshotService.createSnapshot.mockRejectedValue(new Error('Firestore snapshot failure'));

  const res = await request(app).post(`/api/decks/${DECK_ID}/import`).send({ text: MTGA_TEXT });
  expect(res.statusCode).toBe(500);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm run test:server`
Expected: 3 new tests FAIL — `snapshotService.createSnapshot` is not called yet.

- [ ] **Step 3: Implement `createSnapshot` in the route**

In `server/routes/importExport.js`, add the import after the existing `require` lines (e.g. after line 15):
```js
const { createSnapshot } = require('../services/snapshotService');
```

Replace the route body for `POST /api/decks/:id/import` with the version below. The only change from the current code is calling `createSnapshot` after `updateDeck` using `deck.format` and `deck.notes` from the returned value:

```js
router.post('/decks/:id/import', validateUpdateImport, async (req, res) => {
  try {
    const { text } = req.body;
    const { id } = req.params;

    const { mainboard, sideboard } = parseMtgaText(text);

    const [cards, sideboardCards] = await Promise.all([
      Promise.all(mainboard.map((c) => resolveCardEntry(c, 'mainboard'))),
      Promise.all(sideboard.map((c) => resolveCardEntry(c, 'sideboard'))),
    ]);

    const unknown = [...cards, ...sideboardCards]
      .filter((c) => !c.scryfall_id)
      .map((c) => c.name);

    const deck = await updateDeck(id, { cards, sideboard: sideboardCards, unknown });
    await createSnapshot(id, { cards, sideboard: sideboardCards, format: deck.format, notes: deck.notes });

    res.json(deck);
  } catch (err) {
    if (err.message && err.message.startsWith('Deck not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('POST /api/decks/:id/import error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npm run test:server`
Expected: All tests PASS, including the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add server/routes/importExport.js server/routes/importExport.test.js
git commit -m "feat: create snapshot immediately on POST /api/decks/:id/import"
```

---

### Task 2: Client — add `onBeforeSubmit` prop to `ImportModal`

**Files:**
- Modify: `client/src/components/ImportModal.tsx`
- Modify: `client/src/components/ImportModal.test.tsx`

- [ ] **Step 1: Write failing tests**

In `client/src/components/ImportModal.test.tsx`, replace the existing `renderUpdateModal` function with this updated version that accepts and passes `onBeforeSubmit`:

```typescript
function renderUpdateModal(overrides: Partial<{
  deckId: string
  onClose: () => void
  onSuccess: () => void
  onBeforeSubmit: () => Promise<void>
}> = {}) {
  const onClose = overrides.onClose ?? vi.fn()
  const onSuccess = overrides.onSuccess ?? vi.fn()
  const onBeforeSubmit = overrides.onBeforeSubmit ?? vi.fn().mockResolvedValue(undefined)
  const deckId = overrides.deckId ?? 'deck-update-001'
  render(
    <MemoryRouter>
      <ImportModal
        isOpen={true}
        onClose={onClose}
        mode="update"
        deckId={deckId}
        onSuccess={onSuccess}
        onBeforeSubmit={onBeforeSubmit}
      />
    </MemoryRouter>,
  )
  return { onClose, onSuccess, onBeforeSubmit }
}
```

Add a new `describe` block at the bottom of the file:

```typescript
describe('ImportModal — update mode: onBeforeSubmit', () => {
  it('calls onBeforeSubmit before the import API request', async () => {
    let beforeSubmitSettled = false
    const onBeforeSubmit = vi.fn().mockImplementation(async () => {
      beforeSubmitSettled = true
    })
    mockedAxios.post.mockImplementation(async () => {
      expect(beforeSubmitSettled).toBe(true)
      return { data: {} }
    })

    renderUpdateModal({ onBeforeSubmit })
    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: VALID_TEXT } })
    fireEvent.click(screen.getByTestId('import-submit-button'))

    await waitFor(() => expect(onBeforeSubmit).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1))
  })

  it('does not call onBeforeSubmit when text validation fails', async () => {
    const onBeforeSubmit = vi.fn().mockResolvedValue(undefined)
    renderUpdateModal({ onBeforeSubmit })

    // Submit with empty textarea — validation should fail before onBeforeSubmit runs
    fireEvent.click(screen.getByTestId('import-submit-button'))

    expect(onBeforeSubmit).not.toHaveBeenCalled()
    expect(client.post).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm run test:client`
Expected: 2 new tests FAIL — `onBeforeSubmit` is not in `ImportModalProps` yet, so it is never called.

- [ ] **Step 3: Add `onBeforeSubmit` to `ImportModal`**

In `client/src/components/ImportModal.tsx`, update `ImportModalProps` to add the new prop:

```typescript
interface ImportModalProps {
  isOpen: boolean
  onClose: () => void
  mode?: 'create' | 'update'
  deckId?: string
  onBeforeSubmit?: () => Promise<void>
  onSuccess?: () => void
}
```

Update the function signature to destructure the new prop:

```typescript
function ImportModal({ isOpen, onClose, mode = 'create', deckId, onBeforeSubmit, onSuccess }: ImportModalProps) {
```

In `handleImport`, inside the `mode === 'update'` branch, add `await onBeforeSubmit?.()` immediately before the `client.post` call:

```typescript
if (mode === 'update') {
  if (!deckId) {
    setApiError('No deck ID provided for update.')
    return
  }
  await onBeforeSubmit?.()
  await client.post(`/api/decks/${deckId}/import`, { text })
  onSuccess?.()
  onClose()
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npm run test:client`
Expected: All tests PASS, including the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ImportModal.tsx client/src/components/ImportModal.test.tsx
git commit -m "feat: add onBeforeSubmit prop to ImportModal for pre-import hook"
```

---

### Task 3: Client — add `flushSnapshot` to `DeckEditor` and wire up

**Files:**
- Modify: `client/src/pages/DeckEditor.tsx`
- Modify: `client/src/pages/DeckEditor.test.tsx`

- [ ] **Step 1: Write failing tests**

In `client/src/pages/DeckEditor.test.tsx`, add a new `describe` block at the bottom:

```typescript
describe('DeckEditor — flushSnapshot (pre-import flush)', () => {
  it('posts a snapshot immediately when a timer is pending and the import is submitted', async () => {
    mockedClient.post.mockResolvedValue({
      data: { id: 'snap-flushed', createdAt: new Date().toISOString(), cards: [], sideboard: [], format: '', notes: '' },
    })
    renderEditor()
    await waitFor(() => screen.getByTestId('deck-editor'))

    vi.useFakeTimers()

    // Arm the snapshot timer via a format change
    await act(async () => {
      fireEvent.change(screen.getByTestId('deck-format-select'), { target: { value: 'modern' } })
    })

    // Open the update modal, then switch back to real timers for async operations
    fireEvent.click(screen.getByTestId('update-from-mtga-btn'))
    vi.useRealTimers()

    await waitFor(() => screen.getByTestId('import-modal'))

    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: '4 Lightning Bolt' } })
    fireEvent.click(screen.getByTestId('import-submit-button'))

    await waitFor(() => {
      const urls = mockedClient.post.mock.calls.map(([url]) => url)
      expect(urls).toContain('/api/decks/test-deck-id/snapshots')
    })

    // Snapshot must precede import
    const urls = mockedClient.post.mock.calls.map(([url]) => url)
    const snapIdx = urls.findIndex((u) => u === '/api/decks/test-deck-id/snapshots')
    const importIdx = urls.findIndex((u) => u === '/api/decks/test-deck-id/import')
    expect(snapIdx).toBeGreaterThanOrEqual(0)
    expect(importIdx).toBeGreaterThan(snapIdx)
  })

  it('does not post a snapshot before import when no timer is pending', async () => {
    mockedClient.post.mockResolvedValue({ data: {} })
    renderEditor()
    await waitFor(() => screen.getByTestId('deck-editor'))

    // Open update modal WITHOUT any prior edits (no pending timer)
    fireEvent.click(screen.getByTestId('update-from-mtga-btn'))
    await waitFor(() => screen.getByTestId('import-modal'))

    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: '4 Lightning Bolt' } })
    fireEvent.click(screen.getByTestId('import-submit-button'))

    await waitFor(() =>
      expect(mockedClient.post).toHaveBeenCalledWith(
        '/api/decks/test-deck-id/import',
        expect.objectContaining({ text: '4 Lightning Bolt' }),
      ),
    )

    const urls = mockedClient.post.mock.calls.map(([url]) => url)
    expect(urls).not.toContain('/api/decks/test-deck-id/snapshots')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm run test:client`
Expected: 2 new tests FAIL — `onBeforeSubmit` is not yet wired in `DeckEditor`, so `flushSnapshot` is never called.

- [ ] **Step 3: Add `flushSnapshot` to `DeckEditor` and update `ImportModal` props**

In `client/src/pages/DeckEditor.tsx`, add the `flushSnapshot` function immediately after `scheduleSnapshot` (around line 186):

```typescript
async function flushSnapshot(): Promise<void> {
  if (!snapshotPendingRef.current || !id) return
  snapshotPendingRef.current = false
  if (snapshotTimerRef.current) {
    clearTimeout(snapshotTimerRef.current)
    snapshotTimerRef.current = null
  }
  try {
    const { data: newSnapshot } = await client.post<DeckSnapshot>(
      `/api/decks/${id}/snapshots`,
      snapshotDataRef.current,
    )
    setActiveSnapshotId(newSnapshot.id)
  } catch (err) {
    console.error('Pre-import snapshot flush failed:', err)
  }
}
```

Update the `ImportModal` JSX (around line 726) to pass `onBeforeSubmit` and update `onSuccess`:

```tsx
{/* ── Update deck modal ── */}
<ImportModal
  isOpen={isUpdateModalOpen}
  onClose={() => setIsUpdateModalOpen(false)}
  mode="update"
  deckId={id}
  onBeforeSubmit={flushSnapshot}
  onSuccess={() => {
    reloadDeck()
    snapshotTimerRef.current = null
  }}
/>
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npm run test:client`
Expected: All tests PASS, including the 2 new ones.

- [ ] **Step 5: Run the full test suite**

Run: `npm run test`
Expected: All server and client tests PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/DeckEditor.tsx client/src/pages/DeckEditor.test.tsx
git commit -m "feat: flush pending snapshot before import, wire flushSnapshot to ImportModal"
```
