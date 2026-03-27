/**
 * CardRow — a single card entry row used inside DeckEditor.
 *
 * Displays quantity controls, card name, mana cost, type line, and a remove
 * button. Setting quantity to 0 (via − button or direct input) calls onRemove
 * rather than passing 0 to onQuantityChange. Quantity is capped at 99.
 *
 * @param {{
 *   card: { name: string, manaCost?: string, typeLine?: string },
 *   quantity: number,
 *   onQuantityChange: (newQty: number) => void,
 *   onRemove: () => void,
 * }} props
 */
function CardRow({ card, quantity, onQuantityChange, onRemove }) {
  function handleDecrement() {
    if (quantity <= 1) {
      onRemove()
    } else {
      onQuantityChange(quantity - 1)
    }
  }

  function handleIncrement() {
    onQuantityChange(Math.min(99, quantity + 1))
  }

  function handleInputChange(e) {
    const raw = e.target.value
    // Reject non-numeric or empty input silently
    if (raw === '' || !/^\d+$/.test(raw)) return
    const val = parseInt(raw, 10)
    if (isNaN(val)) return
    if (val === 0) {
      onRemove()
    } else {
      onQuantityChange(Math.min(99, val))
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2 hover:border-gray-200">
      {/* Quantity controls */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={handleDecrement}
          className="flex h-6 w-6 items-center justify-center rounded bg-gray-100 text-gray-600 hover:bg-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          aria-label={`Decrease quantity of ${card.name}`}
          data-testid="decrement-btn"
        >
          −
        </button>
        <input
          type="number"
          value={quantity}
          onChange={handleInputChange}
          min={1}
          max={99}
          className="w-12 rounded border border-gray-200 px-1 py-0.5 text-center text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
          aria-label={`Quantity of ${card.name}`}
          data-testid="quantity-input"
        />
        <button
          type="button"
          onClick={handleIncrement}
          className="flex h-6 w-6 items-center justify-center rounded bg-gray-100 text-gray-600 hover:bg-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          aria-label={`Increase quantity of ${card.name}`}
          data-testid="increment-btn"
        >
          +
        </button>
      </div>

      {/* Card info */}
      <div className="min-w-0 flex-1">
        <span
          className="truncate text-sm font-medium text-gray-900"
          data-testid="card-name"
        >
          {card.name}
        </span>
        {card.manaCost !== undefined && card.manaCost !== null && (
          <span
            className="ml-2 text-xs text-gray-500"
            data-testid="card-mana-cost"
          >
            {card.manaCost}
          </span>
        )}
        {card.typeLine !== undefined && card.typeLine !== null && (
          <span
            className="ml-2 text-xs text-gray-400"
            data-testid="card-type-line"
          >
            {card.typeLine}
          </span>
        )}
      </div>

      {/* Remove button */}
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-1 focus:ring-red-400"
        aria-label={`Remove ${card.name}`}
        data-testid="remove-btn"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  )
}

export default CardRow