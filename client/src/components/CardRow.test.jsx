import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CardRow from './CardRow'

const CARD = { name: 'Lightning Bolt', manaCost: '{R}', typeLine: 'Instant' }
const CARD_NO_META = { name: 'Ancient Card' }

function renderRow(props = {}) {
  const defaults = {
    card: CARD,
    quantity: 4,
    onQuantityChange: vi.fn(),
    onRemove: vi.fn(),
  }
  return render(<CardRow {...defaults} {...props} />)
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Renders without crashing ──────────────────────────────────────────────────

describe('CardRow — renders without crashing', () => {
  it('renders without crashing', () => {
    renderRow()
  })

  it('renders with minimal card (no manaCost or typeLine)', () => {
    renderRow({ card: CARD_NO_META })
    expect(screen.getByTestId('card-name')).toHaveTextContent('Ancient Card')
  })

  it('renders with quantity 1', () => {
    renderRow({ quantity: 1 })
    expect(screen.getByTestId('quantity-input')).toBeInTheDocument()
  })

  it('renders with quantity 99', () => {
    renderRow({ quantity: 99 })
    expect(screen.getByTestId('quantity-input')).toBeInTheDocument()
  })
})

// ── Card display ──────────────────────────────────────────────────────────────

describe('CardRow — card display', () => {
  it('displays the card name', () => {
    renderRow()
    expect(screen.getByTestId('card-name')).toHaveTextContent('Lightning Bolt')
  })

  it('displays the mana cost when present', () => {
    renderRow()
    expect(screen.getByTestId('card-mana-cost')).toHaveTextContent('{R}')
  })

  it('displays the type line when present', () => {
    renderRow()
    expect(screen.getByTestId('card-type-line')).toHaveTextContent('Instant')
  })

  it('does not render mana cost element when manaCost is absent', () => {
    renderRow({ card: CARD_NO_META })
    expect(screen.queryByTestId('card-mana-cost')).not.toBeInTheDocument()
  })

  it('does not render type line element when typeLine is absent', () => {
    renderRow({ card: CARD_NO_META })
    expect(screen.queryByTestId('card-type-line')).not.toBeInTheDocument()
  })

  it('displays the current quantity in the number input', () => {
    renderRow({ quantity: 3 })
    expect(screen.getByTestId('quantity-input')).toHaveValue(3)
  })

  it('renders the remove button with aria-label containing card name', () => {
    renderRow()
    expect(
      screen.getByRole('button', { name: /Remove Lightning Bolt/i }),
    ).toBeInTheDocument()
  })
})

// ── Quantity controls ─────────────────────────────────────────────────────────

describe('CardRow — quantity controls', () => {
  it('calls onQuantityChange with quantity + 1 when + is clicked', () => {
    const onQuantityChange = vi.fn()
    renderRow({ quantity: 3, onQuantityChange })
    fireEvent.click(screen.getByTestId('increment-btn'))
    expect(onQuantityChange).toHaveBeenCalledWith(4)
  })

  it('does not exceed 99 when increment is clicked at max quantity', () => {
    const onQuantityChange = vi.fn()
    renderRow({ quantity: 99, onQuantityChange })
    fireEvent.click(screen.getByTestId('increment-btn'))
    expect(onQuantityChange).toHaveBeenCalledWith(99)
  })

  it('calls onQuantityChange with quantity - 1 when − is clicked', () => {
    const onQuantityChange = vi.fn()
    renderRow({ quantity: 3, onQuantityChange })
    fireEvent.click(screen.getByTestId('decrement-btn'))
    expect(onQuantityChange).toHaveBeenCalledWith(2)
  })

  it('calls onRemove (not onQuantityChange) when − is clicked at quantity 1', () => {
    const onRemove = vi.fn()
    const onQuantityChange = vi.fn()
    renderRow({ quantity: 1, onRemove, onQuantityChange })
    fireEvent.click(screen.getByTestId('decrement-btn'))
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onQuantityChange).not.toHaveBeenCalled()
  })

  it('calls onRemove when direct input sets quantity to 0', () => {
    const onRemove = vi.fn()
    renderRow({ quantity: 2, onRemove })
    fireEvent.change(screen.getByTestId('quantity-input'), { target: { value: '0' } })
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('calls onQuantityChange when direct input sets a valid positive quantity', () => {
    const onQuantityChange = vi.fn()
    renderRow({ quantity: 2, onQuantityChange })
    fireEvent.change(screen.getByTestId('quantity-input'), { target: { value: '5' } })
    expect(onQuantityChange).toHaveBeenCalledWith(5)
  })

  it('does not call onQuantityChange or onRemove for non-numeric input', () => {
    const onQuantityChange = vi.fn()
    const onRemove = vi.fn()
    renderRow({ quantity: 2, onQuantityChange, onRemove })
    fireEvent.change(screen.getByTestId('quantity-input'), { target: { value: 'abc' } })
    expect(onQuantityChange).not.toHaveBeenCalled()
    expect(onRemove).not.toHaveBeenCalled()
  })

  it('renders correctly for every quantity value from 1 to 99', () => {
    for (const qty of [1, 4, 20, 60, 99]) {
      const { unmount } = renderRow({ quantity: qty })
      expect(screen.getByTestId('quantity-input')).toHaveValue(qty)
      unmount()
    }
  })
})

// ── Remove button ─────────────────────────────────────────────────────────────

describe('CardRow — remove button', () => {
  it('calls onRemove when the remove button is clicked', () => {
    const onRemove = vi.fn()
    renderRow({ onRemove })
    fireEvent.click(screen.getByTestId('remove-btn'))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('calls onRemove for each individual click', () => {
    const onRemove = vi.fn()
    renderRow({ onRemove })
    fireEvent.click(screen.getByTestId('remove-btn'))
    fireEvent.click(screen.getByTestId('remove-btn'))
    expect(onRemove).toHaveBeenCalledTimes(2)
  })
})