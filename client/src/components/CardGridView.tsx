import { useState, useEffect } from 'react'
import type { CardEntry, ScryfallCard } from '../types'
import CardImagePlaceholder from './CardImagePlaceholder'

interface CardGridViewProps {
  cards: CardEntry[]
  onQuantityChange: (name: string, qty: number) => void
  onRemove: (name: string) => void
  onCardClick: (card: CardEntry) => void
}

// ── Per-card item ─────────────────────────────────────────────────────────────

interface GridCardItemProps {
  card: CardEntry
  onQuantityChange: (name: string, qty: number) => void
  onRemove: (name: string) => void
  onCardClick: (card: CardEntry) => void
}

function GridCardItem({ card, onQuantityChange, onRemove, onCardClick }: GridCardItemProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(
    card.image_uris?.normal ?? card.image_uris?.small ?? null,
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
        const src = fetched?.image_uris?.normal ?? fetched?.image_uris?.small ?? null
        if (src) setImgSrc(src)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
    // Run once on mount — card identity doesn't change within a mounted instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <li key={card.scryfall_id ?? card.name} className="flex flex-col">
      {/* Image — clickable to open detail */}
      <button
        type="button"
        onClick={() => onCardClick(card)}
        className="group relative w-full overflow-hidden rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
        aria-label={`View details for ${card.name}`}
        data-testid={`grid-card-${card.name}`}
      >
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={card.name}
            loading="lazy"
            className="w-full rounded-lg object-cover transition-transform duration-150 group-hover:scale-105"
          />
        ) : (
          <CardImagePlaceholder className="aspect-[5/7] w-full" />
        )}
        {/* Subtle hover overlay */}
        <div className="absolute inset-0 rounded-lg bg-black/0 transition-colors duration-150 group-hover:bg-black/10" />
      </button>

      {/* Card name */}
      <p
        className="mt-1 truncate px-0.5 text-xs font-medium text-slate-700"
        title={card.name}
      >
        {card.name}
      </p>

      {/* Quantity controls */}
      <div className="mt-1 flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => {
            if (card.quantity <= 1) onRemove(card.name)
            else onQuantityChange(card.name, card.quantity - 1)
          }}
          className="flex h-6 w-6 items-center justify-center rounded bg-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          aria-label={`Decrease quantity of ${card.name}`}
          data-testid={`grid-decrement-${card.name}`}
        >
          −
        </button>

        <span
          className="min-w-[1.5rem] text-center text-sm font-semibold text-slate-800"
          data-testid={`grid-qty-${card.name}`}
        >
          {card.quantity}
        </span>

        <button
          type="button"
          onClick={() => onQuantityChange(card.name, card.quantity + 1)}
          className="flex h-6 w-6 items-center justify-center rounded bg-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          aria-label={`Increase quantity of ${card.name}`}
          data-testid={`grid-increment-${card.name}`}
        >
          +
        </button>
      </div>
    </li>
  )
}

// ── Grid container ────────────────────────────────────────────────────────────

/**
 * CardGridView — displays deck cards as a responsive image grid.
 *
 * Layout: 4 columns on md+, 3 on sm, 2 on xs.
 * Each cell lazily fetches its card image if image_uris are not stored
 * (e.g. cards added via text import that have no scryfall data yet).
 * Clicking the image/name opens the card detail modal via onCardClick.
 */
export default function CardGridView({ cards, onQuantityChange, onRemove, onCardClick }: CardGridViewProps) {
  return (
    <ul
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
      data-testid="card-grid-view"
    >
      {cards.map((card) => (
        <GridCardItem
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
