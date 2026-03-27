import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDate } from '../utils/index.ts'

/**
 * Tailwind colour classes keyed by MTG format name.
 * Falls back to a neutral grey for unrecognised or absent formats.
 */
const FORMAT_STYLES = {
  Standard:  'bg-blue-100 text-blue-700',
  Pioneer:   'bg-purple-100 text-purple-700',
  Modern:    'bg-emerald-100 text-emerald-700',
  Legacy:    'bg-amber-100 text-amber-800',
  Vintage:   'bg-rose-100 text-rose-700',
  Commander: 'bg-orange-100 text-orange-700',
  Pauper:    'bg-gray-100 text-gray-600',
  Draft:     'bg-cyan-100 text-cyan-700',
  Historic:  'bg-indigo-100 text-indigo-700',
  Explorer:  'bg-teal-100 text-teal-700',
}

const DEFAULT_FORMAT_STYLE = 'bg-gray-100 text-gray-600'


/**
 * DeckCard — renders a single deck's metadata inside a card layout.
 *
 * Displays:
 *   - Deck name as a link to the deck editor (/deck/:id)
 *   - Format badge (colour-coded pill, omitted when format is empty)
 *   - Card count summary
 *   - Last-updated date
 *   - Delete button with an inline two-step confirmation (no browser dialog)
 *
 * @param {{
 *   deck: {
 *     id: string,
 *     name: string,
 *     format?: string,
 *     card_count?: number,
 *     updated_at?: string,
 *   },
 *   onDelete: (id: string) => void,
 * }} props
 */
function DeckCard({ deck, onDelete }) {
  const [confirming, setConfirming] = useState(false)

  const badgeStyle = FORMAT_STYLES[deck.format] ?? DEFAULT_FORMAT_STYLE
  const cardCount  = deck.card_count ?? 0
  const updatedAt  = formatDate(deck.updated_at)

  function handleDeleteClick() {
    setConfirming(true)
  }

  function handleConfirmDelete() {
    setConfirming(false)
    onDelete(deck.id)
  }

  function handleCancelDelete() {
    setConfirming(false)
  }

  return (
    <Link
      to={`/deck/${deck.id}`}
      className="block rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-400"
      aria-label={`Open deck ${deck.name}`}
    >
      <article className="flex flex-col justify-between p-5 h-full">

        {/* ── Top: name + format badge ── */}
        <div className="mb-4">
          <div className="mb-2 flex items-start justify-between gap-2">
            <span className="text-lg font-semibold leading-snug text-gray-900 group-hover:text-indigo-600">
              {deck.name}
            </span>

            {deck.format ? (
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeStyle}`}
                data-testid="format-badge"
              >
                {deck.format}
              </span>
            ) : null}
          </div>

          {/* ── Meta row: card count + last updated ── */}
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span data-testid="card-count">
              {cardCount} {cardCount === 1 ? 'card' : 'cards'}
            </span>
            <span data-testid="updated-at">Updated {updatedAt}</span>
          </div>
        </div>

        {/* ── Bottom: delete action ── */}
        {confirming ? (
          <div
            className="flex items-center gap-2 rounded-lg bg-red-50 p-3"
            role="alert"
            aria-live="polite"
            onClick={(e) => e.preventDefault()}
          >
            <p className="flex-1 text-sm font-medium text-red-800">
              Delete this deck?
            </p>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); handleConfirmDelete() }}
              className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-500"
              aria-label={`Confirm deletion of ${deck.name}`}
            >
              Delete
            </button>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); handleCancelDelete() }}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); handleDeleteClick() }}
            className="self-start rounded-md border border-gray-200 px-3 py-1 text-sm text-gray-500 hover:border-red-300 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-300"
            aria-label={`Delete ${deck.name}`}
          >
            Delete
          </button>
        )}
      </article>
    </Link>
  )
}

export default DeckCard