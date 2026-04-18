import { useState } from 'react'
import type { DeckSnapshot, CardDiff } from '../types'

interface SnapshotEntryProps {
  snapshot: DeckSnapshot
  diff: CardDiff[]
  formatChange: string | null
  notesChanged: boolean
  winsAtPoint: number
  lossesAtPoint: number
  onRevert: () => void
}

function formatSnapshotDate(iso: string): string {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  )
}

export default function SnapshotEntry({
  snapshot,
  diff,
  formatChange,
  notesChanged,
  winsAtPoint,
  lossesAtPoint,
  onRevert,
}: SnapshotEntryProps) {
  const [expanded, setExpanded] = useState(false)

  const totalCards =
    snapshot.cards.reduce((s, c) => s + c.quantity, 0) +
    snapshot.sideboard.reduce((s, c) => s + c.quantity, 0)

  const added = diff.filter((d) => d.delta > 0).reduce((s, d) => s + d.delta, 0)
  const removed = diff.filter((d) => d.delta < 0).reduce((s, d) => s + Math.abs(d.delta), 0)
  const hasChanges = diff.length > 0 || formatChange || notesChanged

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        {/* Left: meta */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-sm font-semibold text-gray-900">
            {formatSnapshotDate(snapshot.createdAt)}
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
            <span>{totalCards} cards</span>
            <span>·</span>
            <span className="font-medium text-green-600">{winsAtPoint}W</span>
            <span>–</span>
            <span className="font-medium text-red-500">{lossesAtPoint}L</span>
          </div>

          {/* Collapsed diff summary */}
          {!hasChanges ? (
            <p className="text-xs text-gray-400">No card changes</p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
              {diff.length > 0 && (
                <>
                  {added > 0 && <span>+{added} added</span>}
                  {removed > 0 && <span>−{removed} removed</span>}
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none"
                    aria-label={expanded ? 'hide' : 'show'}
                  >
                    {expanded ? '▾ hide' : '▸ show'}
                  </button>
                </>
              )}
              {formatChange && <span className="text-gray-400">{formatChange}</span>}
              {notesChanged && <span className="text-gray-400">notes changed</span>}
            </div>
          )}

          {/* Expanded card chips */}
          {expanded && (
            <div className="mt-2 flex flex-wrap gap-1">
              {diff.map((d) => {
                const isAdditional = d.delta > 0 && (d.previousQuantity ?? 0) > 0
                return (
                  <span
                    key={`${d.section}-${d.name}`}
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      d.delta > 0
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-700'
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

        {/* Right: Restore button */}
        <button
          type="button"
          onClick={onRevert}
          className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          Restore
        </button>
      </div>
    </div>
  )
}
