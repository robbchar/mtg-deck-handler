import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import CardSearch from './CardSearch'
import { useCards } from '../hooks/useCards'

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../hooks/useCards')

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CARD_A = {
  id: 'scryfall-abc-001',
  name: 'Lightning Bolt',
  mana_cost: '{R}',
  type_line: 'Instant',
  image_uris: { small: 'https://example.com/bolt-small.jpg' },
}

const CARD_B = {
  id: 'scryfall-def-002',
  name: 'Mountain',
  mana_cost: null,
  type_line: 'Basic Land — Mountain',
  image_uris: { small: 'https://example.com/mountain-small.jpg' },
}

const CARD_DFC = {
  id: 'scryfall-ghi-003',
  name: 'Delver of Secrets',
  mana_cost: '{U}',
  type_line: 'Creature — Human Wizard',
  // Double-faced card: no top-level image_uris
  card_faces: [
    { image_uris: { small: 'https://example.com/delver-small.jpg' } },
  ],
}

const CARD_NO_IMAGE = {
  id: 'scryfall-jkl-004',
  name: 'Ancient Card',
  mana_cost: '{2}',
  type_line: 'Artifact',
}

/** Default useCards return shape. */
function makeUseCards(overrides = {}) {
  return {
    searchCards: vi.fn().mockResolvedValue([]),
    getCard: vi.fn(),
    searching: false,
    error: null,
    ...overrides,
  }
}

