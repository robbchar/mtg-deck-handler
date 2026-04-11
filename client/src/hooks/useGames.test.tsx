import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import axios from 'axios'
import { useGames } from './useGames'
import type { GameEntry } from '../types'

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

const mockedAxios = {
  get: vi.mocked(axios.get),
  post: vi.mocked(axios.post),
  put: vi.mocked(axios.put),
  delete: vi.mocked(axios.delete),
}

const DECK_ID = 'deck-abc-123'

const MOCK_ENTRY: GameEntry = {
  id: 'game-uuid-1',
  logged_at: '2025-04-03T18:00:00.000Z',
  result: 'win',
  turn_ended: 6,
  opponent_colors: ['R', 'G'],
  opponent_archetype: 'aggro',
  opening_hand_feel: 'good',
  cards_in_hand: ['Impact Tremors'],
  tough_opponent_card: '',
  notes: '',
  mtga_rank: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── initial state ─────────────────────────────────────────────────────────────

describe('useGames — initial state', () => {
  it('starts with an empty games array before fetch completes', () => {
    mockedAxios.get.mockReturnValueOnce(new Promise(() => {})) // never resolves
    const { result } = renderHook(() => useGames(DECK_ID))
    expect(result.current.games).toEqual([])
  })

  it('starts with loading=true while fetch is in-flight', () => {
    mockedAxios.get.mockReturnValueOnce(new Promise(() => {}))
    const { result } = renderHook(() => useGames(DECK_ID))
    expect(result.current.loading).toBe(true)
  })

  it('starts with error=null', () => {
    mockedAxios.get.mockReturnValueOnce(new Promise(() => {}))
    const { result } = renderHook(() => useGames(DECK_ID))
    expect(result.current.error).toBeNull()
  })

  it('exposes games, loading, error, addGame, and refetch', () => {
    mockedAxios.get.mockReturnValueOnce(new Promise(() => {}))
    const { result } = renderHook(() => useGames(DECK_ID))
    expect(Array.isArray(result.current.games)).toBe(true)
    expect(typeof result.current.loading).toBe('boolean')
    expect(typeof result.current.addGame).toBe('function')
    expect(typeof result.current.refetch).toBe('function')
  })

  it('does not fetch when deckId is undefined', () => {
    renderHook(() => useGames(undefined))
    expect(axios.get).not.toHaveBeenCalled()
  })
})

// ── fetch on mount ────────────────────────────────────────────────────────────

describe('useGames — fetch on mount', () => {
  it('calls GET /api/decks/:id/games with the deck id', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] })
    renderHook(() => useGames(DECK_ID))
    await waitFor(() => expect(axios.get).toHaveBeenCalledWith(`/api/decks/${DECK_ID}/games`))
  })

  it('populates games array after successful fetch', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [MOCK_ENTRY] })
    const { result } = renderHook(() => useGames(DECK_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.games).toEqual([MOCK_ENTRY])
  })

  it('sets loading=false after successful fetch', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] })
    const { result } = renderHook(() => useGames(DECK_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('sets error on fetch failure', async () => {
    mockedAxios.get.mockRejectedValueOnce({ response: { data: { error: 'disk failure' } } })
    const { result } = renderHook(() => useGames(DECK_ID))
    await waitFor(() => expect(result.current.error).toBe('disk failure'))
  })

  it('sets loading=false after a failed fetch', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Network Error'))
    const { result } = renderHook(() => useGames(DECK_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))
  })
})

// ── addGame ───────────────────────────────────────────────────────────────────

