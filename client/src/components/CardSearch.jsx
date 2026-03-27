import { useState, useEffect, useRef, useCallback } from 'react'
import { useCards } from '../hooks/useCards.js'
import CloseButton from './CloseButton.jsx'
import Spinner from './Spinner.jsx'
import CardResultItem from './CardResultItem.jsx'

/**
 * CardSearch — slide-in panel for searching and adding cards to a deck.
 *
 * Search is debounced at 300 ms. Clicking a result opens an inline
 * mainboard/sideboard picker before the card is added.
 *
 * Accessibility: role="dialog", aria-modal, Escape to close, backdrop click.
 *
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   onAddCard: (card: object, section: 'mainboard' | 'sideboard') => void,
 * }} props
 */
function CardSearch({ isOpen, onClose, onAddCard }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [selectedCard, setSelectedCard] = useState(null)
  /** True once at least one debounced search has resolved, to enable "no results" state. */
  const [hasSearched, setHasSearched] = useState(false)

  const { searchCards, searching, error } = useCards()
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  // ── Reset state and focus input on open/close ─────────────────────────────
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    } else {
      setQuery('')
      setResults([])
      setSelectedCard(null)
      setHasSearched(false)
      clearTimeout(debounceRef.current)
    }
  }, [isOpen])

  // ── Escape key closes panel ───────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // ── Cleanup debounce timer on unmount ─────────────────────────────────────
  useEffect(() => () => clearTimeout(debounceRef.current), [])

  // ── Debounced search ──────────────────────────────────────────────────────
  const handleQueryChange = useCallback(
    (e) => {
      const value = e.target.value
      setQuery(value)
      setSelectedCard(null)
      clearTimeout(debounceRef.current)

      if (!value.trim()) {
        setResults([])
        setHasSearched(false)
        return
      }

      debounceRef.current = setTimeout(async () => {
        try {
          const cards = await searchCards(value)
          setResults(cards)
        } catch {
          setResults([])
        } finally {
          setHasSearched(true)
        }
      }, 300)
    },
    [searchCards],
  )

  function handleCardClick(card) {
    setSelectedCard((prev) => (prev?.id === card.id ? null : card))
  }

  function handleSectionSelect(section) {
    if (!selectedCard) return
    onAddCard(selectedCard, section)
    setSelectedCard(null)
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
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
          <CloseButton
            onClick={onClose}
            aria-label="Close search panel"
            className="hover:bg-gray-100 hover:text-gray-700 focus:ring-indigo-500"
          />
        </header>

        {/* Search input */}
        <div className="shrink-0 px-4 py-3">
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
            <div className="py-10 text-center text-sm text-red-600" data-testid="search-error">
              Something went wrong. Please try again.
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
                  isSelected={selectedCard?.id === card.id}
                  onSelect={handleCardClick}
                  onSectionSelect={handleSectionSelect}
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