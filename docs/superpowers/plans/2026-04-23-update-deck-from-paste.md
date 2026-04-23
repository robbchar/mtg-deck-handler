# Update Deck from MTGA Paste — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to update an existing deck's card list by pasting an MTGA export, fully replacing cards/sideboard while preserving name, format, and notes.

**Architecture:** A new `POST /api/decks/:id/import` route reuses the existing `resolveCardEntry` helper and calls `updateDeck` instead of `createDeck`. On the frontend, `ImportModal` gains a `mode` prop (`'create' | 'update'`) that hides the name/format fields, changes the submit endpoint, and calls an `onSuccess` callback instead of navigating. `DeckEditor` exposes a `reloadDeck` function and wires up the modal.

**Tech Stack:** Express (Node), Jest/Supertest, React 19, TypeScript, Vitest, React Testing Library

---

## File Map

| File | Change |
|------|--------|
| `server/middleware/validate.js` | Add `validateUpdateImport` (text-only, no name) |
| `server/routes/importExport.js` | Add `POST /api/decks/:id/import` route |
| `server/routes/importExport.test.js` | Add test suite for the new route |
| `client/src/components/ImportModal.tsx` | Add `mode`, `deckId`, `onSuccess` props; branch on mode |
| `client/src/components/ImportModal.test.tsx` | Add test suite for `mode="update"` |
| `client/src/pages/DeckEditor.tsx` | Extract `reloadDeck`, add update modal state + button + `<ImportModal>` |

---

## Task 1: Add `validateUpdateImport` middleware

**Files:**
- Modify: `server/middleware/validate.js`

- [ ] **Step 1: Write the failing test**

In `server/middleware/validate.js` there is no test file — add inline Jest tests at the bottom of `server/routes/importExport.test.js` in a new describe block. But actually the middleware is exercised via the route tests. Skip a standalone middleware unit test here — it will be covered by route tests in Task 3.

Add `validateUpdateImport` to `server/middleware/validate.js`:

```js
/**
 * Validate the body of POST /api/decks/:id/import.
 * Requires only `text` (non-empty string). No name needed — deck already exists.
 */
function validateUpdateImport(req, res, next) {
  const { text } = req.body || {};

  if (!text || typeof text !== 'string' || text.trim() === '') {
    return res.status(400).json({ error: 'text is required and must be a non-empty string' });
  }

  next();
}
```

Update the `module.exports` line:

```js
module.exports = { validateDeckName, validateImport, validateUpdateImport };
```

- [ ] **Step 2: Commit**

```bash
git add server/middleware/validate.js
git commit -m "feat: add validateUpdateImport middleware"
```

---

## Task 2: Add `POST /api/decks/:id/import` route

**Files:**
- Modify: `server/routes/importExport.js`

- [ ] **Step 1: Add the import at the top of the route file**

In `server/routes/importExport.js`, update the `require` for validate middleware:

```js
const { validateImport, validateUpdateImport } = require('../middleware/validate');
```

Also add `updateDeck` to the deckService require:

```js
const { getDeck, createDeck, updateDeck } = require('../services/deckService');
```

- [ ] **Step 2: Add the new route after `POST /api/import`**

Append before `module.exports = router;`:

```js
// ── POST /api/decks/:id/import ────────────────────────────────────────────────

/**
 * Updates an existing deck's card list from MTGA-formatted text.
 *
 * Replaces `cards`, `sideboard`, and `unknown` on the deck.
 * Name, format, and notes are left unchanged.
 *
 * Flow:
 *   1. Validate required field (text).
 *   2. Call parseMtgaText(text) → { mainboard, sideboard }.
 *   3. Resolve all cards via resolveCardEntry (Scryfall, rate-limited).
 *   4. Call updateDeck(id, { cards, sideboard, unknown }).
 *   5. Return the updated deck as 200.
 *
 * @route   POST /api/decks/:id/import
 * @returns {200} Full deck JSON
 * @returns {400} { error: string }
 * @returns {404} { error: string }
 * @returns {500} { error: string }
 */
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

- [ ] **Step 3: Commit**

```bash
git add server/routes/importExport.js server/middleware/validate.js
git commit -m "feat: add POST /api/decks/:id/import route"
```

---

## Task 3: Test `POST /api/decks/:id/import`

**Files:**
- Modify: `server/routes/importExport.test.js`

- [ ] **Step 1: Add the test suite**

Append to `server/routes/importExport.test.js` (after the last existing describe block):

```js
// ── POST /api/decks/:id/import ─────────────────────────────────────────────────

