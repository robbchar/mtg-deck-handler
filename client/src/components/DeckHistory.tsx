import { Fragment, useState } from 'react'
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
  // First snapshot: treat every card as newly added (diff from empty deck)
  if (!previous) {
    const diffs: CardDiff[] = []
    for (const card of current.cards) {
      if (card.quantity > 0) diffs.push({ name: card.name, delta: card.quantity, section: 'mainboard', previousQuantity: 0 })
    }
    for (const card of current.sideboard) {
      if (card.quantity > 0) diffs.push({ name: card.name, delta: card.quantity, section: 'sideboard', previousQuantity: 0 })
    }
    return diffs
  }

  const diffs: CardDiff[] = []
  const sections: Array<'mainboard' | 'sideboard'> = ['mainboard', 'sideboard']

  for (const section of sections) {
    const currCards = section === 'mainboard' ? current.cards : current.sideboard
    const prevCards = section === 'mainboard' ? previous.cards : previous.sideboard

    const prevMap = new Map(prevCards.map((c) => [c.name, c.quantity]))
    const currMap = new Map(currCards.map((c) => [c.name, c.quantity]))
    const allNames = new Set([...prevMap.keys(), ...currMap.keys()])

    for (const name of allNames) {
      const previousQuantity = prevMap.get(name) ?? 0
      const delta = (currMap.get(name) ?? 0) - previousQuantity
      if (delta !== 0) diffs.push({ name, delta, section, previousQuantity })
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
  // Tracks which snapshot is the active/current state of the deck.
  // null = not yet set; falls back to the newest snapshot (snapshots[0]).
  const [currentSnapshotId, setCurrentSnapshotId] = useState<string | null>(null)
  const activeSnapshotId = currentSnapshotId ?? snapshots[0]?.id ?? null

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
    <div>
      <p className="mb-4 text-sm text-gray-500">
        Checkpoints are saved automatically after a period of inactivity. Click{' '}
        <span className="font-medium text-gray-700">Restore</span> on any entry to roll your deck
        back to that state — edits after a restore will remove any checkpoints that followed it.
      </p>
      <div>
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
            if (deck) {
              setCurrentSnapshotId(snapshot.id)
              onRevert(deck, snapshot)
            }
          }

          return (
            <Fragment key={snapshot.id}>
              {index > 0 && (
                <div className="flex flex-col items-center py-0.5">
                  <div className="h-2 w-px bg-gray-200" />
                  <span className="text-xs leading-none text-gray-300">↑</span>
                  <div className="h-2 w-px bg-gray-200" />
                </div>
              )}
              <SnapshotEntry
                snapshot={snapshot}
                diff={diff}
                formatChange={formatChange}
                notesChanged={notesChanged}
                winsAtPoint={wins}
                lossesAtPoint={losses}
                onRevert={handleRevert}
                isCurrent={snapshot.id === activeSnapshotId}
              />
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
