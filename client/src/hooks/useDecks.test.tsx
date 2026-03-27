import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import axios from 'axios'
import { DeckProvider } from '../context/DeckContext'
import { useDecks } from './useDecks'

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DECK_A = {
  id: 'deck-aaa',
  name: 'Mono Red',
  format: 'Standard',
  notes: '',
  cards: [],
  sideboard: [],
  card_count: 0,
  updated_at: '2024-01-01T00:00:00.000Z',
}

const DECK_B = {
  id: 'deck-bbb',
  name: 'Mono Blue',
  format: 'Modern',
  notes: '',
  cards: [],
  sideboard: [],
  card_count: 0,
  updated_at: '2024-01-02T00:00:00.000Z',
}

/** Wraps the hook in a DeckProvider so context is available. */
function wrapper({ children }) {
  return <DeckProvider>{children}</DeckProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── initial state ─────────────────────────────────────────────────────────────

describe('useDecks — initial state', () => {
  it('exposes decks, loading, error, and all CRUD functions', async () => {
    axios.get.mockResolvedValueOnce({ data: [] })
    const { result } = renderHook(() => useDecks(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(Array.isArray(result.current.decks)).toBe(true)
    expect(typeof result.current.loading).toBe('boolean')
    expect(result.current.error).toBeNull()
    expect(typeof result.current.createDeck).toBe('function')
    expect(typeof result.current.updateDeck).toBe('function')
    expect(typeof result.current.deleteDeck).toBe('function')
    expect(typeof result.current.getDeck).toBe('function')
  })

  it('starts with loading=true while the mount fetch is pending', () => {
    let resolve
    axios.get.mockReturnValueOnce(new Promise(r => { resolve = r }))

    const { result } = renderHook(() => useDecks(), { wrapper })
    expect(result.current.loading).toBe(true)

    // clean up to avoid unhandled-promise warnings
    act(() => resolve({ data: [] }))
  })

  it('throws when used outside a DeckProvider', () => {
    expect(() => renderHook(() => useDecks())).toThrow(
      'useDecks must be used within a DeckProvider'
    )
  })
})

// ── mount fetch ───────────────────────────────────────────────────────────────

describe('useDecks — mount fetch', () => {
  it('calls GET /api/decks on mount', async () => {
    axios.get.mockResolvedValueOnce({ data: [DECK_A] })

    renderHook(() => useDecks(), { wrapper })

    await waitFor(() => expect(axios.get).toHaveBeenCalledWith('/api/decks'))
  })

  it('populates decks after a successful fetch', async () => {
    axios.get.mockResolvedValueOnce({ data: [DECK_A, DECK_B] })

    const { result } = renderHook(() => useDecks(), { wrapper })

    await waitFor(() => expect(result.current.decks).toHaveLength(2))
    expect(result.current.decks[0]).toEqual(DECK_A)
    expect(result.current.decks[1]).toEqual(DECK_B)
  })

  it('sets loading=false after a successful fetch', async () => {
    axios.get.mockResolvedValueOnce({ data: [] })

    const { result } = renderHook(() => useDecks(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('sets loading=false and error state on fetch failure', async () => {
    axios.get.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useDecks(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeTruthy()
  })

  it('prefers the server error message when available', async () => {
    axios.get.mockRejectedValueOnce({
      response: { data: { error: 'Disk read failure' } },
    })

    const { result } = renderHook(() => useDecks(), { wrapper })

    await waitFor(() => expect(result.current.error).toBe('Disk read failure'))
  })
})

// ── createDeck ────────────────────────────────────────────────────────────────

describe('useDecks — createDeck', () => {
  it('optimistically adds a deck to local state before the POST resolves', async () => {
    axios.get.mockResolvedValueOnce({ data: [] })
    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let resolvePost
    axios.post.mockReturnValueOnce(new Promise(r => { resolvePost = r }))

    act(() => {
      result.current.createDeck({ name: 'Optimistic Deck' })
    })

    expect(result.current.decks.some(d => d.name === 'Optimistic Deck')).toBe(true)

    await act(async () => resolvePost({ data: DECK_A }))
  })

  it('replaces the optimistic entry with the server deck on success', async () => {
    axios.get.mockResolvedValueOnce({ data: [] })
    axios.post.mockResolvedValueOnce({ data: DECK_A })

    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.createDeck({ name: 'Mono Red' })
    })

    expect(result.current.decks).toHaveLength(1)
    expect(result.current.decks[0].id).toBe('deck-aaa')
    // Temp id must be gone
    expect(result.current.decks[0].id).not.toMatch(/^temp-/)
  })

  it('returns the created deck on success', async () => {
    axios.get.mockResolvedValueOnce({ data: [] })
    axios.post.mockResolvedValueOnce({ data: DECK_A })

    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let created
    await act(async () => {
      created = await result.current.createDeck({ name: 'Mono Red' })
    })

    expect(created).toEqual(DECK_A)
  })

  it('rolls back the optimistic update on server failure', async () => {
    axios.get.mockResolvedValueOnce({ data: [] })
    axios.post.mockRejectedValueOnce(new Error('Server error'))

    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.createDeck({ name: 'Will Fail' })
    })

    expect(result.current.decks).toHaveLength(0)
  })

  it('sets error state when the server call fails', async () => {
    axios.get.mockResolvedValueOnce({ data: [] })
    axios.post.mockRejectedValueOnce({
      response: { data: { error: 'name is required' } },
    })

    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.createDeck({ name: '' })
    })

    expect(result.current.error).toBe('name is required')
  })

  it('returns null on server failure', async () => {
    axios.get.mockResolvedValueOnce({ data: [] })
    axios.post.mockRejectedValueOnce(new Error('fail'))

    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let created
    await act(async () => {
      created = await result.current.createDeck({ name: 'x' })
    })

    expect(created).toBeNull()
  })

  it('calls POST /api/decks with the deck data', async () => {
    axios.get.mockResolvedValueOnce({ data: [] })
    axios.post.mockResolvedValueOnce({ data: DECK_A })

    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.createDeck({ name: 'Mono Red', format: 'Standard' })
    })

    expect(axios.post).toHaveBeenCalledWith('/api/decks', {
      name: 'Mono Red',
      format: 'Standard',
    })
  })

  it('preserves existing decks after a successful create (no stale closure wipe)', async () => {
    axios.get.mockResolvedValueOnce({ data: [DECK_A] })
    axios.post.mockResolvedValueOnce({ data: DECK_B })

    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.decks).toHaveLength(1))

    await act(async () => {
      await result.current.createDeck({ name: 'Mono Blue' })
    })

    // Both DECK_A (pre-existing) and DECK_B (newly created) must be present.
    expect(result.current.decks).toHaveLength(2)
    expect(result.current.decks.map(d => d.id)).toContain('deck-aaa')
    expect(result.current.decks.map(d => d.id)).toContain('deck-bbb')
  })
})

