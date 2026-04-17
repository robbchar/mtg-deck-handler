import Spinner from './Spinner'
import SnapshotEntry from './SnapshotEntry'
import { useSnapshots } from '../hooks/useSnapshots'
import type { DeckSnapshot, CardDiff, GameEntry, Deck } from '../types'

interface DeckHistoryProps {
  deckId: string
  games: GameEntry[]
  onRevert: (deck: Deck, snapshot: DeckSnapshot) => void
}

/**
 * Computes the card-level diff between two consecutive snapshots.
 * `current` is the later snapshot; `previous` is the earlier one (or null for
 * the oldest snapshot, which has no predecessor to diff against).
 */
function computeDiff(current: DeckSnapshot, previous: DeckSnapshot | null): CardDiff[] {
  if (!previous) return []

  const diffs: CardDiff[] = []
  const sections: Array<'mainboard' | 'sideboard'> = ['mainboard', 'sideboard']

  for (const section of sections) {
    const currCards = section === 'mainboard' ? current.cards : current.sideboard
    const prevCards = section === 'mainboard' ? previous.cards : previous.sideboard

    const prevMap = new Map(prevCards.map((c) => [c.name, c.quantity]))
    const currMap = new Map(currCards.map((c) => [c.name, c.quantity]))
    const allNames = new Set([...prevMap.keys(), ...currMap.keys()])

    for (const name of allNames) {
      const delta = (currMap.get(name) ?? 0) - (prevMap.get(name) ?? 0)
      if (delta !== 0) diffs.push({ name, delta, section })
    }
  }

  return diffs
}

/**
 * Returns wins and losses from `games` that were logged before `cutoff` (ISO).
 */
function wlAtPoint(games: GameEntry[], cutoff: string) {
  const cutoffDate = new Date(cutoff)
  const before = games.filter((g) => new Date(g.logged_at) <= cutoffDate)
  return {
    wins: before.filter((g) => g.result === 'win').length,
    losses: before.filter((g) => g.result === 'loss').length,
  }
}

export default function DeckHistory({ deckId, games, onRevert }: DeckHistoryProps) {
  const { snapshots, loading, error, revertSnapshot } = useSnapshots(deckId)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="history-loading">
        <Spinner className="h-6 w-6" />
        <span className="sr-only">Loading history…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
      >
        {error}
      </div>
    )
  }

  if (snapshots.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-gray-400">
        No history yet — changes will appear here after your first editing session.
      </div>
    )
  }

  // snapshots is ordered newest → oldest (API contract)
  // For diffs: compare each snapshot to its predecessor (the next in the array)
  return (
    <div className="space-y-3">
      {snapshots.map((snapshot, index) => {
        const previous = snapshots[index + 1] ?? null
        const diff = computeDiff(snapshot, previous)
        const { wins, losses } = wlAtPoint(games, snapshot.createdAt)

        const formatChange =
          previous && snapshot.format !== previous.format
            ? `${previous.format || '—'} → ${snapshot.format || '—'}`
            : null

        const notesChanged = previous ? snapshot.notes !== previous.notes : false

        async function handleRevert() {
          const deck = await revertSnapshot(snapshot.id)
          if (deck) onRevert(deck, snapshot)
        }

        return (
          <SnapshotEntry
            key={snapshot.id}
            snapshot={snapshot}
            diff={diff}
            formatChange={formatChange}
            notesChanged={notesChanged}
            winsAtPoint={wins}
            lossesAtPoint={losses}
            onRevert={handleRevert}
          />
        )
      })}
    </div>
  )
}
