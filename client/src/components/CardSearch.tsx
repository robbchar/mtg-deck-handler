import { useState, useEffect, useRef, useCallback } from 'react'
import CloseButton from './CloseButton'
import Spinner from './Spinner'
import CardResultItem from './CardResultItem'
import type { ScryfallCard } from '../types'

interface CardSearchProps {
  /** Names of sections the user can add a card to (e.g. ['mainboard', 'sideboard']). */
  sectionNames: string[]
  /** Called when the user picks a section for a card. */
  onAddToSection: (card: ScryfallCard, section: string) => void
  /** Whether the slide-in panel is open. Defaults to true. */
  isOpen?: boolean
  /** Called when the panel should close (backdrop click, Escape, × button). */
  onClose?: () => void
}

/**
 * CardSearch — slide-in panel for searching and adding cards to a deck.
 *
 * Owns its own search state (searching, error, results) via fetch.
 * Search fires on form submit and on a 300 ms debounce while typing.
 * Clicking a result opens an inline section picker in CardResultItem.
 *
 * Accessibility: role="dialog", aria-modal, Escape to close, backdrop click.
 */
function CardSearch({ sectionNames, onAddToSection, isOpen = true, onClose }: CardSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ScryfallCard[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** True once at least one search has resolved, to enable "no results" state. */
  const [hasSearched, setHasSearched] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Reset state and focus input on open/close ─────────────────────────────
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    } else {
      setQuery('')
      setResults([])
      setError(null)
      setHasSearched(false)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [isOpen])

  // ── Escape key closes panel ───────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !onClose) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose!()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // ── Cleanup debounce timer on unmount ─────────────────────────────────────
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  // ── Run a search ─────────────────────────────────────────────────────────

  const runSearch = useCallback(async (value: string) => {
    if (!value.trim()) {
      setResults([])
      setError(null)
      setHasSearched(false)
      return
    }
    setSearching(true)
    setError(null)
    try {
      const response = await fetch(`/api/cards/search?q=${encodeURIComponent(value.trim())}`)
      if (!response.ok) throw new Error('Search failed')
      const data = await response.json() as ScryfallCard[]
      setResults(Array.isArray(data) ? data : [])
    } catch {
      setError('Search failed')
      setResults([])
    } finally {
      setSearching(false)
      setHasSearched(true)
    }
  }, [])

  // ── Debounced search on input change ──────────────────────────────────────
  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setQuery(value)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => runSearch(value), 300)
    },
    [runSearch],
  )

  // ── Immediate search on form submit ───────────────────────────────────────
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (debounceRef.current) clearTimeout(debounceRef.current)
      runSearch(query)
    },
    [query, runSearch],
  )

  // ── Retry after error ─────────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    runSearch(query)
  }, [query, runSearch])

  return (
    <>
      {/* Backdrop */}
      {isOpen && onClose && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={onClose}
          aria-hidden="true"
          data-testid="search-backdrop"
        />
      )}

      {/* Panel — always mounted; slides in/out via CSS transform */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-label="Card search"
        aria-modal="true"
        aria-hidden={!isOpen}
        data-testid="card-search-panel"
      >
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Search Cards</h2>
          {onClose && (
            <CloseButton
              onClick={onClose}
              aria-label="Close search panel"
              className="hover:bg-gray-100 hover:text-gray-700 focus:ring-indigo-500"
            />
          )}
        </header>

        {/* Search input */}
        <div className="shrink-0 px-4 py-3">
          <form onSubmit={handleSubmit} role="search">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center">
                <svg className="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={handleQueryChange}
                placeholder="Search for a card…"
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                aria-label="Search cards"
                data-testid="search-input"
              />
            </div>
          </form>
        </div>

        {/* Results area */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {searching && (
            <div className="flex items-center justify-center py-10" data-testid="search-loading">
              <Spinner />
              <span className="sr-only">Searching…</span>
            </div>
          )}

          {!searching && error && (
            <div className="flex flex-col items-center py-10 text-center" role="alert" data-testid="search-error">
              <p className="text-sm text-red-600">Something went wrong. Please try again.</p>
              <button
                type="button"
                onClick={handleRetry}
                className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400"
              >
                Retry
              </button>
            </div>
          )}

          {!searching && !error && hasSearched && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center" data-testid="no-results">
              <p className="text-sm font-medium text-gray-600">No cards found</p>
              <p className="mt-1 text-sm text-gray-400">Try a different search term.</p>
            </div>
          )}

          {!searching && !error && results.length > 0 && (
            <ul className="space-y-2" data-testid="search-results">
              {results.map((card) => (
                <CardResultItem
                  key={card.id}
                  card={card}
                  sectionNames={sectionNames}
                  onAddToSection={onAddToSection}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  )
}

export default CardSearch
