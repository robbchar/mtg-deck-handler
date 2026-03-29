import { useState } from 'react'
import type { ScryfallCard } from '../types'
import CardImagePlaceholder from './CardImagePlaceholder'

interface CardResultItemProps {
  card: ScryfallCard
  sectionNames: string[]
  onAddToSection: (card: ScryfallCard, sectionId: string) => void
  onImageClick?: (card: ScryfallCard) => void
}

function getSmallImage(card: ScryfallCard): string | null {
  if (card?.image_uris?.small) return card.image_uris.small
  if (card?.card_faces?.[0]?.image_uris?.small) return card.card_faces[0].image_uris!.small
  return null
}

function getNormalImage(card: ScryfallCard): string | null {
  if (card?.image_uris?.normal) return card.image_uris.normal
  if (card?.card_faces?.[0]?.image_uris?.normal) return card.card_faces[0].image_uris!.normal
  return null
}

export default function CardResultItem({ card, sectionNames, onAddToSection, onImageClick }: CardResultItemProps) {
  const [thumbError, setThumbError] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const smallSrc = getSmallImage(card)
  const normalSrc = getNormalImage(card)
  const showThumb = Boolean(smallSrc) && !thumbError

  return (
    <li className="flex flex-col gap-2 rounded-md border border-slate-700 bg-slate-800 p-2">
      <div className="flex items-center gap-3">
        {/* Thumbnail — 2× larger; clicking opens detail modal */}
        <button
          type="button"
          onClick={() => onImageClick?.(card)}
          className="shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded"
          aria-label={`View details for ${card.name}`}
          tabIndex={onImageClick ? 0 : -1}
        >
          {showThumb ? (
            <img
              src={smallSrc!}
              alt={card.name}
              loading="lazy"
              onError={() => setThumbError(true)}
              className="h-28 w-20 rounded object-cover"
            />
          ) : (
            <CardImagePlaceholder className="h-28 w-20" />
          )}
        </button>

        {/* Card info */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-100">{card.name}</p>
          <p className="truncate text-xs text-slate-400">{card.type_line}</p>
          {card.mana_cost && (
            <p className="truncate text-xs text-slate-500">{card.mana_cost}</p>
          )}
        </div>

        {/* Add button */}
        <button
          type="button"
          onClick={() => setPickerOpen((prev) => !prev)}
          className="shrink-0 rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          aria-expanded={pickerOpen}
          aria-label={`Add ${card.name} to deck`}
        >
          {pickerOpen ? 'Cancel' : 'Add'}
        </button>
      </div>

      {/* Section picker */}
      {pickerOpen && (
        <div
          data-testid="section-picker"
          className="flex gap-3 rounded-md bg-slate-900 p-2"
        >
          {/* Normal-size preview */}
          {normalSrc ? (
            <img
              src={normalSrc}
              alt={card.name}
              loading="lazy"
              className="h-24 w-[68px] shrink-0 rounded object-cover"
            />
          ) : (
            <CardImagePlaceholder className="h-24 w-[68px] shrink-0" />
          )}

          {/* Section buttons */}
          <div className="flex flex-col gap-1">
            <p className="mb-1 text-xs font-semibold text-slate-300">Add to section:</p>
            {sectionNames.length === 0 ? (
              <p className="text-xs text-slate-500">No sections available.</p>
            ) : (
              sectionNames.map((name, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    onAddToSection(card, name)
                    setPickerOpen(false)
                  }}
                  className="rounded bg-slate-700 px-2 py-1 text-left text-xs text-slate-200 hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  {name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </li>
  )
}