/** Renders CardSearch with sensible defaults. */
function renderSearch({
  isOpen = true,
  onClose = vi.fn(),
  onAddCard = vi.fn(),
} = {}) {
  return render(<CardSearch isOpen={isOpen} onClose={onClose} onAddCard={onAddCard} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  useCards.mockReturnValue(makeUseCards())
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

// ── Visibility ────────────────────────────────────────────────────────────────

describe('CardSearch — visibility', () => {
  it('renders the panel in the DOM regardless of isOpen (always mounted)', () => {
    renderSearch({ isOpen: true })
    expect(screen.getByTestId('card-search-panel')).toBeInTheDocument()
  })

  it('panel is visible (translate-x-0) when isOpen is true', () => {
    renderSearch({ isOpen: true })
    expect(screen.getByTestId('card-search-panel')).toHaveClass('translate-x-0')
  })

  it('panel is off-screen (translate-x-full) when isOpen is false', () => {
    renderSearch({ isOpen: false })
    expect(screen.getByTestId('card-search-panel')).toHaveClass('translate-x-full')
  })

  it('panel is aria-hidden when isOpen is false', () => {
    renderSearch({ isOpen: false })
    expect(screen.getByTestId('card-search-panel')).toHaveAttribute('aria-hidden', 'true')
  })

  it('panel is not aria-hidden when isOpen is true', () => {
    renderSearch({ isOpen: true })
    expect(screen.getByTestId('card-search-panel')).toHaveAttribute('aria-hidden', 'false')
  })

  it('renders the backdrop when open', () => {
    renderSearch({ isOpen: true })
    expect(screen.getByTestId('search-backdrop')).toBeInTheDocument()
  })

  it('does not render the backdrop when closed', () => {
    renderSearch({ isOpen: false })
    expect(screen.queryByTestId('search-backdrop')).not.toBeInTheDocument()
  })

  it('search input is always present in the DOM', () => {
    renderSearch({ isOpen: false })
    expect(screen.getByTestId('search-input')).toBeInTheDocument()
  })
})

// ── Debounced search ──────────────────────────────────────────────────────────

describe('CardSearch — debounced search', () => {
  it('does not call searchCards immediately when the user types', async () => {
    const searchCards = vi.fn().mockResolvedValue([CARD_A])
    useCards.mockReturnValue(makeUseCards({ searchCards }))

    renderSearch()
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'light' } })

    expect(searchCards).not.toHaveBeenCalled()
  })

  it('calls searchCards after 300ms debounce', async () => {
    const searchCards = vi.fn().mockResolvedValue([CARD_A])
    useCards.mockReturnValue(makeUseCards({ searchCards }))

    renderSearch()
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'lightning' } })

    expect(searchCards).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(searchCards).toHaveBeenCalledWith('lightning')
    expect(searchCards).toHaveBeenCalledTimes(1)
  })

  it('does not call searchCards multiple times for rapid keystrokes (debounce)', async () => {
    const searchCards = vi.fn().mockResolvedValue([])
    useCards.mockReturnValue(makeUseCards({ searchCards }))

    renderSearch()
    const input = screen.getByTestId('search-input')

    fireEvent.change(input, { target: { value: 'l' } })
    fireEvent.change(input, { target: { value: 'li' } })
    fireEvent.change(input, { target: { value: 'lig' } })
    fireEvent.change(input, { target: { value: 'ligh' } })
    fireEvent.change(input, { target: { value: 'light' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(searchCards).toHaveBeenCalledTimes(1)
    expect(searchCards).toHaveBeenCalledWith('light')
  })

  it('does not call searchCards for empty input', async () => {
    const searchCards = vi.fn().mockResolvedValue([])
    useCards.mockReturnValue(makeUseCards({ searchCards }))

    renderSearch()
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: '' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(searchCards).not.toHaveBeenCalled()
  })

  it('does not call searchCards for whitespace-only input', async () => {
    const searchCards = vi.fn().mockResolvedValue([])
    useCards.mockReturnValue(makeUseCards({ searchCards }))

    renderSearch()
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: '   ' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(searchCards).not.toHaveBeenCalled()
  })

  it('sets hasSearched even when searchCards throws (try/catch/finally)', async () => {
    const searchCards = vi.fn().mockRejectedValue(new Error('network failure'))
    useCards.mockReturnValue(makeUseCards({ searchCards }))

    renderSearch()
    fireEvent.change(screen.getByTestId('search-input'), {
      target: { value: 'bolt' },
    })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(searchCards).toHaveBeenCalledTimes(1)
  })
})

// ── Loading state ─────────────────────────────────────────────────────────────

describe('CardSearch — loading state', () => {
  it('shows loading indicator when searching is true', () => {
    useCards.mockReturnValue(makeUseCards({ searching: true }))
    renderSearch()
    expect(screen.getByTestId('search-loading')).toBeInTheDocument()
  })

  it('hides loading indicator when searching is false', () => {
    useCards.mockReturnValue(makeUseCards({ searching: false }))
    renderSearch()
    expect(screen.queryByTestId('search-loading')).not.toBeInTheDocument()
  })
})

// ── Error state ───────────────────────────────────────────────────────────────

describe('CardSearch — error state', () => {
  it('shows error message when error is set', () => {
    useCards.mockReturnValue(makeUseCards({ error: 'Rate limited' }))
    renderSearch()
    expect(screen.getByTestId('search-error')).toBeInTheDocument()
  })

  it('error message contains helpful text', () => {
    useCards.mockReturnValue(makeUseCards({ error: 'Rate limited' }))
    renderSearch()
    expect(screen.getByTestId('search-error')).toHaveTextContent(/something went wrong/i)
  })

  it('does not show error message when error is null', () => {
    useCards.mockReturnValue(makeUseCards({ error: null }))
    renderSearch()
    expect(screen.queryByTestId('search-error')).not.toBeInTheDocument()
  })

  it('does not show error message while searching', () => {
    useCards.mockReturnValue(makeUseCards({ searching: true, error: 'Rate limited' }))
    renderSearch()
    expect(screen.queryByTestId('search-error')).not.toBeInTheDocument()
  })

  it('hides results when error is set', async () => {
    const searchCards = vi.fn().mockResolvedValue([CARD_A])
    useCards.mockReturnValue(makeUseCards({ searchCards, error: 'oops' }))

    renderSearch()
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'lightning' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(screen.queryByTestId('search-results')).not.toBeInTheDocument()
  })
})

// ── Results display ───────────────────────────────────────────────────────────

describe('CardSearch — results display', () => {
  async function renderWithResults(cards = [CARD_A, CARD_B]) {
    const searchCards = vi.fn().mockResolvedValue(cards)
    useCards.mockReturnValue(makeUseCards({ searchCards }))

    renderSearch()

    fireEvent.change(screen.getByTestId('search-input'), {
      target: { value: 'lightning' },
    })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => expect(screen.getByTestId('search-results')).toBeInTheDocument())
  }

  it('displays a result for each card returned', async () => {
    await renderWithResults([CARD_A, CARD_B])
    const results = screen.getByTestId('search-results')
    expect(results.querySelectorAll('li')).toHaveLength(2)
  })

  it('displays the card name in each result', async () => {
    await renderWithResults([CARD_A])
    expect(screen.getByText('Lightning Bolt')).toBeInTheDocument()
  })

  it('displays the mana cost when present', async () => {
    await renderWithResults([CARD_A])
    expect(screen.getByTestId(`mana-cost-${CARD_A.id}`)).toHaveTextContent('{R}')
  })

  it('displays the type line in each result', async () => {
    await renderWithResults([CARD_A])
    expect(screen.getByText('Instant')).toBeInTheDocument()
  })

  it('renders a card image thumbnail for cards with image_uris.small', async () => {
    await renderWithResults([CARD_A])
    const img = screen.getByAltText('Lightning Bolt')
    expect(img).toHaveAttribute('src', CARD_A.image_uris.small)
  })

  it('uses card_faces[0].image_uris.small for double-faced cards', async () => {
    await renderWithResults([CARD_DFC])
    const img = screen.getByAltText('Delver of Secrets')
    expect(img).toHaveAttribute('src', CARD_DFC.card_faces[0].image_uris.small)
  })

  it('shows a placeholder when a card has no image', async () => {
    await renderWithResults([CARD_NO_IMAGE])
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('does not show results list while searching', () => {
    useCards.mockReturnValue(makeUseCards({ searching: true }))
    renderSearch()
    expect(screen.queryByTestId('search-results')).not.toBeInTheDocument()
  })
})

// ── No results state ──────────────────────────────────────────────────────────

describe('CardSearch — no results state', () => {
  it('shows no-results message after a search that returns nothing', async () => {
    const searchCards = vi.fn().mockResolvedValue([])
    useCards.mockReturnValue(makeUseCards({ searchCards }))

    renderSearch()
    fireEvent.change(screen.getByTestId('search-input'), {
      target: { value: 'xyzzy not a real card' },
    })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() =>
      expect(screen.getByTestId('no-results')).toBeInTheDocument()
    )
  })

  it('does not show no-results before any search is performed', () => {
    renderSearch()
    expect(screen.queryByTestId('no-results')).not.toBeInTheDocument()
  })

  it('no-results message contains helpful text', async () => {
    const searchCards = vi.fn().mockResolvedValue([])
    useCards.mockReturnValue(makeUseCards({ searchCards }))

    renderSearch()
    fireEvent.change(screen.getByTestId('search-input'), {
      target: { value: 'noresultscard' },
    })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(screen.getByTestId('no-results')).toHaveTextContent(/no cards found/i)
    })
  })

  it('does not show no-results when error is set (error takes precedence)', async () => {
    const searchCards = vi.fn().mockResolvedValue([])
    useCards.mockReturnValue(makeUseCards({ searchCards, error: 'oops' }))

    renderSearch()
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'test' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(screen.queryByTestId('no-results')).not.toBeInTheDocument()
    expect(screen.getByTestId('search-error')).toBeInTheDocument()
  })
})

