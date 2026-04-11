import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DeckCard from './DeckCard'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DECK = {
  id: 'deck-abc-001',
  name: 'Mono Red Burn',
  format: 'Standard',
  card_count: 60,
  updated_at: '2024-06-15T12:00:00.000Z',
  notes: '',
}

const DECK_NO_FORMAT = {
  id: 'deck-abc-002',
  name: 'Untitled Deck',
  format: '',
  card_count: 0,
  updated_at: '2024-01-01T00:00:00.000Z',
  notes: '',
}

function renderCard(deck = DECK, onDelete = vi.fn()) {
  return render(
    <MemoryRouter>
      <DeckCard deck={deck} onDelete={onDelete} />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('DeckCard — rendering', () => {
  it('displays the deck name', () => {
    renderCard()
    expect(screen.getByText('Mono Red Burn')).toBeInTheDocument()
  })

  it('deck name is a link to /deck/:id', () => {
    renderCard()
    const link = screen.getByRole('link', { name: /Mono Red Burn/i })
    expect(link).toHaveAttribute('href', '/deck/deck-abc-001')
  })

  it('displays the format badge', () => {
    renderCard()
    expect(screen.getByTestId('format-badge')).toHaveTextContent('Standard')
  })

  it('does not render a format badge when format is empty', () => {
    renderCard(DECK_NO_FORMAT)
    expect(screen.queryByTestId('format-badge')).not.toBeInTheDocument()
  })

  it('displays the card count', () => {
    renderCard()
    expect(screen.getByTestId('card-count')).toHaveTextContent('60 cards')
  })

  it('displays "1 card" (singular) when card_count is 1', () => {
    renderCard({ ...DECK, card_count: 1 })
    expect(screen.getByTestId('card-count')).toHaveTextContent('1 card')
  })

  it('displays 0 cards when card_count is missing', () => {
    const { card_count: _omit, ...deckWithoutCount } = DECK
    renderCard(deckWithoutCount as typeof DECK)
    expect(screen.getByTestId('card-count')).toHaveTextContent('0 cards')
  })

  it('displays the last updated date', () => {
    renderCard()
    expect(screen.getByTestId('updated-at')).toHaveTextContent('Updated')
  })

  it('displays "—" for updated_at when the date is missing', () => {
    renderCard({ ...DECK, updated_at: null as unknown as string })
    expect(screen.getByTestId('updated-at')).toHaveTextContent('—')
  })

  it('renders the delete button', () => {
    renderCard()
    expect(
      screen.getByRole('button', { name: /Delete Mono Red Burn/i })
    ).toBeInTheDocument()
  })
})

// ── Delete confirmation flow ───────────────────────────────────────────────────

describe('DeckCard — delete confirmation', () => {
  it('shows confirmation UI after clicking Delete', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Delete Mono Red Burn/i }))
    expect(screen.getByText(/Delete this deck\?/i)).toBeInTheDocument()
  })

  it('shows Confirm Delete and Cancel buttons in confirmation state', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Delete Mono Red Burn/i }))
    expect(
      screen.getByRole('button', { name: /Confirm deletion/i })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument()
  })

  it('calls onDelete with the deck id when confirm is clicked', () => {
    const onDelete = vi.fn()
    renderCard(DECK, onDelete)
    fireEvent.click(screen.getByRole('button', { name: /Delete Mono Red Burn/i }))
    fireEvent.click(screen.getByRole('button', { name: /Confirm deletion/i }))
    expect(onDelete).toHaveBeenCalledOnce()
    expect(onDelete).toHaveBeenCalledWith('deck-abc-001')
  })

  it('does NOT call onDelete when Cancel is clicked', () => {
    const onDelete = vi.fn()
    renderCard(DECK, onDelete)
    fireEvent.click(screen.getByRole('button', { name: /Delete Mono Red Burn/i }))
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('dismisses confirmation UI after Cancel', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Delete Mono Red Burn/i }))
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(screen.queryByText(/Delete this deck\?/i)).not.toBeInTheDocument()
  })

  it('the original delete button is hidden while confirming', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Delete Mono Red Burn/i }))
    expect(
      screen.queryByRole('button', { name: /Delete Mono Red Burn/i })
    ).not.toBeInTheDocument()
  })
})