describe('POST /api/decks/:id/import', () => {
  const DECK_ID = 'deck-uuid-001';
  const PARSED = {
    mainboard: [{ quantity: 4, name: 'Lightning Bolt' }],
    sideboard: [{ quantity: 2, name: 'Smash to Smithereens' }],
  };

  it('returns 200 with the updated deck on success', async () => {
    mtgaService.parseMtgaText.mockReturnValue(PARSED);
    deckService.updateDeck.mockResolvedValue(MOCK_DECK);

    const res = await request(app)
      .post(`/api/decks/${DECK_ID}/import`)
      .send({ text: MTGA_TEXT });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(MOCK_DECK);
  });

  it('calls parseMtgaText with the raw text from the request body', async () => {
    mtgaService.parseMtgaText.mockReturnValue(PARSED);
    deckService.updateDeck.mockResolvedValue(MOCK_DECK);

    await request(app).post(`/api/decks/${DECK_ID}/import`).send({ text: MTGA_TEXT });

    expect(mtgaService.parseMtgaText).toHaveBeenCalledWith(MTGA_TEXT);
  });

  it('calls updateDeck with the deck id and resolved cards', async () => {
    mtgaService.parseMtgaText.mockReturnValue(PARSED);
    deckService.updateDeck.mockResolvedValue(MOCK_DECK);

    await request(app).post(`/api/decks/${DECK_ID}/import`).send({ text: MTGA_TEXT });

    expect(deckService.updateDeck).toHaveBeenCalledWith(
      DECK_ID,
      expect.objectContaining({
        cards: expect.any(Array),
        sideboard: expect.any(Array),
        unknown: expect.any(Array),
      }),
    );
  });

  it('does not pass name or format to updateDeck', async () => {
    mtgaService.parseMtgaText.mockReturnValue(PARSED);
    deckService.updateDeck.mockResolvedValue(MOCK_DECK);

    await request(app).post(`/api/decks/${DECK_ID}/import`).send({ text: MTGA_TEXT });

    const callArg = deckService.updateDeck.mock.calls[0][1];
    expect(callArg).not.toHaveProperty('name');
    expect(callArg).not.toHaveProperty('format');
  });

  it('populates unknown[] with unresolved card names', async () => {
    mtgaService.parseMtgaText.mockReturnValue(PARSED);
    deckService.updateDeck.mockResolvedValue(MOCK_DECK);
    // cardService mocks return no results by default (see beforeEach)

    await request(app).post(`/api/decks/${DECK_ID}/import`).send({ text: MTGA_TEXT });

    const callArg = deckService.updateDeck.mock.calls[0][1];
    expect(callArg.unknown).toEqual(
      expect.arrayContaining(['Lightning Bolt', 'Smash to Smithereens']),
    );
  });

  it('returns 400 when text is missing', async () => {
    const res = await request(app).post(`/api/decks/${DECK_ID}/import`).send({});
    expect(res.statusCode).toBe(400);
    expect(deckService.updateDeck).not.toHaveBeenCalled();
  });

  it('returns 400 when text is an empty string', async () => {
    const res = await request(app).post(`/api/decks/${DECK_ID}/import`).send({ text: '' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when text is only whitespace', async () => {
    const res = await request(app).post(`/api/decks/${DECK_ID}/import`).send({ text: '   ' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when the deck does not exist', async () => {
    mtgaService.parseMtgaText.mockReturnValue(PARSED);
    deckService.updateDeck.mockImplementation(() => {
      throw new Error('Deck not found: deck-uuid-001');
    });

    const res = await request(app).post(`/api/decks/${DECK_ID}/import`).send({ text: MTGA_TEXT });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 when updateDeck throws an unexpected error', async () => {
    mtgaService.parseMtgaText.mockReturnValue(PARSED);
    deckService.updateDeck.mockImplementation(() => {
      throw new Error('Firestore write failure');
    });

    const res = await request(app).post(`/api/decks/${DECK_ID}/import`).send({ text: MTGA_TEXT });
    expect(res.statusCode).toBe(500);
  });

  it('Scryfall resolution failures are non-fatal (still returns 200)', async () => {
    cardService.searchCards.mockRejectedValue(new Error('Scryfall unreachable'));
    mtgaService.parseMtgaText.mockReturnValue(PARSED);
    deckService.updateDeck.mockResolvedValue(MOCK_DECK);

    const res = await request(app).post(`/api/decks/${DECK_ID}/import`).send({ text: MTGA_TEXT });
    expect(res.statusCode).toBe(200);
  });

  it('resolved cards are not placed in unknown[]', async () => {
    const SCRYFALL_CARD = {
      id: 'scryfall-abc',
      name: 'Lightning Bolt',
      mana_cost: '{R}',
      type_line: 'Instant',
      image_uris: { small: 'https://example.com/s.jpg', normal: 'https://example.com/n.jpg' },
    };
    cardService.searchCards.mockResolvedValue([SCRYFALL_CARD]);
    mtgaService.parseMtgaText.mockReturnValue({
      mainboard: [{ quantity: 4, name: 'Lightning Bolt' }],
      sideboard: [],
    });
    deckService.updateDeck.mockResolvedValue(MOCK_DECK);

    await request(app).post(`/api/decks/${DECK_ID}/import`).send({ text: '4 Lightning Bolt' });

    const callArg = deckService.updateDeck.mock.calls[0][1];
    expect(callArg.unknown).not.toContain('Lightning Bolt');
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
cd server
npx jest routes/importExport.test.js --no-coverage
```

Expected: all new tests pass alongside existing ones.

- [ ] **Step 3: Commit**

```bash
git add server/routes/importExport.test.js
git commit -m "test: add POST /api/decks/:id/import route tests"
```

---

## Task 4: Add `mode`, `deckId`, and `onSuccess` props to `ImportModal`

**Files:**
- Modify: `client/src/components/ImportModal.tsx`

- [ ] **Step 1: Update the props interface**

Replace the existing `ImportModalProps` interface:

```ts
interface ImportModalProps {
  isOpen: boolean
  onClose: () => void
  mode?: 'create' | 'update'
  deckId?: string
  onSuccess?: () => void
}
```

- [ ] **Step 2: Destructure new props in the function signature**

```ts
function ImportModal({ isOpen, onClose, mode = 'create', deckId, onSuccess }: ImportModalProps) {
```

- [ ] **Step 3: Update `handleImport` to branch on mode**

Replace the existing `handleImport` function body with:

```ts
async function handleImport() {
  if (!text.trim()) {
    setValidationError('Paste some MTGA deck text before importing.')
    return
  }
  if (mode === 'create' && !deckName.trim()) {
    setValidationError('Deck name is required.')
    return
  }

  setValidationError('')
  setApiError(null)
  setImporting(true)

  try {
    if (mode === 'update') {
      await client.post(`/api/decks/${deckId}/import`, { text })
      onSuccess?.()
      onClose()
    } else {
      const { data } = await client.post<{ id: string }>('/api/import', {
        text,
        name: deckName.trim(),
        format: format.trim(),
      })
      onClose()
      navigate(`/deck/${data.id}`)
    }
  } catch (err) {
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    setApiError(e?.response?.data?.error ?? e?.message ?? 'Import failed. Please try again.')
  } finally {
    setImporting(false)
  }
}
```

- [ ] **Step 4: Update the modal title**

Replace the `<h2>` content:

```tsx
<h2 id="import-modal-title" className="text-lg font-semibold text-gray-900">
  {mode === 'update' ? 'Update Deck' : 'Import Deck'}
</h2>
```

- [ ] **Step 5: Conditionally hide name and format fields**

Wrap both the deck name `<div>` and the format `<div>` in a conditional:

```tsx
{mode === 'create' && (
  <>
    {/* Deck name */}
    <div>
      <label htmlFor="import-deck-name" className="mb-1 block text-sm font-medium text-gray-700">
        Deck Name
      </label>
      <input
        id="import-deck-name"
        type="text"
        value={deckName}
        onChange={(e) => { setDeckName(e.target.value); setValidationError('') }}
        placeholder="My Awesome Deck"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        data-testid="import-deck-name"
      />
    </div>

    {/* Format (optional) */}
    <div>
      <label htmlFor="import-format" className="mb-1 block text-sm font-medium text-gray-700">
        Format{' '}
        <span className="font-normal text-gray-400">(optional)</span>
      </label>
      <FormatSelect
        id="import-format"
        value={format}
        onChange={(e) => setFormat(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        data-testid="import-format"
      />
    </div>
  </>
)}
```

- [ ] **Step 6: Update the submit button label**

```tsx
{importing
  ? (mode === 'update' ? 'Updating…' : 'Importing…')
  : (mode === 'update' ? 'Update Deck' : 'Import Deck')}
```

- [ ] **Step 7: Commit**

```bash
git add client/src/components/ImportModal.tsx
git commit -m "feat: add mode/deckId/onSuccess props to ImportModal"
```

---

## Task 5: Test `ImportModal` in update mode

**Files:**
- Modify: `client/src/components/ImportModal.test.tsx`

- [ ] **Step 1: Add a helper to render the modal in update mode**

At the top of the test file, after the existing `renderModal` helper, add:

```ts
function renderUpdateModal(overrides: Partial<{ deckId: string; onClose: () => void; onSuccess: () => void }> = {}) {
  const onClose = overrides.onClose ?? vi.fn()
  const onSuccess = overrides.onSuccess ?? vi.fn()
  const deckId = overrides.deckId ?? 'deck-update-001'
  render(
    <MemoryRouter>
      <ImportModal isOpen={true} onClose={onClose} mode="update" deckId={deckId} onSuccess={onSuccess} />
    </MemoryRouter>,
  )
  return { onClose, onSuccess }
}
```

- [ ] **Step 2: Add the test suite**

Append to `client/src/components/ImportModal.test.tsx`:

```ts
// ── Update mode ───────────────────────────────────────────────────────────────

describe('ImportModal — update mode: hidden fields', () => {
  it('does not render the deck name input', () => {
    renderUpdateModal()
    expect(screen.queryByTestId('import-deck-name')).not.toBeInTheDocument()
  })

  it('does not render the format select', () => {
    renderUpdateModal()
    expect(screen.queryByTestId('import-format')).not.toBeInTheDocument()
  })

  it('shows "Update Deck" as the modal title', () => {
    renderUpdateModal()
    expect(screen.getByText('Update Deck')).toBeInTheDocument()
  })

  it('shows "Update Deck" on the submit button', () => {
    renderUpdateModal()
    expect(screen.getByTestId('import-submit-button')).toHaveTextContent('Update Deck')
  })
})

describe('ImportModal — update mode: submit behaviour', () => {
  it('calls POST /api/decks/:deckId/import with the pasted text', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: {} })
    renderUpdateModal({ deckId: 'deck-update-001' })

    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: VALID_TEXT } })
    fireEvent.click(screen.getByTestId('import-submit-button'))

    await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1))
    expect(client.post).toHaveBeenCalledWith('/api/decks/deck-update-001/import', { text: VALID_TEXT })
  })

  it('calls onSuccess after a successful update', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: {} })
    const { onSuccess } = renderUpdateModal()

    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: VALID_TEXT } })
    fireEvent.click(screen.getByTestId('import-submit-button'))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
  })

  it('calls onClose after a successful update', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: {} })
    const { onClose } = renderUpdateModal()

    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: VALID_TEXT } })
    fireEvent.click(screen.getByTestId('import-submit-button'))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('does not navigate after a successful update', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: {} })
    renderUpdateModal()

    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: VALID_TEXT } })
    fireEvent.click(screen.getByTestId('import-submit-button'))

    await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1))
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows "Updating…" on the button while the request is in-flight', async () => {
    let resolvePost: (value: unknown) => void
    mockedAxios.post.mockReturnValueOnce(new Promise((r) => { resolvePost = r }))

    renderUpdateModal()
    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: VALID_TEXT } })
    fireEvent.click(screen.getByTestId('import-submit-button'))

    expect(screen.getByTestId('import-submit-button')).toHaveTextContent('Updating…')
    expect(screen.getByTestId('import-submit-button')).toBeDisabled()

    await waitFor(async () => resolvePost({ data: {} }))
  })

  it('shows a validation error if text is empty', async () => {
    renderUpdateModal()
    fireEvent.click(screen.getByTestId('import-submit-button'))
    expect(screen.getByTestId('import-validation-error')).toBeInTheDocument()
    expect(client.post).not.toHaveBeenCalled()
  })

  it('shows API error banner when the request fails', async () => {
    mockedAxios.post.mockRejectedValueOnce({
      response: { data: { error: 'Deck not found' } },
    })
    renderUpdateModal()

    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: VALID_TEXT } })
    fireEvent.click(screen.getByTestId('import-submit-button'))

    await waitFor(() => expect(screen.getByTestId('import-api-error')).toBeInTheDocument())
    expect(screen.getByTestId('import-api-error')).toHaveTextContent('Deck not found')
  })

  it('does not call onSuccess on failure', async () => {
    mockedAxios.post.mockRejectedValueOnce({ response: { data: { error: 'Deck not found' } } })
    const { onSuccess } = renderUpdateModal()

    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: VALID_TEXT } })
    fireEvent.click(screen.getByTestId('import-submit-button'))

    await waitFor(() => expect(screen.getByTestId('import-api-error')).toBeInTheDocument())
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run the tests**

