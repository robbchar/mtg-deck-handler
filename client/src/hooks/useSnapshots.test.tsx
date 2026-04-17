import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import client from '../api/client'
import { useSnapshots } from './useSnapshots'
import type { DeckSnapshot } from '../types'

vi.mock('../firebase', () => ({ auth: { currentUser: null } }))
vi.mock('../api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

const mockedAxios = {
  get: vi.mocked(client.get),
  post: vi.mocked(client.post),
}

const DECK_ID = 'deck-abc'

const MOCK_SNAPSHOT: DeckSnapshot = {
  id: 'snap-1',
  createdAt: '2026-04-16T10:00:00.000Z',
  cards: [],
  sideboard: [],
  format: 'Modern',
  notes: '',
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── initial state ─────────────────────────────────────────────────────────────

describe('useSnapshots — initial state', () => {
  it('starts with an empty snapshots array while loading', () => {
    mockedAxios.get.mockReturnValueOnce(new Promise(() => {}))
    const { result } = renderHook(() => useSnapshots(DECK_ID))
    expect(result.current.snapshots).toEqual([])
  })

  it('starts with loading=true', () => {
    mockedAxios.get.mockReturnValueOnce(new Promise(() => {}))
    const { result } = renderHook(() => useSnapshots(DECK_ID))
    expect(result.current.loading).toBe(true)
  })

  it('starts with error=null', () => {
    mockedAxios.get.mockReturnValueOnce(new Promise(() => {}))
    const { result } = renderHook(() => useSnapshots(DECK_ID))
    expect(result.current.error).toBeNull()
  })

  it('does not fetch when deckId is undefined', () => {
    renderHook(() => useSnapshots(undefined))
    expect(client.get).not.toHaveBeenCalled()
  })
})

// ── fetch on mount ────────────────────────────────────────────────────────────

describe('useSnapshots — fetch on mount', () => {
  it('calls GET /api/decks/:id/snapshots', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] })
    renderHook(() => useSnapshots(DECK_ID))
    await waitFor(() => expect(client.get).toHaveBeenCalledWith(`/api/decks/${DECK_ID}/snapshots`))
  })

  it('populates snapshots on success', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [MOCK_SNAPSHOT] })
    const { result } = renderHook(() => useSnapshots(DECK_ID))
    await waitFor(() => expect(result.current.snapshots).toEqual([MOCK_SNAPSHOT]))
  })

  it('sets loading=false after fetch completes', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] })
    const { result } = renderHook(() => useSnapshots(DECK_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('sets error on fetch failure', async () => {
    mockedAxios.get.mockRejectedValueOnce({ response: { data: { error: 'db error' } } })
    const { result } = renderHook(() => useSnapshots(DECK_ID))
    await waitFor(() => expect(result.current.error).toBe('db error'))
  })
})

// ── revertSnapshot ────────────────────────────────────────────────────────────

describe('useSnapshots — revertSnapshot', () => {
  it('calls POST /api/decks/:id/snapshots/:snapshotId/revert', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] })
    mockedAxios.post.mockResolvedValueOnce({ data: { id: DECK_ID } })
    mockedAxios.get.mockResolvedValueOnce({ data: [] }) // post-revert refetch
    const { result } = renderHook(() => useSnapshots(DECK_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.revertSnapshot('snap-1')
    })
    expect(client.post).toHaveBeenCalledWith(`/api/decks/${DECK_ID}/snapshots/snap-1/revert`)
  })

  it('returns the updated deck on success', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] })
    const updatedDeck = { id: DECK_ID, name: 'Test', cards: [], sideboard: [], format: 'Modern', notes: '' }
    mockedAxios.post.mockResolvedValueOnce({ data: updatedDeck })
    mockedAxios.get.mockResolvedValueOnce({ data: [] }) // post-revert refetch
    const { result } = renderHook(() => useSnapshots(DECK_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))
    let deck: unknown
    await act(async () => {
      deck = await result.current.revertSnapshot('snap-1')
    })
    expect(deck).toEqual(updatedDeck)
  })

  it('returns null on revert failure', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] })
    mockedAxios.post.mockRejectedValueOnce(new Error('server error'))
    const { result } = renderHook(() => useSnapshots(DECK_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))
    let deck: unknown
    await act(async () => {
      deck = await result.current.revertSnapshot('snap-1')
    })
    expect(deck).toBeNull()
  })

  it('returns null when deckId is undefined', async () => {
    const { result } = renderHook(() => useSnapshots(undefined))
    let deck: unknown
    await act(async () => {
      deck = await result.current.revertSnapshot('snap-1')
    })
    expect(deck).toBeNull()
  })
})
