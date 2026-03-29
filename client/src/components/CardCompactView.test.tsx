import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import CardCompactView from './CardCompactView'
import type { CardEntry } from '../types'

const makeCard = (overrides: Partial<CardEntry> = {}): CardEntry => ({
  name: 'Lightning Bolt',
  quantity: 2,
  scryfall_id: 'abc-123',
  section: 'mainboard',
  mana_cost: '{R}',
  image_uris: { small: 'https://example.com/small.jpg' },
  ...overrides,
})

describe('CardCompactView', () => {
  it('renders the compact view container', () => {
    render(
      <CardCompactView
        cards={[makeCard()]}
        onQuantityChange={vi.fn()}
        onRemove={vi.fn()}
        onCardClick={vi.fn()}
      />,
    )
    expect(screen.getByTestId('card-compact-view')).toBeInTheDocument()
  })

  it('renders the card name', () => {
    render(
      <CardCompactView
        cards={[makeCard()]}
        onQuantityChange={vi.fn()}
        onRemove={vi.fn()}
        onCardClick={vi.fn()}
      />,
    )
    expect(screen.getByText('Lightning Bolt')).toBeInTheDocument()
  })

  it('renders mana cost when present', () => {
    render(
      <CardCompactView
        cards={[makeCard()]}
        onQuantityChange={vi.fn()}
        onRemove={vi.fn()}
        onCardClick={vi.fn()}
      />,
    )
    expect(screen.getByText('{R}')).toBeInTheDocument()
  })

  it('renders a small thumbnail when image_uris.small is available', () => {
    render(
      <CardCompactView
        cards={[makeCard()]}
        onQuantityChange={vi.fn()}
        onRemove={vi.fn()}
        onCardClick={vi.fn()}
      />,
    )
    const img = screen.getByAltText('Lightning Bolt')
    expect(img).toHaveAttribute('src', 'https://example.com/small.jpg')
  })

  it('renders a placeholder when no image_uris', () => {
    render(
      <CardCompactView
        cards={[makeCard({ image_uris: undefined })]}
        onQuantityChange={vi.fn()}
        onRemove={vi.fn()}
        onCardClick={vi.fn()}
      />,
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByTestId('card-compact-view').querySelector('svg')).toBeInTheDocument()
  })

  it('displays the current quantity', () => {
    render(
      <CardCompactView
        cards={[makeCard({ quantity: 4 })]}
        onQuantityChange={vi.fn()}
        onRemove={vi.fn()}
        onCardClick={vi.fn()}
      />,
    )
    expect(screen.getByTestId('compact-qty-Lightning Bolt')).toHaveTextContent('4')
  })

  it('calls onQuantityChange with qty+1 when increment is clicked', () => {
    const onQuantityChange = vi.fn()
    render(
      <CardCompactView
        cards={[makeCard({ quantity: 2 })]}
        onQuantityChange={onQuantityChange}
        onRemove={vi.fn()}
        onCardClick={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('compact-increment-Lightning Bolt'))
    expect(onQuantityChange).toHaveBeenCalledWith('Lightning Bolt', 3)
  })

  it('calls onQuantityChange with qty-1 when decrement is clicked and qty > 1', () => {
    const onQuantityChange = vi.fn()
    render(
      <CardCompactView
        cards={[makeCard({ quantity: 2 })]}
        onQuantityChange={onQuantityChange}
        onRemove={vi.fn()}
        onCardClick={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('compact-decrement-Lightning Bolt'))
    expect(onQuantityChange).toHaveBeenCalledWith('Lightning Bolt', 1)
  })

  it('calls onRemove when decrement is clicked and qty is 1', () => {
    const onRemove = vi.fn()
    render(
      <CardCompactView
        cards={[makeCard({ quantity: 1 })]}
        onQuantityChange={vi.fn()}
        onRemove={onRemove}
        onCardClick={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('compact-decrement-Lightning Bolt'))
    expect(onRemove).toHaveBeenCalledWith('Lightning Bolt')
  })

  it('calls onCardClick when the thumbnail button is clicked', () => {
    const onCardClick = vi.fn()
    const card = makeCard()
    render(
      <CardCompactView
        cards={[card]}
        onQuantityChange={vi.fn()}
        onRemove={vi.fn()}
        onCardClick={onCardClick}
      />,
    )
    fireEvent.click(screen.getByTestId('compact-card-Lightning Bolt'))
    expect(onCardClick).toHaveBeenCalledWith(card)
  })

  it('renders multiple cards', () => {
    render(
      <CardCompactView
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
