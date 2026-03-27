/**
 * Returns the small thumbnail URI for a card, handling double-faced cards.
 *
 * @param {object} card - Scryfall card object
 * @returns {string | null}
 */
function getCardImage(card) {
  if (card?.image_uris?.small) return card.image_uris.small
  if (card?.card_faces?.[0]?.image_uris?.small) return card.card_faces[0].image_uris.small
  return null
}

/**
 * A single search result row: card thumbnail, name/mana/type, and an inline
 * mainboard/sideboard picker that appears when the row is selected.
 *
 * @param {{
 *   card: object,
 *   isSelected: boolean,
 *   onSelect: (card: object) => void,
 *   onSectionSelect: (section: 'mainboard' | 'sideboard') => void,
 * }} props
 */
function CardResultItem({ card, isSelected, onSelect, onSectionSelect }) {
  const imgSrc = getCardImage(card)

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(card)}
        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
          isSelected
            ? 'border-indigo-300 bg-indigo-50'
            : 'border-gray-100 bg-gray-50 hover:border-indigo-200 hover:bg-indigo-50'
        }`}
        aria-label={`Add ${card.name} to deck`}
        aria-expanded={isSelected}
      >
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={card.name}
            className="h-14 w-10 shrink-0 rounded object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-gray-200"
            aria-hidden="true"
          >
            <span className="text-xs text-gray-400">?</span>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">{card.name}</p>
          {card.mana_cost && (
            <p className="text-xs text-gray-500" data-testid={`mana-cost-${card.id}`}>
              {card.mana_cost}
            </p>
          )}
          {card.type_line && (
            <p className="truncate text-xs text-gray-400">{card.type_line}</p>
          )}
        </div>
      </button>

      {isSelected && (
        <div
          className="mt-1 flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3"
          data-testid="section-picker"
        >
          <p className="mr-auto text-xs font-medium text-indigo-800">Add to:</p>
          <button
            type="button"
            onClick={() => onSectionSelect('mainboard')}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Mainboard
          </button>
          <button
            type="button"
            onClick={() => onSectionSelect('sideboard')}
            className="rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            Sideboard
          </button>
        </div>
      )}
    </li>
  )
}

export default CardResultItem