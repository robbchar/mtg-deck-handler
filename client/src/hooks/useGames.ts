import { useState, useEffect } from 'react'
import client from '../api/client'
import type { GameEntry, NewGameEntry } from '../types'

function getErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } }; message?: string }
  return e?.response?.data?.error ?? e?.message ?? fallback
}

/**
 * Fetches and manages the game log for a single deck.
 *
 * Fetches on mount. Exposes `addGame` which POSTs a new entry and refreshes
 * the list on success.
 */
export function useGames(deckId: string | undefined) {
  const [games, setGames] = useState<GameEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchGames() {
    if (!deckId) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await client.get<GameEntry[]>(`/api/decks/${deckId}/games`)
      setGames(data)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load game log'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!deckId) return
      setLoading(true)
      setError(null)
      try {
        const { data } = await client.get<GameEntry[]>(`/api/decks/${deckId}/games`)
        if (!cancelled) setGames(data)
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load game log'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [deckId])

  async function removeGame(gameId: string): Promise<boolean> {
    if (!deckId) return false
    try {
      await client.delete(`/api/decks/${deckId}/games/${gameId}`)
      setGames((prev) => prev.filter((g) => g.id !== gameId))
      return true
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to remove game'))
      return false
    }
  }

  async function addGame(gameData: NewGameEntry): Promise<GameEntry | null> {
    if (!deckId) return null
    try {
      const { data: entry } = await client.post<GameEntry>(
        `/api/decks/${deckId}/games`,
        gameData,
      )
      // Prepend the new entry (list is newest-first from the API)
      setGames((prev) => [entry, ...prev])
      return entry
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to log game'))
      return null
    }
  }

  return { games, loading, error, addGame, removeGame, refetch: fetchGames }
}
