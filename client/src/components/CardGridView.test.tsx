import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import CardGridView from './CardGridView'
import type { CardEntry } from '../types'

const makeCard = (overrides: Partial<CardEntry> = {}): CardEntry => ({
  name: 'Lightning Bolt',
  quantity: 2,
  scryfall_id: 'abc-123',
  section: 'mainboard',
  mana_cost: '{R}',
  image_uris: { small: 'https://example.com/small.jpg', normal: 'https://example.com/normal.jpg' },
  ...overrides,
})

describe('CardGridView', () => {
  it('renders the grid container', () => {
    render(
      <CardGridView
        cards={[makeCard()]}
        onQuantityChange={vi.fn()}
        onRemove={vi.fn()}
        onCardClick={vi.fn()}
      />,
    )
    expect(screen.getByTestId('card-grid-view')).toBeInTheDocument()
  })

  it('renders a card image when image_uris.normal is available', () => {
    render(
      <CardGridView
        cards={[makeCard()]}
        onQuantityChange={vi.fn()}
        onRemove={vi.fn()}
        onCardClick={vi.fn()}
      />,
    )
    const img = screen.getByAltText('Lightning Bolt')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'https://example.com/normal.jpg')
  })

  it('renders a placeholder when no image_uris', () => {
    render(
      <CardGridView
        cards={[makeCard({ image_uris: undefined })]}
        onQuantityChange={vi.fn()}
        onRemove={vi.fn()}
        onCardClick={vi.fn()}
      />,
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    // Placeholder SVG is rendered instead
    expect(screen.getByTestId('card-grid-view').querySelector('svg')).toBeInTheDocument()
  })

  it('renders the card name', () => {
    render(
      <CardGridView
        cards={[makeCard()]}
        onQuantityChange={vi.fn()}
        onRemove={vi.fn()}
        onCardClick={vi.fn()}
      />,
    )
    expect(screen.getByText('Lightning Bolt')).toBeInTheDocument()
  })

  it('displays the current quantity', () => {
    render(
      <CardGridView
        cards={[makeCard({ quantity: 3 })]}
        onQuantityChange={vi.fn()}
        onRemove={vi.fn()}
        onCardClick={vi.fn()}
      />,
    )
    expect(screen.getByTestId('grid-qty-Lightning Bolt')).toHaveTextContent('3')
  })

  it('calls onQuantityChange with qty+1 when increment is clicked', () => {
    const onQuantityChange = vi.fn()
    render(
      <CardGridView
        cards={[makeCard({ quantity: 2 })]}
        onQuantityChange={onQuantityChange}
        onRemove={vi.fn()}
        onCardClick={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('grid-increment-Lightning Bolt'))
    expect(onQuantityChange).toHaveBeenCalledWith('Lightning Bolt', 3)
  })

  it('calls onQuantityChange with qty-1 when decrement is clicked and qty > 1', () => {
    const onQuantityChange = vi.fn()
    render(
      <CardGridView
        cards={[makeCard({ quantity: 2 })]}
        onQuantityChange={onQuantityChange}
        onRemove={vi.fn()}
        onCardClick={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('grid-decrement-Lightning Bolt'))
    expect(onQuantityChange).toHaveBeenCalledWith('Lightning Bolt', 1)
  })

  it('calls onRemove when decrement is clicked and qty is 1', () => {
    const onRemove = vi.fn()
    render(
      <CardGridView
        cards={[makeCard({ quantity: 1 })]}
        onQuantityChange={vi.fn()}
        onRemove={onRemove}
        onCardClick={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('grid-decrement-Lightning Bolt'))
    expect(onRemove).toHaveBeenCalledWith('Lightning Bolt')
  })

  it('calls onCardClick when the card image button is clicked', () => {
    const onCardClick = vi.fn()
    const card = makeCard()
    render(
      <CardGridView
        cards={[card]}
        onQuantityChange={vi.fn()}
        onRemove={vi.fn()}
        onCardClick={onCardClick}
      />,
    )
    fireEvent.click(screen.getByTestId('grid-card-Lightning Bolt'))
    expect(onCardClick).toHaveBeenCalledWith(card)
  })

  it('renders multiple cards', () => {
    render(
      <CardGridView
        cards={[makeCard(), makeCard({ name: 'Counterspell', scryfall_id: 'def-456' })]}
        onQuantityChange={vi.fn()}
        onRemove={vi.fn()}
        onCardClick={vi.fn()}
      />,
    )
    expect(screen.getByText('Lightning Bolt')).toBeInTheDocument()
    expect(screen.getByText('Counterspell')).toBeInTheDocument()
  })
})
