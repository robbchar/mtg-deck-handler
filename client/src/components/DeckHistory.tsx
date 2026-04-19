import { Fragment, useState } from 'react'
import Spinner from './Spinner'
import SnapshotEntry from './SnapshotEntry'
import { useSnapshots } from '../hooks/useSnapshots'
import type { CardEntry, DeckSnapshot, CardDiff, GameEntry, Deck } from '../types'

interface CurrentState {
  cards: CardEntry[]
  sideboard: CardEntry[]
  format: string
  notes: string
}

interface DeckHistoryProps {
  deckId: string
  games: GameEntry[]
  currentState: CurrentState
  activeSnapshotId?: string | null
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

const Connector = () => (
  <div className="flex flex-col items-center py-0.5">
    <div className="h-2 w-px bg-gray-200" />
    <span className="text-xs leading-none text-gray-300">↑</span>
    <div className="h-2 w-px bg-gray-200" />
  </div>
)

export default function DeckHistory({ deckId, games, currentState, activeSnapshotId, onRevert }: DeckHistoryProps) {
  const { snapshots, loading, error, revertSnapshot } = useSnapshots(deckId)
  const [pendingExpanded, setPendingExpanded] = useState(false)

  // Compute pending diff: current deck state vs the most recent snapshot (or empty).
  // Reuses computeDiff by treating currentState as a synthetic snapshot.
  const syntheticCurrent: DeckSnapshot = {
    id: 'pending',
    createdAt: '',
    cards: currentState.cards,
    sideboard: currentState.sideboard,
    format: currentState.format,
    notes: currentState.notes,
  }
  const pendingDiff = computeDiff(syntheticCurrent, snapshots[0] ?? null)
  const pendingFormatChange =
    snapshots.length > 0 && currentState.format !== snapshots[0].format
      ? `${snapshots[0].format || '—'} → ${currentState.format || '—'}`
      : null
  const pendingNotesChanged = snapshots.length > 0 && currentState.notes !== snapshots[0].notes
  const hasPendingChanges = pendingDiff.length > 0 || !!pendingFormatChange || pendingNotesChanged

  const pendingAdded = pendingDiff.filter((d) => d.delta > 0).reduce((s, d) => s + d.delta, 0)
  const pendingRemoved = pendingDiff.filter((d) => d.delta < 0).reduce((s, d) => s + Math.abs(d.delta), 0)
  const pendingTotalCards =
    currentState.cards.reduce((s, c) => s + c.quantity, 0) +
    currentState.sideboard.reduce((s, c) => s + c.quantity, 0)

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

  // Only show the "no history yet" empty state when there are also no pending changes.
  if (snapshots.length === 0 && !hasPendingChanges) {
    return (
      <div className="py-16 text-center text-sm text-gray-400">
        No history yet — changes will appear here after your first editing session.
      </div>
    )
  }

  // When there are pending changes, no committed snapshot is "current".
  const currentSnapshotId = hasPendingChanges ? null : (activeSnapshotId ?? snapshots[0]?.id ?? null)

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
        {/* Pending (unsaved) entry */}
        {hasPendingChanges && (
          <Fragment>
            <div
              className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4"
              data-testid="pending-entry"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 text-sm font-semibold text-gray-500">
                    Working changes
                    <span className="ml-2 text-xs font-normal text-gray-400">· not yet checkpointed</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                    <span>{pendingTotalCards} cards</span>
                    {pendingDiff.length > 0 && (
                      <>
                        <span>·</span>
                        {pendingAdded > 0 && <span className="text-green-600">+{pendingAdded} added</span>}
                        {pendingRemoved > 0 && <span className="text-red-400">−{pendingRemoved} removed</span>}
                        <button
                          type="button"
                          onClick={() => setPendingExpanded((v) => !v)}
                          className="font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none"
                          aria-label={pendingExpanded ? 'hide' : 'show'}
                        >
                          {pendingExpanded ? '▾ hide' : '▸ show'}
                        </button>
                      </>
                    )}
                    {pendingFormatChange && <span className="text-gray-400">· {pendingFormatChange}</span>}
                    {pendingNotesChanged && <span className="text-gray-400">· notes changed</span>}
                  </div>
                  {pendingExpanded && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {pendingDiff.map((d) => {
                        const isAdditional = d.delta > 0 && (d.previousQuantity ?? 0) > 0
                        return (
                          <span
                            key={`${d.section}-${d.name}`}
                            className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                              d.delta > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                            }`}
                          >
                            <span>{d.delta > 0 ? `+${d.delta}` : d.delta}</span>{' '}
                            {isAdditional && <span className="opacity-60">additional </span>}
                            <span>{d.name}</span>
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
                <span className="shrink-0 rounded-lg border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-400">
                  Current
                </span>
              </div>
            </div>
            {snapshots.length > 0 && <Connector />}
          </Fragment>
        )}

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
            <Fragment key={snapshot.id}>
              {index > 0 && <Connector />}
              <SnapshotEntry
                snapshot={snapshot}
                diff={diff}
                formatChange={formatChange}
                notesChanged={notesChanged}
                winsAtPoint={wins}
                lossesAtPoint={losses}
                onRevert={handleRevert}
                isCurrent={snapshot.id === currentSnapshotId}
              />
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