// ── Section selection ─────────────────────────────────────────────────────────

describe('CardSearch — section selection', () => {
  async function renderWithResultsAndClickCard(card = CARD_A) {
    const searchCards = vi.fn().mockResolvedValue([card])
    useCards.mockReturnValue(makeUseCards({ searchCards }))
    const onAddCard = vi.fn()

    render(<CardSearch isOpen onClose={vi.fn()} onAddCard={onAddCard} />)

    fireEvent.change(screen.getByTestId('search-input'), {
      target: { value: card.name },
    })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => screen.getByTestId('search-results'))

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Add ${card.name}`, 'i') }))

    return { onAddCard }
  }

  it('shows section picker after clicking a result', async () => {
    await renderWithResultsAndClickCard()
    expect(screen.getByTestId('section-picker')).toBeInTheDocument()
  })

  it('section picker contains Mainboard and Sideboard buttons', async () => {
    await renderWithResultsAndClickCard()
    expect(screen.getByRole('button', { name: /Mainboard/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sideboard/i })).toBeInTheDocument()
  })

  it('calls onAddCard with the card and "mainboard" when Mainboard is clicked', async () => {
    const { onAddCard } = await renderWithResultsAndClickCard()
    fireEvent.click(screen.getByRole('button', { name: /Mainboard/i }))
    expect(onAddCard).toHaveBeenCalledWith(CARD_A, 'mainboard')
  })

  it('calls onAddCard with the card and "sideboard" when Sideboard is clicked', async () => {
    const { onAddCard } = await renderWithResultsAndClickCard()
    fireEvent.click(screen.getByRole('button', { name: /Sideboard/i }))
    expect(onAddCard).toHaveBeenCalledWith(CARD_A, 'sideboard')
  })

  it('calls onAddCard exactly once on section selection', async () => {
    const { onAddCard } = await renderWithResultsAndClickCard()
    fireEvent.click(screen.getByRole('button', { name: /Mainboard/i }))
    expect(onAddCard).toHaveBeenCalledTimes(1)
  })

  it('hides section picker after a selection is made', async () => {
    await renderWithResultsAndClickCard()
    fireEvent.click(screen.getByRole('button', { name: /Mainboard/i }))
    expect(screen.queryByTestId('section-picker')).not.toBeInTheDocument()
  })

  it('clicking the same card again toggles the section picker closed', async () => {
    await renderWithResultsAndClickCard()
    expect(screen.getByTestId('section-picker')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Add ${CARD_A.name}`, 'i') }))
    expect(screen.queryByTestId('section-picker')).not.toBeInTheDocument()
  })

  it('only shows one section picker at a time across multiple results', async () => {
    const searchCards = vi.fn().mockResolvedValue([CARD_A, CARD_B])
    useCards.mockReturnValue(makeUseCards({ searchCards }))

    render(<CardSearch isOpen onClose={vi.fn()} onAddCard={vi.fn()} />)

    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'bolt' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => screen.getByTestId('search-results'))

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Add ${CARD_A.name}`, 'i') }))
    expect(screen.getAllByTestId('section-picker')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Add ${CARD_B.name}`, 'i') }))
    expect(screen.getAllByTestId('section-picker')).toHaveLength(1)
  })
})

// ── Close behaviours ──────────────────────────────────────────────────────────

describe('CardSearch — close behaviours', () => {
  it('calls onClose when the Escape key is pressed', () => {
    const onClose = vi.fn()
    renderSearch({ onClose })

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    renderSearch({ onClose })

    fireEvent.click(screen.getByTestId('search-backdrop'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the × button is clicked', () => {
    const onClose = vi.fn()
    renderSearch({ onClose })

    fireEvent.click(screen.getByRole('button', { name: /close search panel/i }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose for keypresses other than Escape', () => {
    const onClose = vi.fn()
    renderSearch({ onClose })

    fireEvent.keyDown(document, { key: 'Enter' })
    fireEvent.keyDown(document, { key: ' ' })
    fireEvent.keyDown(document, { key: 'Tab' })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not fire Escape handler when panel is closed (isOpen=false)', () => {
    const onClose = vi.fn()
    renderSearch({ isOpen: false, onClose })

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('Escape listener is removed after panel transitions to closed', () => {
    const onClose = vi.fn()
    const { rerender } = renderSearch({ isOpen: true, onClose })

    rerender(<CardSearch isOpen={false} onClose={onClose} onAddCard={vi.fn()} />)
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
  })
})