```bash
cd client
npx vitest run src/components/ImportModal.test.tsx
```

Expected: all tests pass (new + existing).

- [ ] **Step 4: Commit**

```bash
git add client/src/components/ImportModal.test.tsx
git commit -m "test: add ImportModal update mode tests"
```

---

## Task 6: Wire up DeckEditor

**Files:**
- Modify: `client/src/pages/DeckEditor.tsx`

- [ ] **Step 1: Add the ImportModal import**

Add to the imports at the top of `DeckEditor.tsx`:

```ts
import ImportModal from '../components/ImportModal'
```

- [ ] **Step 2: Add update modal state**

In the `// ── UI state` block (around line 87), add:

```ts
const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false)
```

- [ ] **Step 3: Extract `reloadDeck` from the useEffect**

The existing `useEffect` (around line 222) has an inline `load()` function. Refactor it to a named `reloadDeck` callback:

```ts
// ── Load deck ─────────────────────────────────────────────────────────────
const reloadDeck = useCallback(async () => {
  setLoadState('loading')
  const deck = await getDeck(id!)
  if (!deck) {
    setLoadState('error')
    return
  }
  setNameValue(deck.name ?? '')
  savedNameRef.current = deck.name ?? ''
  setFormat(deck.format ?? '')
  setMainboard(deck.cards ?? [])
  setSideboard(deck.sideboard ?? [])
  notesRef.current = deck.notes ?? ''
  setActiveSnapshotId(deck.activeSnapshotId ?? null)
  setLoadState('ready')
}, [id, getDeck])

useEffect(() => {
  let cancelled = false
  reloadDeck().then(() => {
    if (cancelled) {
      // If cancelled mid-flight, reset to loading to avoid stale state
    }
  })
  return () => {
    cancelled = true
  }
}, [reloadDeck])
```

