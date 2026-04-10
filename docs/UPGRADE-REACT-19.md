# Upgrade Plan: React 18 → React 19

## Current state

| Package | Current | Target |
|---|---|---|
| `react` | `^18.3.1` | `^19` |
| `react-dom` | `^18.3.1` | `^19` |
| `@types/react` | `^19.2.14` | already at target |
| `@types/react-dom` | `^19.2.3` | already at target |
| `@vitejs/plugin-react` | `^4.3.2` | `^4.4+` (confirm React 19 support) |
| `react-router-dom` | `^6.26.2` | stay on v6 (see below) |

> **Note:** `@types/react` is already at v19 — the React team's recommended first step.
> Running `tsc --noEmit` already shows pre-existing type errors unrelated to React 19
> (axios mock typings in tests, an implicit `any` in `useDecks.test.tsx`).
> These should be fixed as part of this upgrade since we're touching the type surface anyway.

---

## React 19 changes relevant to this codebase

### Breaking changes (must fix)

None in this codebase. The removed APIs (`ReactDOM.render`, `hydrate`,
legacy context, string refs, `propTypes`) are not used here.

### Required adjustments

**1. `useRef` without an initial value**

React 19 types no longer accept `useRef<T>()` with no argument — you must
provide an initial value. Affects:

- `DeckEditor.tsx`: `useRef('')`, `useRef({})`, `useRef(updateDeck)`
- `CardSearch.tsx`: `useRef<HTMLInputElement>(null)`, `useRef<... | null>(null)`
- `useToast.ts`: `useRef<Map<...>>(new Map())`

Most already pass a value; only need to verify none use the bare `useRef<T>()` form.

**2. Pre-existing TypeScript errors to fix**

Running `tsc --noEmit` reveals existing errors that the v19 types surface more
strictly. These should be resolved as part of this upgrade:

- `DeckCard.test.tsx` — missing `card_count` in test fixture, `null` assigned to `string`
- `ImportModal.test.tsx`, `useCards.test.tsx`, `useDecks.test.tsx` — axios mock
  typings (`mockResolvedValueOnce` etc. not typed on the axios instance). Fix by
  casting: `(axios.get as vi.Mock).mockResolvedValueOnce(...)` or using `vi.mocked(axios.get)`.
- `useDecks.test.tsx` — implicit `any` on `children` binding

### Idiomatic React 19 improvements (optional, low risk)

**3. `<Context>` instead of `<Context.Provider>`**

React 19 lets you render context directly without `.Provider`. Two files:

```tsx
// before
<DeckContext.Provider value={...}>
// after
<DeckContext value={...}>
```

Applies to `DeckContext.tsx` and `ToastContext.tsx`. Backwards-compatible with
v18 if you ever need to revert.

**4. `ErrorBoundary` — no change needed**

`ErrorBoundary.tsx` is a class component. Class components are still fully
supported in React 19. No changes required.

### React Router — stay on v6

React Router v6 is compatible with React 19. Upgrading to v7 at the same time
would increase scope significantly and is a separate decision. Leave at v6 for now.

---

## Step-by-step execution

### Step 1 — Bump runtime packages

```bash
npm install react@^19 react-dom@^19
npm install --save-dev @vitejs/plugin-react@latest
```

Verify the app starts and renders correctly.

### Step 2 — Fix TypeScript errors

Run `tsc --noEmit` and work through the errors:

1. Fix axios mock typings in test files (use `vi.mocked()`)
2. Fix `DeckCard.test.tsx` fixture (add `card_count`, fix `null` → `string`)
3. Fix `useDecks.test.tsx` implicit `any`

Goal: `tsc --noEmit` exits clean.

### Step 3 — Run full test suite

```bash
cd client && npm test
```

All tests should pass. If any fail due to React 19 behaviour changes, fix here.

### Step 4 — Optional: `<Context>` shorthand

Update `DeckContext.tsx` and `ToastContext.tsx` to use the new `<Context value={...}>` syntax.

### Step 5 — Manual smoke test

- Open the app in the browser
- Create/edit a deck, log a game, search for a card
- Verify no console errors

### Step 6 — Commit and PR

---

## Risk assessment

**Low.** This codebase has no usage of any removed React 19 APIs. The main work
is fixing pre-existing TypeScript strictness errors that the v19 types expose.
The runtime upgrade itself is expected to be a no-op.
