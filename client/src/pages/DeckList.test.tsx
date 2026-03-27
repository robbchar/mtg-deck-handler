import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DeckList from './DeckList'
import { useDecks } from '../hooks/useDecks'

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../hooks/useDecks')

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DECK_A = {
  id: 'deck-aaa',
  name: 'Mono Red',
  format: 'Standard',
  card_count: 60,
  updated_at: '2024-06-01T00:00:00.000Z',
  notes: '',
}

const DECK_B = {
  id: 'deck-bbb',
  name: 'Mono Blue',
  format: 'Modern',
  card_count: 40,
  updated_at: '2024-07-01T00:00:00.000Z',
  notes: '',
}

/** Default useDecks return shape — override individual fields per test. */
function makeUseDecks(overrides = {}) {
  return {
    decks: [],
    loading: false,
    error: null,
    createDeck: vi.fn(),
    deleteDeck: vi.fn(),
    updateDeck: vi.fn(),
    getDeck: vi.fn(),
    ...overrides,
  }
}

function renderDeckList() {
  return render(
    <MemoryRouter>
      <DeckList />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockNavigate.mockReset()
})

// ── Loading state ─────────────────────────────────────────────────────────────

describe('DeckList — loading state', () => {
  it('shows a loading spinner while fetching', () => {
    useDecks.mockReturnValue(makeUseDecks({ loading: true }))
    renderDeckList()
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
  })

  it('hides the loading spinner once loading is complete', () => {
    useDecks.mockReturnValue(makeUseDecks({ loading: false }))
    renderDeckList()
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument()
  })

  it('disables the New Deck button while loading', () => {
    useDecks.mockReturnValue(makeUseDecks({ loading: true }))
    renderDeckList()
    expect(screen.getByRole('button', { name: /\+ New Deck/i })).toBeDisabled()
  })
})

// ── Empty state ───────────────────────────────────────────────────────────────

describe('DeckList — empty state', () => {
  it('shows the empty state when there are no decks', () => {
    useDecks.mockReturnValue(makeUseDecks({ decks: [] }))
    renderDeckList()
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
  })

  it('empty state contains a helpful message', () => {
    useDecks.mockReturnValue(makeUseDecks({ decks: [] }))
    renderDeckList()
    expect(screen.getByText(/No decks yet/i)).toBeInTheDocument()
  })

  it('empty state contains a New Deck call-to-action', () => {
    useDecks.mockReturnValue(makeUseDecks({ decks: [] }))
    renderDeckList()
    const newDeckButtons = screen.getAllByRole('button', { name: /\+ New Deck/i })
    expect(newDeckButtons.length).toBeGreaterThanOrEqual(1)
  })

  it('does not show the deck grid when there are no decks', () => {
    useDecks.mockReturnValue(makeUseDecks({ decks: [] }))
    renderDeckList()
    expect(screen.queryByTestId('deck-grid')).not.toBeInTheDocument()
  })
})

// ── Populated state ───────────────────────────────────────────────────────────

describe('DeckList — deck grid', () => {
  it('renders a DeckCard for each deck', () => {
    useDecks.mockReturnValue(makeUseDecks({ decks: [DECK_A, DECK_B] }))
    renderDeckList()
    expect(screen.getByText('Mono Red')).toBeInTheDocument()
    expect(screen.getByText('Mono Blue')).toBeInTheDocument()
  })

  it('shows the deck grid container', () => {
    useDecks.mockReturnValue(makeUseDecks({ decks: [DECK_A] }))
    renderDeckList()
    expect(screen.getByTestId('deck-grid')).toBeInTheDocument()
  })

  it('does not show the empty state when decks are present', () => {
    useDecks.mockReturnValue(makeUseDecks({ decks: [DECK_A] }))
    renderDeckList()
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument()
  })
})

// ── New Deck button ───────────────────────────────────────────────────────────

describe('DeckList — New Deck button', () => {
  it('renders the New Deck button in the header', () => {
    useDecks.mockReturnValue(makeUseDecks({ decks: [DECK_A] }))
    renderDeckList()
    expect(
      screen.getByRole('button', { name: /\+ New Deck/i })
    ).toBeInTheDocument()
  })

  it('calls createDeck with a default name when clicked', async () => {
    const createDeck = vi.fn().mockResolvedValue(null)
    useDecks.mockReturnValue(makeUseDecks({ decks: [DECK_A], createDeck }))
    renderDeckList()

    fireEvent.click(screen.getByRole('button', { name: /\+ New Deck/i }))

    await waitFor(() => {
      expect(createDeck).toHaveBeenCalledWith({ name: 'New Deck' })
    })
  })

  it('navigates to /deck/:id after successful creation', async () => {
    const newDeck = { ...DECK_A, id: 'new-deck-id' }
    const createDeck = vi.fn().mockResolvedValue(newDeck)
    useDecks.mockReturnValue(makeUseDecks({ decks: [DECK_A], createDeck }))
    renderDeckList()

    fireEvent.click(screen.getByRole('button', { name: /\+ New Deck/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/deck/new-deck-id')
    })
  })

  it('does not navigate when createDeck returns null (error case)', async () => {
    const createDeck = vi.fn().mockResolvedValue(null)
    useDecks.mockReturnValue(makeUseDecks({ decks: [DECK_A], createDeck }))
    renderDeckList()

    fireEvent.click(screen.getByRole('button', { name: /\+ New Deck/i }))

    await waitFor(() => expect(createDeck).toHaveBeenCalled())
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})

// ── Delete flow ───────────────────────────────────────────────────────────────

describe('DeckList — delete flow', () => {
  it('calls deleteDeck after confirming deletion from a DeckCard', async () => {
    const deleteDeck = vi.fn().mockResolvedValue(true)
    useDecks.mockReturnValue(makeUseDecks({ decks: [DECK_A], deleteDeck }))
    renderDeckList()

    // Open confirmation
    fireEvent.click(screen.getByRole('button', { name: /Delete Mono Red/i }))
    // Confirm
    fireEvent.click(screen.getByRole('button', { name: /Confirm deletion/i }))

    await waitFor(() => {
      expect(deleteDeck).toHaveBeenCalledWith('deck-aaa')
    })
  })
})

// ── Error banner ──────────────────────────────────────────────────────────────

describe('DeckList — error state', () => {
  it('shows an error banner when error is set', () => {
    useDecks.mockReturnValue(makeUseDecks({ error: 'Failed to load decks' }))
    renderDeckList()
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load decks')
  })

  it('does not show the error banner when error is null', () => {
    useDecks.mockReturnValue(makeUseDecks({ error: null }))
    renderDeckList()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})