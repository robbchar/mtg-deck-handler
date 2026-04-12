import { useContext, useEffect, useCallback } from 'react'
import client from '../api/client'
import { DeckContext } from '../context/DeckContext'
import type { Deck, DeckMetadata, CardEntry } from '../types'

interface CreateDeckInput {
  name: string
  format?: string
  notes?: string
  cards?: CardEntry[]
  sideboard?: CardEntry[]
}

interface DeckPatch {
  name?: string
  format?: string
  notes?: string
  cards?: CardEntry[]
  sideboard?: CardEntry[]
}

function getErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } }; message?: string }
  return e?.response?.data?.error ?? e?.message ?? fallback
}

/**
 * Custom hook that exposes deck data and all CRUD operations backed by the
 * Express API at /api/decks/*.
 *
 * Optimistic updates are applied immediately to local state via reducer
 * actions that always operate on current state (no stale closure risk).
 * If the server call fails the change is rolled back and the error is placed
 * in state. Errors are never re-thrown.
 */
export function useDecks() {
  const context = useContext(DeckContext)

  if (!context) {
    throw new Error('useDecks must be used within a DeckProvider')
  }

  const { state, dispatch } = context
  const { decks, loading, error } = state

  // ── Fetch deck list ────────────────────────────────────────────────────────

  const fetchDecks = useCallback(async () => {
    dispatch({ type: 'FETCH_START' })
    try {
      const { data } = await client.get<DeckMetadata[]>('/api/decks')
      dispatch({ type: 'FETCH_SUCCESS', payload: data })
    } catch (err) {
      dispatch({
        type: 'FETCH_ERROR',
        payload: getErrorMessage(err, 'Failed to load decks'),
      })
    }
  }, [dispatch])

  // Fetch on mount.
  useEffect(() => {
    let cancelled = false
    const wrappedFetch = async () => {
      dispatch({ type: 'FETCH_START' })
      try {
        const { data } = await client.get<DeckMetadata[]>('/api/decks')
        if (!cancelled) dispatch({ type: 'FETCH_SUCCESS', payload: data })
      } catch (err) {
        if (!cancelled) {
          dispatch({
            type: 'FETCH_ERROR',
            payload: getErrorMessage(err, 'Failed to load decks'),
          })
        }
      }
    }
    wrappedFetch()
    return () => {
      cancelled = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Re-fetch the deck list (e.g. after a network error). */
  const refetch = useCallback(() => fetchDecks(), [fetchDecks])

  // ── createDeck ────────────────────────────────────────────────────────────

  /**
   * Creates a new deck. Optimistically appends a temporary placeholder to
   * local state immediately.
   *
   * On success: `REPLACE_TEMP_DECK` swaps the placeholder with the real
   * server deck — the reducer finds it by tempId in *current* state, so
   * there is no stale-closure risk.
   *
   * On failure: `ROLLBACK_ADD` removes the placeholder by tempId.
   */
  const createDeck = useCallback(
    async (data: CreateDeckInput): Promise<DeckMetadata | null> => {
      const tempId = `temp-${Date.now()}`
      const optimistic: DeckMetadata = {
        id: tempId,
        name: data.name ?? 'New Deck',
        format: data.format ?? '',
        notes: data.notes ?? '',
        card_count: 0,
        updated_at: new Date().toISOString(),
      }

      dispatch({ type: 'ADD_DECK', payload: optimistic })

      try {
        const { data: created } = await client.post<DeckMetadata>('/api/decks', data)
        // Reducer locates tempId in current state and replaces — no stale closure.
        dispatch({
          type: 'REPLACE_TEMP_DECK',
          payload: { tempId, deck: created },
        })
        return created
      } catch (err) {
        dispatch({ type: 'ROLLBACK_ADD', payload: tempId })
        dispatch({
          type: 'SET_ERROR',
          payload: getErrorMessage(err, 'Failed to create deck'),
        })
        return null
      }
    },
    [dispatch] // `decks` is NOT needed — reducer operates on current state
  )

  // ── updateDeck ────────────────────────────────────────────────────────────

  /**
   * Merges `data` into the deck identified by `id`. Applies the change
   * optimistically via `UPDATE_DECK`; rolls back with the pre-change snapshot
   * on server failure.
   */
  const updateDeck = useCallback(
    async (id: string, data: DeckPatch): Promise<DeckMetadata | null> => {
      const previous = decks.find((d) => d.id === id)
      if (!previous) return null

      // DeckPatch may contain cards/sideboard (not in DeckMetadata) for the
      // server call; the cast is safe because the list view never reads those.
      const optimistic = { ...previous, ...data } as DeckMetadata
      dispatch({ type: 'UPDATE_DECK', payload: optimistic })

      try {
        const { data: updated } = await client.put<DeckMetadata>(`/api/decks/${id}`, data)
        dispatch({ type: 'UPDATE_DECK', payload: updated })
        return updated
      } catch (err) {
        // `previous` is a snapshot captured before the optimistic dispatch.
        dispatch({ type: 'UPDATE_DECK', payload: previous })
        dispatch({
          type: 'SET_ERROR',
          payload: getErrorMessage(err, 'Failed to update deck'),
        })
        return null
      }
    },
    [decks, dispatch]
  )

  // ── deleteDeck ────────────────────────────────────────────────────────────

  /**
   * Removes the deck identified by `id` from local state immediately via
   * `REMOVE_DECK`. On server failure, `ROLLBACK_REMOVE` re-appends the
   * pre-captured snapshot.
   */
  const deleteDeck = useCallback(
    async (id: string): Promise<boolean> => {
      const previous = decks.find((d) => d.id === id)
      if (!previous) return false

      dispatch({ type: 'REMOVE_DECK', payload: id })

      try {
        await client.delete(`/api/decks/${id}`)
        return true
      } catch (err) {
        dispatch({ type: 'ROLLBACK_REMOVE', payload: previous })
        dispatch({
          type: 'SET_ERROR',
          payload: getErrorMessage(err, 'Failed to delete deck'),
        })
        return false
      }
    },
    [decks, dispatch]
  )

  // ── getDeck ───────────────────────────────────────────────────────────────

  /**
   * Fetches a single full deck by id from GET /api/decks/:id.
   *
   * Always hits the API — the list cache holds DeckMetadata which has no
   * cards/sideboard arrays, so it cannot be used as a Deck substitute.
   */
  const getDeck = useCallback(
    async (id: string): Promise<Deck | null> => {
      try {
        const { data } = await client.get<Deck>(`/api/decks/${id}`)
        return data
      } catch (err) {
        dispatch({
          type: 'SET_ERROR',
          payload: getErrorMessage(err, 'Failed to fetch deck'),
        })
        return null
      }
    },
    [dispatch]
  )

  return { decks, loading, error, createDeck, updateDeck, deleteDeck, getDeck, refetch }
}
