import { useState } from 'react'
import client from '../api/client'
import type { ScryfallCard } from '../types'

function getErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } }; message?: string }
  return e?.response?.data?.error ?? e?.message ?? fallback
}

/**
 * Custom hook for Scryfall card search and single-card lookup.
 *
 * All requests go through the Express proxy at /api/cards/*.
 * API errors are captured in `error` state rather than thrown.
 */
export function useCards() {
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Searches Scryfall for cards matching the given query.
   * Returns an empty array for blank queries, no-result searches, or errors.
   */
  async function searchCards(query: string | null | undefined): Promise<ScryfallCard[]> {
    if (!query || typeof query !== 'string' || !query.trim()) return []

    setSearching(true)
    setError(null)
    try {
      const { data } = await client.get<ScryfallCard[]>('/api/cards/search', {
        params: { q: query.trim() },
      })
      return data
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to search cards'))
      return []
    } finally {
      setSearching(false)
    }
  }

  /**
   * Fetches a single card by its Scryfall UUID.
   * Returns null for missing/unknown cards or on any API error.
   */
  async function getCard(scryfallId: string | null | undefined): Promise<ScryfallCard | null> {
    if (!scryfallId) return null
    setError(null)
    try {
      const { data } = await client.get<ScryfallCard>(`/api/cards/${scryfallId}`)
      return data
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to fetch card'))
      return null
    }
  }

  return { searchCards, getCard, searching, error }
}
