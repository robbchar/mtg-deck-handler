import { useContext, useEffect, useCallback } from 'react'
import axios from 'axios'
import { DeckContext } from '../context/DeckContext.jsx'

/**
 * Custom hook that exposes deck data and all CRUD operations backed by the
 * Express API at /api/decks/*.
 *
 * Optimistic updates are applied immediately to local state via reducer
 * actions that always operate on current state (no stale closure risk).
 * If the server call fails the change is rolled back and the error is placed
 * in state. Errors are never re-thrown.
 *
 * @returns {{
 *   decks: object[],
 *   loading: boolean,
 *   error: string | null,
 *   createDeck: (data: object) => Promise<object | null>,
 *   updateDeck: (id: string, data: object) => Promise<object | null>,
 *   deleteDeck: (id: string) => Promise<boolean>,
 *   getDeck: (id: string) => Promise<object | null>,
 * }}
 */
export function useDecks() {
  const context = useContext(DeckContext)

  if (!context) {
    throw new Error('useDecks must be used within a DeckProvider')
  }

  const { state, dispatch } = context
  const { decks, loading, error } = state

  // ── Fetch deck list on mount ──────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    async function fetchDecks() {
      dispatch({ type: 'FETCH_START' })
      try {
        const { data } = await axios.get('/api/decks')
        if (!cancelled) dispatch({ type: 'FETCH_SUCCESS', payload: data })
      } catch (err) {
        if (!cancelled) {
          dispatch({
            type: 'FETCH_ERROR',
            payload:
              err?.response?.data?.error ??
              err.message ??
              'Failed to load decks',
          })
        }
      }
    }

    fetchDecks()
    return () => {
      cancelled = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
   *
   * @param {object} data - At minimum `{ name: string }`.
   * @returns {Promise<object | null>} The created deck, or null on error.
   */
  const createDeck = useCallback(
    async (data) => {
      const tempId = `temp-${Date.now()}`
      const optimistic = {
        name: data.name ?? 'New Deck',
        format: data.format ?? '',
        notes: data.notes ?? '',
        cards: [],
        sideboard: [],
        card_count: 0,
        updated_at: new Date().toISOString(),
        ...data,
        id: tempId, // always use tempId, never the caller's id
      }

      dispatch({ type: 'ADD_DECK', payload: optimistic })

      try {
        const { data: created } = await axios.post('/api/decks', data)
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
          payload:
            err?.response?.data?.error ??
            err.message ??
            'Failed to create deck',
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
   *
   * Both the optimistic dispatch and the rollback dispatch use `UPDATE_DECK`
   * which replaces by id inside the reducer — current state, not a closure.
   *
   * @param {string} id
   * @param {object} data - Fields to merge into the existing deck.
   * @returns {Promise<object | null>} The updated deck, or null on error.
   */
  const updateDeck = useCallback(
    async (id, data) => {
      const previous = decks.find((d) => d.id === id)
      if (!previous) return null

      const optimistic = { ...previous, ...data }
      dispatch({ type: 'UPDATE_DECK', payload: optimistic })

      try {
        const { data: updated } = await axios.put(`/api/decks/${id}`, data)
        dispatch({ type: 'UPDATE_DECK', payload: updated })
        return updated
      } catch (err) {
        // `previous` is a snapshot captured before the optimistic dispatch.
        dispatch({ type: 'UPDATE_DECK', payload: previous })
        dispatch({
          type: 'SET_ERROR',
          payload:
            err?.response?.data?.error ??
            err.message ??
            'Failed to update deck',
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
   * pre-captured snapshot — the reducer appends to current state so there
   * is no stale-closure risk in the rollback path.
   *
   * @param {string} id
   * @returns {Promise<boolean>} true on success, false on error.
   */
  const deleteDeck = useCallback(
    async (id) => {
      const previous = decks.find((d) => d.id === id)
      if (!previous) return false

      dispatch({ type: 'REMOVE_DECK', payload: id })

      try {
        await axios.delete(`/api/decks/${id}`)
        return true
      } catch (err) {
        dispatch({ type: 'ROLLBACK_REMOVE', payload: previous })
        dispatch({
          type: 'SET_ERROR',
          payload:
            err?.response?.data?.error ??
            err.message ??
            'Failed to delete deck',
        })
        return false
      }
    },
    [decks, dispatch]
  )

  // ── getDeck ───────────────────────────────────────────────────────────────

  /**
   * Returns a single deck by id. Serves from the local cache when available;
   * otherwise fetches GET /api/decks/:id from the server and returns it
   * (without mutating local state — a full deck may have more fields than the
   * list metadata).
   *
   * @param {string} id
   * @returns {Promise<object | null>} Full deck object, or null on error.
   */
  const getDeck = useCallback(
    async (id) => {
      const cached = decks.find((d) => d.id === id)
      if (cached) return cached

      try {
        const { data } = await axios.get(`/api/decks/${id}`)
        return data
      } catch (err) {
        dispatch({
          type: 'SET_ERROR',
          payload:
            err?.response?.data?.error ??
            err.message ??
            'Failed to fetch deck',
        })
        return null
      }
    },
    [decks, dispatch]
  )

  return { decks, loading, error, createDeck, updateDeck, deleteDeck, getDeck }
}