import { useState, useEffect } from 'react'
import type { CardEntry, ScryfallCard } from '../types'
import CardImagePlaceholder from './CardImagePlaceholder'

interface CardCompactViewProps {
  cards: CardEntry[]
  onQuantityChange: (name: string, qty: number) => void
  onRemove: (name: string) => void
  onCardClick: (card: CardEntry) => void
}

// ── Per-card item ─────────────────────────────────────────────────────────────

interface CompactCardItemProps {
  card: CardEntry
  onQuantityChange: (name: string, qty: number) => void
  onRemove: (name: string) => void
  onCardClick: (card: CardEntry) => void
}

function CompactCardItem({ card, onQuantityChange, onRemove, onCardClick }: CompactCardItemProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(
    card.image_uris?.small ?? null,
  )

  // Lazily fetch card image if not stored in the CardEntry (e.g. imported decks).
  useEffect(() => {
    if (imgSrc) return
    let cancelled = false

    const url = card.scryfall_id
      ? `/api/cards/${card.scryfall_id}`
      : `/api/cards/search?q=${encodeURIComponent(card.name)}`

    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: ScryfallCard | ScryfallCard[]) => {
        if (cancelled) return
        const fetched = Array.isArray(data) ? data[0] : data
        const src = fetched?.image_uris?.small ?? null
        if (src) setImgSrc(src)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [card.scryfall_id, card.name, imgSrc])

  return (
    <li className="group flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
      {/* Thumbnail — clicking opens detail */}
      <button
        type="button"
        onClick={() => onCardClick(card)}
        className="shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded"
        aria-label={`View details for ${card.name}`}
        data-testid={`compact-card-${card.name}`}
      >
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={card.name}
            loading="lazy"
            className="h-10 w-7 rounded object-cover"
          />
        ) : (
          <CardImagePlaceholder className="h-10 w-7" />
        )}
      </button>

      {/* Card info — clicking opens detail */}
      <button
        type="button"
        onClick={() => onCardClick(card)}
        className="min-w-0 flex-1 text-left focus:outline-none focus:underline"
        tabIndex={-1}
      >
        <p className="truncate text-sm font-medium text-slate-800">{card.name}</p>
        {card.mana_cost && (
          <p className="truncate text-xs text-slate-400">{card.mana_cost}</p>
        )}
      </button>

      {/* Quantity controls */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => {
            if (card.quantity <= 1) onRemove(card.name)
            else onQuantityChange(card.name, card.quantity - 1)
          }}
          className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 text-sm font-bold text-slate-600 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          aria-label={`Decrease quantity of ${card.name}`}
          data-testid={`compact-decrement-${card.name}`}
        >
          −
        </button>

        <span
          className="min-w-[1.25rem] text-center text-sm font-semibold text-slate-700"
          data-testid={`compact-qty-${card.name}`}
        >
          {card.quantity}
        </span>

        <button
          type="button"
          onClick={() => onQuantityChange(card.name, card.quantity + 1)}
          className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 text-sm font-bold text-slate-600 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          aria-label={`Increase quantity of ${card.name}`}
          data-testid={`compact-increment-${card.name}`}
        >
          +
        </button>
      </div>
    </li>
  )
}

// ── List container ────────────────────────────────────────────────────────────

/**
 * CardCompactView — stacked compact rows, each showing a small thumbnail,
 * card name, mana cost, and quantity controls.
 *
 * Rows elevate on hover (scale + shadow). Each item lazily fetches its card
 * image if image_uris are not stored (e.g. imported decks).
 * Clicking the card area (not the quantity buttons) opens the detail modal
 * via onCardClick.
 */
export default function CardCompactView({ cards, onQuantityChange, onRemove, onCardClick }: CardCompactViewProps) {
  return (
    <ul className="flex flex-col gap-1" data-testid="card-compact-view">
      {cards.map((card) => (
        <CompactCardItem
          key={card.scryfall_id ?? card.name}
          card={card}
          onQuantityChange={onQuantityChange}
          onRemove={onRemove}
          onCardClick={onCardClick}
        />
      ))}
    </ul>
  )
}
