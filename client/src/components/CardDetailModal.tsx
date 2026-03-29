import { useState, useEffect, useCallback } from 'react'
import type { ScryfallCard } from '../types'
import CardImagePlaceholder from './CardImagePlaceholder'
import Spinner from './Spinner'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getNormalImage(card: ScryfallCard): string | null {
  if (card.image_uris?.normal) return card.image_uris.normal
  if (card.card_faces?.[0]?.image_uris?.normal) return card.card_faces[0].image_uris!.normal
  return null
}

function getOracleText(card: ScryfallCard): string | null {
  if (card.oracle_text) return card.oracle_text
  if (card.card_faces) {
    return card.card_faces.map((f) => f.oracle_text).filter(Boolean).join('\n//\n') || null
  }
  return null
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface DeckControls {
  quantity: number
  onQuantityChange: (qty: number) => void
  onRemove: () => void
}

interface SearchControls {
  sectionNames: string[]
  /** Called with just the section string — the modal already has the card. */
  onAddToSection: (section: string) => void
}

interface CardDetailModalProps {
  /** Full card data if already available (e.g. from search results). */
  card?: ScryfallCard
  /** Scryfall ID to fetch if full card data is not provided. */
  scryfallId?: string
  /** Display name shown in the loading state (if only scryfallId given). */
  name?: string
  onClose: () => void
  /** Provide for deck-view mode: shows quantity controls. */
  deckControls?: DeckControls
  /** Provide for search/add mode: shows section picker. */
  searchControls?: SearchControls
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * CardDetailModal — full-screen lightbox for a single card.
 *
 * If `card` is provided it renders immediately. If only `scryfallId` is given
 * the modal fetches `/api/cards/:id` on mount and shows a spinner meanwhile.
 *
 * Bottom controls switch between:
 *  - Deck mode (`deckControls`): quantity [−] n [+] and a Remove button
 *  - Search mode (`searchControls`): section picker buttons
 */
export default function CardDetailModal({
  card: initialCard,
  scryfallId,
  name,
  onClose,
  deckControls,
  searchControls,
}: CardDetailModalProps) {
  const [card, setCard] = useState<ScryfallCard | null>(initialCard ?? null)
  const [loadError, setLoadError] = useState(false)
  const [imgError, setImgError] = useState(false)

  // Fetch full card data when only scryfallId or name is provided.
  // Falls back to name search if scryfallId is not available (e.g. imported cards).
  useEffect(() => {
    if (initialCard) return
    if (!scryfallId && !name) return

    let cancelled = false

    const url = scryfallId
      ? `/api/cards/${scryfallId}`
      : `/api/cards/search?q=${encodeURIComponent(name!)}`

    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: ScryfallCard | ScryfallCard[]) => {
        if (cancelled) return
        const fetched = Array.isArray(data) ? data[0] : data
        if (fetched) setCard(fetched)
        else setLoadError(true)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })

    return () => { cancelled = true }
  }, [initialCard, scryfallId, name])

  // Escape key closes modal.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const imgSrc = card ? getNormalImage(card) : null
  const oracleText = card ? getOracleText(card) : null
  const displayName = card?.name ?? name ?? '…'

  const handleQtyDecrement = useCallback(() => {
    if (!deckControls) return
    if (deckControls.quantity <= 1) deckControls.onRemove()
    else deckControls.onQuantityChange(deckControls.quantity - 1)
  }, [deckControls])

  const handleQtyIncrement = useCallback(() => {
    if (!deckControls) return
    deckControls.onQuantityChange(deckControls.quantity + 1)
  }, [deckControls])

  const handleQtyInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!deckControls) return
      const val = parseInt(e.target.value, 10)
      if (Number.isNaN(val) || val < 1) return
      deckControls.onQuantityChange(val)
    },
    [deckControls],
  )

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-label={`Card detail: ${displayName}`}
      data-testid="card-detail-modal"
    >
      {/* Panel — stop click propagation so backdrop click doesn't bubble */}
      <div
        className="relative flex w-full max-w-sm flex-col rounded-2xl bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-slate-800/80 p-1.5 text-slate-300 hover:bg-slate-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          aria-label="Close"
          data-testid="card-detail-close"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Card image */}
        <div className="flex items-center justify-center rounded-t-2xl bg-slate-800 p-4">
          {!card && !loadError && (
            <div className="flex h-80 w-56 items-center justify-center">
              <Spinner className="h-8 w-8" />
            </div>
          )}
          {(loadError || (card && !imgSrc && !imgError)) && (
            <CardImagePlaceholder className="h-80 w-56" />
          )}
          {card && imgSrc && !imgError && (
            <img
              src={imgSrc}
              alt={displayName}
              loading="lazy"
              onError={() => setImgError(true)}
              className="h-auto max-h-80 w-auto max-w-full rounded-lg"
              data-testid="card-detail-image"
            />
          )}
          {card && imgSrc && imgError && (
            <CardImagePlaceholder className="h-80 w-56" />
          )}
        </div>

        {/* Card info */}
        <div className="px-5 py-4">
          <h2 className="text-lg font-bold text-slate-100" data-testid="card-detail-name">
            {displayName}
          </h2>

          {card && (
            <>
              {card.mana_cost && (
                <p className="mt-0.5 text-sm text-slate-400">{card.mana_cost}</p>
              )}
              {card.type_line && (
                <p className="mt-0.5 text-xs text-slate-500">{card.type_line}</p>
              )}
              {oracleText && (
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
                  {oracleText}
                </p>
              )}
            </>
          )}
        </div>

        {/* Controls */}
        <div className="border-t border-slate-700 px-5 py-4">
          {/* Deck mode: quantity selector */}
          {deckControls && (
            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-lg border border-slate-600 bg-slate-800">
                <button
                  type="button"
                  onClick={handleQtyDecrement}
                  className="px-3 py-2 text-slate-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  aria-label="Decrease quantity"
                  data-testid="qty-decrement"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={deckControls.quantity}
                  onChange={handleQtyInput}
                  className="w-10 bg-transparent text-center text-sm font-semibold text-slate-100 focus:outline-none"
                  aria-label="Quantity"
                  data-testid="qty-input"
                />
                <button
                  type="button"
                  onClick={handleQtyIncrement}
                  className="px-3 py-2 text-slate-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  aria-label="Increase quantity"
                  data-testid="qty-increment"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={deckControls.onRemove}
                className="ml-auto text-xs text-red-400 hover:text-red-300 focus:outline-none focus:underline"
                data-testid="card-detail-remove"
              >
                Remove
              </button>
            </div>
          )}

          {/* Search mode: section picker */}
          {searchControls && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-slate-400">Add to section:</p>
              <div className="flex flex-wrap gap-2">
                {searchControls.sectionNames.map((section) => (
                  <button
                    key={section}
                    type="button"
                    onClick={() => searchControls.onAddToSection(section)}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 capitalize"
                    data-testid={`add-to-${section}`}
                  >
                    {section}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
