import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDecks } from '../hooks/useDecks'
import { useToastContext } from '../context/ToastContext'
import DeckCard from '../components/DeckCard'
import ImportModal from '../components/ImportModal'

/**
 * DeckList page — rendered at the / route.
 *
 * Displays:
 *   - A "New Deck" button that creates a deck and navigates to the editor
 *   - An "Import Deck" button that opens the MTGA import modal
 *   - A loading spinner while the initial fetch is in flight
 *   - A helpful empty-state message when no decks have been created yet
 *   - A responsive grid of DeckCard components once decks are loaded
 *   - A dismissible error banner when an API call fails
 */
function DeckList() {
  const navigate = useNavigate()
  const { decks, loading, error, createDeck, deleteDeck, refetch } = useDecks()
  const { addToast } = useToastContext()
  const [importModalOpen, setImportModalOpen] = useState(false)

  // Surface API errors as toasts in addition to the inline banner.
  useEffect(() => {
    if (error) addToast(error)
  }, [error]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Creates a new deck with a default name and immediately opens the editor.
   * createDeck handles optimistic state and returns the real deck (with a
   * server-assigned UUID) once the POST resolves.
   */
  async function handleNewDeck() {
    const deck = await createDeck({ name: 'New Deck' })
    if (deck) {
      navigate(`/deck/${deck.id}`)
    }
  }

  async function handleDelete(id: string) {
    await deleteDeck(id)
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      {/* ── Header ── */}
      <header className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">MTG Deck Manager</h1>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setImportModalOpen(true)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            data-testid="import-deck-button"
          >
            Import Deck
          </button>

          <button
            type="button"
            onClick={handleNewDeck}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            + New Deck
          </button>
        </div>
      </header>

      {/* ── Error banner ── */}
      {error && (
        <div
          role="alert"
          className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <span>{error}</span>
          {refetch && (
            <button
              type="button"
              onClick={refetch}
              className="shrink-0 rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* ── Loading state ── */}
      {loading && (
        <div
          className="flex items-center justify-center py-20"
          aria-label="Loading decks"
          data-testid="loading-spinner"
        >
          <svg
            className="h-8 w-8 animate-spin text-indigo-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="sr-only">Loading your decks…</span>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && decks.length === 0 && (
        <div
          className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-20 text-center"
          data-testid="empty-state"
        >
          <svg
            className="mb-4 h-12 w-12 text-gray-300"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>

          <p className="mb-1 text-lg font-semibold text-gray-700">
            No decks yet
          </p>
          <p className="mb-6 max-w-xs text-sm text-gray-500">
            Create your first deck and start building your collection. Click{' '}
            <span className="font-medium text-indigo-600">+ New Deck</span> to
            get started, or{' '}
            <button
              type="button"
              onClick={() => setImportModalOpen(true)}
              className="font-medium text-indigo-600 underline-offset-2 hover:underline focus:outline-none"
            >
              Import Deck
            </button>{' '}
            to paste an MTGA deck list.
          </p>

          <button
            type="button"
            onClick={handleNewDeck}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            + New Deck
          </button>
        </div>
      )}

      {/* ── Deck grid ── */}
      {!loading && decks.length > 0 && (
        <ul
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Deck list"
          data-testid="deck-grid"
        >
          {decks.map((deck) => (
            <li key={deck.id}>
              <DeckCard deck={deck} onDelete={handleDelete} />
            </li>
          ))}
        </ul>
      )}

      {/* ── Import Modal ── */}
      <ImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
      />
    </main>
  )
}

export default DeckList
