import { useState, useEffect, useCallback } from 'react'
import client from '../api/client'
import type { DeckSnapshot, Deck } from '../types'

function getErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } }; message?: string }
  return e?.response?.data?.error ?? e?.message ?? fallback
}

/**
 * Fetches and manages deck snapshots for a single deck.
 * Snapshots are loaded on mount. Exposes `revertSnapshot` which POSTs to
 * the revert endpoint and returns the updated deck (or null on failure).
 */
export function useSnapshots(deckId: string | undefined) {
  const [snapshots, setSnapshots] = useState<DeckSnapshot[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!deckId) return
      setLoading(true)
      setError(null)
      try {
        const { data } = await client.get<DeckSnapshot[]>(`/api/decks/${deckId}/snapshots`)
        if (!cancelled) setSnapshots(data)
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load history'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [deckId])

  const refetchSnapshots = useCallback(async () => {
    if (!deckId) return
    try {
      const { data } = await client.get<DeckSnapshot[]>(`/api/decks/${deckId}/snapshots`)
      setSnapshots(data)
    } catch {
      // silently ignore background refetch errors
    }
  }, [deckId])

  const revertSnapshot = useCallback(
    async (snapshotId: string): Promise<Deck | null> => {
      if (!deckId) return null
      try {
        await client.post(`/api/decks/${deckId}/snapshots/${snapshotId}/revert`)
        // Re-fetch the full deck so the caller gets complete, server-confirmed data
        // (the revert POST response may lack Scryfall fields stored on the deck doc)
        const { data: freshDeck } = await client.get<Deck>(`/api/decks/${deckId}`)
        await refetchSnapshots()
        return freshDeck
      } catch (err) {
        setError(getErrorMessage(err, 'Failed to revert deck'))
        return null
      }
    },
    [deckId, refetchSnapshots],
  )

  return { snapshots, loading, error, revertSnapshot }
}