Note: `useCallback` is already imported. Add it to the import list if not present: `import { useState, useEffect, useRef, useCallback } from 'react'`

- [ ] **Step 4: Add the "Update from MTGA" button next to Export**

After the existing Export button (around line 574), add:

```tsx
<button
  type="button"
  onClick={() => setIsUpdateModalOpen(true)}
  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
  data-testid="update-from-mtga-btn"
>
  Update from MTGA
</button>
```

- [ ] **Step 5: Add the ImportModal in update mode**

After the `<CardSearch>` component (around line 713), add:

```tsx
{/* ── Update deck modal ── */}
<ImportModal
  isOpen={isUpdateModalOpen}
  onClose={() => setIsUpdateModalOpen(false)}
  mode="update"
  deckId={id}
  onSuccess={reloadDeck}
/>
```

- [ ] **Step 6: Run the frontend tests**

```bash
cd client
npx vitest run --reporter=verbose
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/DeckEditor.tsx
git commit -m "feat: add Update from MTGA button and modal to DeckEditor"
```

---

## Self-Review

**Spec coverage check:**
- ✅ New `POST /api/decks/:id/import` route — Task 2
- ✅ `validateUpdateImport` middleware (text-only) — Task 1
- ✅ Reuses `resolveCardEntry` helper — Task 2
- ✅ Calls `updateDeck`, leaves name/format/notes untouched — Task 2 + Task 3
- ✅ Returns 404 when deck not found — Task 2 + Task 3
- ✅ `mode` prop on `ImportModal` — Task 4
- ✅ Hidden name/format fields in update mode — Task 4 + Task 5
- ✅ Title and button label update — Task 4 + Task 5
- ✅ `onSuccess` callback called on success — Task 4 + Task 5
- ✅ No navigation in update mode — Task 4 + Task 5
- ✅ `reloadDeck` extracted and wired to `onSuccess` — Task 6
- ✅ "Update from MTGA" button next to Export — Task 6
- ✅ Snapshot history captures previous state automatically (no extra work needed — existing timer handles this)

**Type consistency:** `reloadDeck` is `() => Promise<void>`, matches `onSuccess?: () => void` (the promise is fire-and-forget in the modal, which is correct). `deckId` is `string | undefined`, route uses it as a template literal — only called when `mode === 'update'` and `deckId` is provided by the caller.