// ── updateDeck ────────────────────────────────────────────────────────────────

describe('useDecks — updateDeck', () => {
  it('optimistically updates the deck in local state', async () => {
    axios.get.mockResolvedValueOnce({ data: [DECK_A] })
    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.decks).toHaveLength(1))

    let resolvePut
    axios.put.mockReturnValueOnce(new Promise(r => { resolvePut = r }))

    act(() => {
      result.current.updateDeck('deck-aaa', { notes: 'Optimistic notes' })
    })

    expect(result.current.decks[0].notes).toBe('Optimistic notes')

    await act(async () =>
      resolvePut({ data: { ...DECK_A, notes: 'Optimistic notes' } })
    )
  })

  it('confirms the optimistic update with the server response', async () => {
    const serverDeck = {
      ...DECK_A,
      notes: 'Server notes',
      updated_at: '2024-06-01T00:00:00.000Z',
    }
    axios.get.mockResolvedValueOnce({ data: [DECK_A] })
    axios.put.mockResolvedValueOnce({ data: serverDeck })

    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.decks).toHaveLength(1))

    await act(async () => {
      await result.current.updateDeck('deck-aaa', { notes: 'Server notes' })
    })

    expect(result.current.decks[0]).toEqual(serverDeck)
  })

  it('rolls back to the previous deck on server failure', async () => {
    axios.get.mockResolvedValueOnce({ data: [DECK_A] })
    axios.put.mockRejectedValueOnce(new Error('fail'))

    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.decks).toHaveLength(1))

    await act(async () => {
      await result.current.updateDeck('deck-aaa', { notes: 'Will be rolled back' })
    })

    expect(result.current.decks[0].notes).toBe('')
  })

  it('sets error state on server failure', async () => {
    axios.get.mockResolvedValueOnce({ data: [DECK_A] })
    axios.put.mockRejectedValueOnce({
      response: { data: { error: 'Deck not found' } },
    })

    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.decks).toHaveLength(1))

    await act(async () => {
      await result.current.updateDeck('deck-aaa', { name: 'x' })
    })

    expect(result.current.error).toBe('Deck not found')
  })

  it('returns null when the deck id is not in local state', async () => {
    axios.get.mockResolvedValueOnce({ data: [] })
    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let res
    await act(async () => {
      res = await result.current.updateDeck('not-here', { notes: 'x' })
    })

    expect(res).toBeNull()
    expect(axios.put).not.toHaveBeenCalled()
  })

  it('calls PUT /api/decks/:id with the patch data', async () => {
    axios.get.mockResolvedValueOnce({ data: [DECK_A] })
    axios.put.mockResolvedValueOnce({ data: DECK_A })

    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.decks).toHaveLength(1))

    await act(async () => {
      await result.current.updateDeck('deck-aaa', { notes: 'hi' })
    })

    expect(axios.put).toHaveBeenCalledWith('/api/decks/deck-aaa', { notes: 'hi' })
  })
})