describe('useGames — addGame', () => {
  it('returns the created entry on success', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] })
    mockedAxios.post.mockResolvedValueOnce({ data: MOCK_ENTRY })

    const { result } = renderHook(() => useGames(DECK_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let entry: GameEntry | null = null
    await act(async () => {
      entry = await result.current.addGame({ result: 'win' })
    })

    expect(entry).toEqual(MOCK_ENTRY)
  })

  it('prepends the new entry to games (newest first)', async () => {
    const older: GameEntry = { ...MOCK_ENTRY, id: 'older', result: 'loss' }
    mockedAxios.get.mockResolvedValueOnce({ data: [older] })
    mockedAxios.post.mockResolvedValueOnce({ data: MOCK_ENTRY })

    const { result } = renderHook(() => useGames(DECK_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.addGame({ result: 'win' })
    })

    expect(result.current.games[0]).toEqual(MOCK_ENTRY)
    expect(result.current.games[1]).toEqual(older)
  })

  it('calls POST /api/decks/:id/games with the game data', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] })
    mockedAxios.post.mockResolvedValueOnce({ data: MOCK_ENTRY })

    const { result } = renderHook(() => useGames(DECK_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.addGame({ result: 'win', turn_ended: 6 })
    })

    expect(axios.post).toHaveBeenCalledWith(
      `/api/decks/${DECK_ID}/games`,
      expect.objectContaining({ result: 'win', turn_ended: 6 }),
    )
  })

  it('returns null and sets error on failure', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] })
    mockedAxios.post.mockRejectedValueOnce({ response: { data: { error: 'result is required' } } })

    const { result } = renderHook(() => useGames(DECK_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let entry: GameEntry | null = MOCK_ENTRY
    await act(async () => {
      entry = await result.current.addGame({ result: 'win' })
    })

    expect(entry).toBeNull()
    expect(result.current.error).toBe('result is required')
  })

  it('does not add to games list on failure', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] })
    mockedAxios.post.mockRejectedValueOnce(new Error('Server error'))

    const { result } = renderHook(() => useGames(DECK_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.addGame({ result: 'win' })
    })

    expect(result.current.games).toHaveLength(0)
  })

  it('returns null when deckId is undefined', async () => {
    const { result } = renderHook(() => useGames(undefined))
    let entry: GameEntry | null = MOCK_ENTRY
    await act(async () => {
      entry = await result.current.addGame({ result: 'win' })
    })
    expect(entry).toBeNull()
  })
})

// ── removeGame ────────────────────────────────────────────────────────────────

describe('useGames — removeGame', () => {
  it('returns true and removes the entry from games on success', async () => {
    const entry2 = { ...MOCK_ENTRY, id: 'game-2', result: 'loss' as const }
    mockedAxios.get.mockResolvedValueOnce({ data: [MOCK_ENTRY, entry2] })
    mockedAxios.delete.mockResolvedValueOnce({ data: { deleted: true } })

    const { result } = renderHook(() => useGames(DECK_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let success: boolean = false
    await act(async () => {
      success = await result.current.removeGame(MOCK_ENTRY.id)
    })

    expect(success).toBe(true)
    expect(result.current.games.find((g) => g.id === MOCK_ENTRY.id)).toBeUndefined()
    expect(result.current.games).toHaveLength(1)
  })

  it('calls DELETE /api/decks/:id/games/:gameId', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [MOCK_ENTRY] })
    mockedAxios.delete.mockResolvedValueOnce({ data: { deleted: true } })

    const { result } = renderHook(() => useGames(DECK_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.removeGame(MOCK_ENTRY.id)
    })

    expect(axios.delete).toHaveBeenCalledWith(
      `/api/decks/${DECK_ID}/games/${MOCK_ENTRY.id}`,
    )
  })

  it('returns false and sets error on failure', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [MOCK_ENTRY] })
    mockedAxios.delete.mockRejectedValueOnce({ response: { data: { error: 'Game not found' } } })

    const { result } = renderHook(() => useGames(DECK_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let success: boolean = true
    await act(async () => {
      success = await result.current.removeGame(MOCK_ENTRY.id)
    })

    expect(success).toBe(false)
    expect(result.current.error).toBe('Game not found')
  })

  it('does not modify games list on failure', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [MOCK_ENTRY] })
    mockedAxios.delete.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useGames(DECK_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.removeGame(MOCK_ENTRY.id)
    })

    expect(result.current.games).toHaveLength(1)
  })

  it('returns false when deckId is undefined', async () => {
    const { result } = renderHook(() => useGames(undefined))
    let success: boolean = true
    await act(async () => {
      success = await result.current.removeGame('any-id')
    })
    expect(success).toBe(false)
  })
})

// ── refetch ───────────────────────────────────────────────────────────────────

describe('useGames — refetch', () => {
  it('re-fetches the game list when called', async () => {
    mockedAxios.get.mockResolvedValue({ data: [] })

    const { result } = renderHook(() => useGames(DECK_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.refetch()
    })

    expect(axios.get).toHaveBeenCalledTimes(2)
  })

  it('updates games after refetch', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] })
    mockedAxios.get.mockResolvedValueOnce({ data: [MOCK_ENTRY] })

    const { result } = renderHook(() => useGames(DECK_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.games).toEqual([MOCK_ENTRY])
  })
})
