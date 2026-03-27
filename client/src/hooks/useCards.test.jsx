import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import axios from 'axios'
import { useCards } from './useCards'

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

const MOCK_CARD = {
  id: 'scryfall-abc-001',
  name: 'Lightning Bolt',
  mana_cost: '{R}',
  type_line: 'Instant',
}

const MOCK_CARD_2 = {
  id: 'scryfall-def-002',
  name: 'Mountain',
  mana_cost: null,
  type_line: 'Basic Land — Mountain',
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── initial state ─────────────────────────────────────────────────────────────

describe('useCards — initial state', () => {
  it('searching starts as false', () => {
    const { result } = renderHook(() => useCards())
    expect(result.current.searching).toBe(false)
  })

  it('error starts as null', () => {
    const { result } = renderHook(() => useCards())
    expect(result.current.error).toBeNull()
  })

  it('exposes searchCards, getCard, searching, and error', () => {
    const { result } = renderHook(() => useCards())
    expect(typeof result.current.searchCards).toBe('function')
    expect(typeof result.current.getCard).toBe('function')
    expect(typeof result.current.searching).toBe('boolean')
    expect(
      result.current.error === null || typeof result.current.error === 'string'
    ).toBe(true)
  })
})

// ── searchCards ───────────────────────────────────────────────────────────────

describe('useCards — searchCards', () => {
  it('returns an array of cards from the API', async () => {
    axios.get.mockResolvedValueOnce({ data: [MOCK_CARD, MOCK_CARD_2] })

    const { result } = renderHook(() => useCards())
    let cards
    await act(async () => {
      cards = await result.current.searchCards('lightning')
    })

    expect(cards).toEqual([MOCK_CARD, MOCK_CARD_2])
  })

  it('calls GET /api/cards/search with q param', async () => {
    axios.get.mockResolvedValueOnce({ data: [] })

    const { result } = renderHook(() => useCards())
    await act(async () => {
      await result.current.searchCards('lightning bolt')
    })

    expect(axios.get).toHaveBeenCalledWith('/api/cards/search', {
      params: { q: 'lightning bolt' },
    })
  })

  it('trims the query before sending', async () => {
    axios.get.mockResolvedValueOnce({ data: [] })

    const { result } = renderHook(() => useCards())
    await act(async () => {
      await result.current.searchCards('  lightning bolt  ')
    })

    expect(axios.get).toHaveBeenCalledWith('/api/cards/search', {
      params: { q: 'lightning bolt' },
    })
  })

  it('sets searching=true while the request is in-flight', async () => {
    let resolve
    axios.get.mockReturnValueOnce(new Promise(r => { resolve = r }))

    const { result } = renderHook(() => useCards())

    act(() => { result.current.searchCards('lightning') })
    expect(result.current.searching).toBe(true)

    await act(async () => { resolve({ data: [] }) })
    expect(result.current.searching).toBe(false)
  })

  it('resets searching=false after the request completes', async () => {
    axios.get.mockResolvedValueOnce({ data: [MOCK_CARD] })

    const { result } = renderHook(() => useCards())
    await act(async () => {
      await result.current.searchCards('lightning')
    })

    expect(result.current.searching).toBe(false)
  })

  it('resets searching=false even when the request errors', async () => {
    axios.get.mockRejectedValueOnce(new Error('Network Error'))

    const { result } = renderHook(() => useCards())
    await act(async () => {
      await result.current.searchCards('lightning')
    })

    expect(result.current.searching).toBe(false)
  })

  it('returns empty array on API error without throwing', async () => {
    axios.get.mockRejectedValueOnce(new Error('Server error'))

    const { result } = renderHook(() => useCards())
    let cards
    await act(async () => {
      cards = await result.current.searchCards('lightning')
    })

    expect(cards).toEqual([])
  })

  it('sets error state on API failure', async () => {
    axios.get.mockRejectedValueOnce({
      response: { data: { error: 'Rate limited' } },
    })

    const { result } = renderHook(() => useCards())
    await act(async () => {
      await result.current.searchCards('lightning')
    })

    expect(result.current.error).toBe('Rate limited')
  })

  it('clears error state before each new search', async () => {
    axios.get.mockRejectedValueOnce(new Error('fail'))
    axios.get.mockResolvedValueOnce({ data: [MOCK_CARD] })

    const { result } = renderHook(() => useCards())
    await act(async () => { await result.current.searchCards('first') })
    expect(result.current.error).toBeTruthy()

    await act(async () => { await result.current.searchCards('second') })
    expect(result.current.error).toBeNull()
  })

  it('returns empty array and skips API call for empty query', async () => {
    const { result } = renderHook(() => useCards())
    let cards
    await act(async () => {
      cards = await result.current.searchCards('')
    })

    expect(cards).toEqual([])
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('returns empty array and skips API call for whitespace-only query', async () => {
    const { result } = renderHook(() => useCards())
    let cards
    await act(async () => {
      cards = await result.current.searchCards('   ')
    })

    expect(cards).toEqual([])
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('returns empty array for null query without throwing', async () => {
    const { result } = renderHook(() => useCards())
    let cards
    await act(async () => {
      cards = await result.current.searchCards(null)
    })

    expect(cards).toEqual([])
    expect(axios.get).not.toHaveBeenCalled()
  })
})

// ── getCard ───────────────────────────────────────────────────────────────────

describe('useCards — getCard', () => {
  it('returns the card object on success', async () => {
    axios.get.mockResolvedValueOnce({ data: MOCK_CARD })

    const { result } = renderHook(() => useCards())
    let card
    await act(async () => {
      card = await result.current.getCard('scryfall-abc-001')
    })

    expect(card).toEqual(MOCK_CARD)
  })

  it('calls GET /api/cards/:scryfallId', async () => {
    axios.get.mockResolvedValueOnce({ data: MOCK_CARD })

    const { result } = renderHook(() => useCards())
    await act(async () => {
      await result.current.getCard('scryfall-abc-001')
    })

    expect(axios.get).toHaveBeenCalledWith('/api/cards/scryfall-abc-001')
  })

  it('returns null on 404 without throwing', async () => {
    axios.get.mockRejectedValueOnce({
      response: { status: 404, data: { error: 'Card not found' } },
    })

    const { result } = renderHook(() => useCards())
    let card
    await act(async () => {
      card = await result.current.getCard('fake-id')
    })

    expect(card).toBeNull()
  })

  it('sets error state on API failure', async () => {
    axios.get.mockRejectedValueOnce({
      response: { data: { error: 'Card not found: fake-id' } },
    })

    const { result } = renderHook(() => useCards())
    await act(async () => {
      await result.current.getCard('fake-id')
    })

    expect(result.current.error).toBe('Card not found: fake-id')
  })

  it('returns null on network error without throwing', async () => {
    axios.get.mockRejectedValueOnce(new Error('Network Error'))

    const { result } = renderHook(() => useCards())
    let card
    await act(async () => {
      card = await result.current.getCard('any-id')
    })

    expect(card).toBeNull()
  })

  it('returns null for null scryfallId without calling the API', async () => {
    const { result } = renderHook(() => useCards())
    let card
    await act(async () => {
      card = await result.current.getCard(null)
    })

    expect(card).toBeNull()
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('returns null for empty string scryfallId without calling the API', async () => {
    const { result } = renderHook(() => useCards())
    let card
    await act(async () => {
      card = await result.current.getCard('')
    })

    expect(card).toBeNull()
    expect(axios.get).not.toHaveBeenCalled()
  })
})