// ── deleteDeck ────────────────────────────────────────────────────────────────

describe('useDecks — deleteDeck', () => {
  it('optimistically removes the deck from local state', async () => {
    axios.get.mockResolvedValueOnce({ data: [DECK_A, DECK_B] })
    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.decks).toHaveLength(2))

    let resolveDelete
    axios.delete.mockReturnValueOnce(new Promise(r => { resolveDelete = r }))

    act(() => { result.current.deleteDeck('deck-aaa') })

    expect(result.current.decks).toHaveLength(1)
    expect(result.current.decks[0].id).toBe('deck-bbb')

    await act(async () => resolveDelete({ data: { deleted: true } }))
  })

  it('returns true on success', async () => {
    axios.get.mockResolvedValueOnce({ data: [DECK_A] })
    axios.delete.mockResolvedValueOnce({ data: { deleted: true } })

    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.decks).toHaveLength(1))

    let res
    await act(async () => {
      res = await result.current.deleteDeck('deck-aaa')
    })

    expect(res).toBe(true)
  })

  it('rolls back the optimistic remove on server failure', async () => {
    axios.get.mockResolvedValueOnce({ data: [DECK_A, DECK_B] })
    axios.delete.mockRejectedValueOnce(new Error('fail'))

    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.decks).toHaveLength(2))

    await act(async () => {
      await result.current.deleteDeck('deck-aaa')
    })

    expect(result.current.decks).toHaveLength(2)
  })

  it('sets error state on server failure', async () => {
    axios.get.mockResolvedValueOnce({ data: [DECK_A] })
    axios.delete.mockRejectedValueOnce({
      response: { data: { error: 'Deck not found' } },
    })

    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.decks).toHaveLength(1))

    await act(async () => {
      await result.current.deleteDeck('deck-aaa')
    })

    expect(result.current.error).toBe('Deck not found')
  })

  it('returns false on server failure', async () => {
    axios.get.mockResolvedValueOnce({ data: [DECK_A] })
    axios.delete.mockRejectedValueOnce(new Error('fail'))

    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.decks).toHaveLength(1))

    let res
    await act(async () => {
      res = await result.current.deleteDeck('deck-aaa')
    })

    expect(res).toBe(false)
  })

  it('returns false for an id not in local state without calling the API', async () => {
    axios.get.mockResolvedValueOnce({ data: [] })
    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let res
    await act(async () => {
      res = await result.current.deleteDeck('ghost-id')
    })

    expect(res).toBe(false)
    expect(axios.delete).not.toHaveBeenCalled()
  })

  it('calls DELETE /api/decks/:id', async () => {
    axios.get.mockResolvedValueOnce({ data: [DECK_A] })
    axios.delete.mockResolvedValueOnce({ data: { deleted: true } })

    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.decks).toHaveLength(1))

    await act(async () => {
      await result.current.deleteDeck('deck-aaa')
    })

    expect(axios.delete).toHaveBeenCalledWith('/api/decks/deck-aaa')
  })
})

// ── getDeck ───────────────────────────────────────────────────────────────────

describe('useDecks — getDeck', () => {
  it('returns a deck from local state without an API call when cached', async () => {
    axios.get.mockResolvedValueOnce({ data: [DECK_A] })
    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.decks).toHaveLength(1))

    let deck
    await act(async () => {
      deck = await result.current.getDeck('deck-aaa')
    })

    expect(deck).toEqual(DECK_A)
    // Only the initial mount GET — no second call
    expect(axios.get).toHaveBeenCalledTimes(1)
  })

  it('fetches from the API when the deck is not in local state', async () => {
    axios.get.mockResolvedValueOnce({ data: [] }) // mount
    axios.get.mockResolvedValueOnce({ data: DECK_A }) // getDeck fetch

    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let deck
    await act(async () => {
      deck = await result.current.getDeck('deck-aaa')
    })

    expect(deck).toEqual(DECK_A)
    expect(axios.get).toHaveBeenCalledWith('/api/decks/deck-aaa')
  })

  it('returns null and sets error on API failure', async () => {
    axios.get.mockResolvedValueOnce({ data: [] })
    axios.get.mockRejectedValueOnce({
      response: { data: { error: 'Deck not found: deck-zzz' } },
    })

    const { result } = renderHook(() => useDecks(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let deck
    await act(async () => {
      deck = await result.current.getDeck('deck-zzz')
    })

    expect(deck).toBeNull()
    expect(result.current.error).toBe('Deck not found: deck-zzz')
  })
})