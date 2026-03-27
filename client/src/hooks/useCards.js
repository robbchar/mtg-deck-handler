import { useState, useCallback } from 'react'
import axios from 'axios'

/**
 * Custom hook for Scryfall card search and single-card lookup.
 *
 * All requests go through the Express proxy at /api/cards/*.
 * API errors are captured in `error` state rather than thrown.
 *
 * @returns {{
 *   searchCards: (query: string) => Promise<object[]>,
 *   getCard: (scryfallId: string) => Promise<object | null>,
 *   searching: boolean,
 *   error: string | null,
 * }}
 */
export function useCards() {
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)

  /**
   * Searches Scryfall for cards matching the given query.
   * Returns an empty array for blank queries, no-result searches, or errors.
   *
   * @param {string} query
   * @returns {Promise<object[]>}
   */
  const searchCards = useCallback(async (query) => {
    if (!query || typeof query !== 'string' || !query.trim()) return []

    setSearching(true)
    setError(null)
    try {
      const { data } = await axios.get('/api/cards/search', {
        params: { q: query.trim() },
      })
      return data
    } catch (err) {
      setError(
        err?.response?.data?.error ?? err.message ?? 'Failed to search cards'
      )
      return []
    } finally {
      setSearching(false)
    }
  }, [])

  /**
   * Fetches a single card by its Scryfall UUID.
   * Returns null for missing/unknown cards or on any API error.
   *
   * @param {string} scryfallId
   * @returns {Promise<object | null>}
   */
  const getCard = useCallback(async (scryfallId) => {
    if (!scryfallId) return null
    setError(null)
    try {
      const { data } = await axios.get(`/api/cards/${scryfallId}`)
      return data
    } catch (err) {
      setError(
        err?.response?.data?.error ?? err.message ?? 'Failed to fetch card'
      )
      return null
    }
  }, [])

  return { searchCards, getCard, searching, error }
}