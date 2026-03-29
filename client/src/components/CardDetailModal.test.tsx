import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import CardDetailModal from './CardDetailModal'
import type { ScryfallCard } from '../types'

const CARD: ScryfallCard = {
  id: 'abc-123',
  name: 'Lightning Bolt',
  mana_cost: '{R}',
  type_line: 'Instant',
  oracle_text: 'Deal 3 damage to any target.',
  image_uris: {
    small: 'https://example.com/small.jpg',
    normal: 'https://example.com/normal.jpg',
  },
}

describe('CardDetailModal — with full card data', () => {
  it('renders the modal backdrop', () => {
    render(<CardDetailModal card={CARD} onClose={vi.fn()} />)
    expect(screen.getByTestId('card-detail-modal')).toBeInTheDocument()
  })

  it('shows the card name', () => {
    render(<CardDetailModal card={CARD} onClose={vi.fn()} />)
    expect(screen.getByTestId('card-detail-name')).toHaveTextContent('Lightning Bolt')
  })

  it('shows the card image', () => {
    render(<CardDetailModal card={CARD} onClose={vi.fn()} />)
    const img = screen.getByTestId('card-detail-image')
    expect(img).toHaveAttribute('src', 'https://example.com/normal.jpg')
  })

  it('shows mana cost and type line', () => {
    render(<CardDetailModal card={CARD} onClose={vi.fn()} />)
    expect(screen.getByText('{R}')).toBeInTheDocument()
    expect(screen.getByText('Instant')).toBeInTheDocument()
  })

  it('shows oracle text', () => {
    render(<CardDetailModal card={CARD} onClose={vi.fn()} />)
    expect(screen.getByText('Deal 3 damage to any target.')).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<CardDetailModal card={CARD} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('card-detail-close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<CardDetailModal card={CARD} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('card-detail-modal'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<CardDetailModal card={CARD} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('CardDetailModal — deck mode (deckControls)', () => {
  it('renders quantity controls', () => {
    render(
      <CardDetailModal
        card={CARD}
        onClose={vi.fn()}
        deckControls={{ quantity: 2, onQuantityChange: vi.fn(), onRemove: vi.fn() }}
      />,
    )
    expect(screen.getByTestId('qty-input')).toHaveValue(2)
    expect(screen.getByTestId('qty-increment')).toBeInTheDocument()
    expect(screen.getByTestId('qty-decrement')).toBeInTheDocument()
    expect(screen.getByTestId('card-detail-remove')).toBeInTheDocument()
  })

  it('calls onQuantityChange with qty+1 when increment is clicked', () => {
    const onQuantityChange = vi.fn()
    render(
      <CardDetailModal
        card={CARD}
        onClose={vi.fn()}
        deckControls={{ quantity: 2, onQuantityChange, onRemove: vi.fn() }}
      />,
    )
    fireEvent.click(screen.getByTestId('qty-increment'))
    expect(onQuantityChange).toHaveBeenCalledWith(3)
  })

  it('calls onQuantityChange with qty-1 when decrement is clicked and qty > 1', () => {
    const onQuantityChange = vi.fn()
    render(
      <CardDetailModal
        card={CARD}
        onClose={vi.fn()}
        deckControls={{ quantity: 2, onQuantityChange, onRemove: vi.fn() }}
      />,
    )
    fireEvent.click(screen.getByTestId('qty-decrement'))
    expect(onQuantityChange).toHaveBeenCalledWith(1)
  })

  it('calls onRemove when decrement is clicked and qty is 1', () => {
    const onRemove = vi.fn()
    render(
      <CardDetailModal
        card={CARD}
        onClose={vi.fn()}
        deckControls={{ quantity: 1, onQuantityChange: vi.fn(), onRemove }}
      />,
    )
    fireEvent.click(screen.getByTestId('qty-decrement'))
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('calls onRemove when the Remove button is clicked', () => {
    const onRemove = vi.fn()
    render(
      <CardDetailModal
        card={CARD}
        onClose={vi.fn()}
        deckControls={{ quantity: 2, onQuantityChange: vi.fn(), onRemove }}
      />,
    )
    fireEvent.click(screen.getByTestId('card-detail-remove'))
    expect(onRemove).toHaveBeenCalledOnce()
  })
})

describe('CardDetailModal — search mode (searchControls)', () => {
  it('renders section picker buttons', () => {
    render(
      <CardDetailModal
        card={CARD}
        onClose={vi.fn()}
        searchControls={{
          sectionNames: ['mainboard', 'sideboard'],
          onAddToSection: vi.fn(),
        }}
      />,
    )
    expect(screen.getByTestId('add-to-mainboard')).toBeInTheDocument()
    expect(screen.getByTestId('add-to-sideboard')).toBeInTheDocument()
  })

  it('calls onAddToSection with the chosen section when a button is clicked', () => {
    const onAddToSection = vi.fn()
    render(
      <CardDetailModal
        card={CARD}
        onClose={vi.fn()}
        searchControls={{
          sectionNames: ['mainboard', 'sideboard'],
          onAddToSection,
        }}
      />,
    )
    fireEvent.click(screen.getByTestId('add-to-mainboard'))
    expect(onAddToSection).toHaveBeenCalledWith('mainboard')
  })
})

describe('CardDetailModal — fetching by scryfallId', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows a spinner while loading', () => {
    mockFetch.mockReturnValue(new Promise(() => {})) // never resolves
    render(<CardDetailModal scryfallId="abc-123" name="Lightning Bolt" onClose={vi.fn()} />)
    // Spinner present, no card name in heading yet (shows placeholder text)
    expect(screen.getByTestId('card-detail-name')).toHaveTextContent('Lightning Bolt')
    // Card image should not be present yet
    expect(screen.queryByTestId('card-detail-image')).not.toBeInTheDocument()
  })

  it('renders card data after fetch resolves', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => CARD,
    })

    render(<CardDetailModal scryfallId="abc-123" onClose={vi.fn()} />)

    await waitFor(() => expect(screen.getByTestId('card-detail-image')).toBeInTheDocument())
    expect(screen.getByTestId('card-detail-name')).toHaveTextContent('Lightning Bolt')
  })

  it('shows placeholder when fetch by scryfallId fails', async () => {
    mockFetch.mockResolvedValue({ ok: false })

    render(<CardDetailModal scryfallId="abc-123" name="Lightning Bolt" onClose={vi.fn()} />)

    await waitFor(() =>
      // After error, card image is replaced by placeholder (no img element)
      expect(screen.queryByTestId('card-detail-image')).not.toBeInTheDocument(),
    )
  })

  it('searches by name when no scryfallId is provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [CARD], // search returns an array
    })

    render(<CardDetailModal name="Lightning Bolt" onClose={vi.fn()} />)

    await waitFor(() => expect(screen.getByTestId('card-detail-image')).toBeInTheDocument())
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/cards/search?q='),
    )
  })

  it('shows placeholder when name search returns empty results', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [], // no results
    })

    render(<CardDetailModal name="Nonexistent Card" onClose={vi.fn()} />)

    await waitFor(() =>
      expect(screen.queryByTestId('card-detail-image')).not.toBeInTheDocument(),
    )
  })
})
