import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import axios from 'axios'
import DeckEditor from './DeckEditor'
import { useDecks } from '../hooks/useDecks'
import { useCards } from '../hooks/useCards'

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../hooks/useDecks')
vi.mock('../hooks/useCards')
vi.mock('../hooks/useGames', () => ({
  useGames: () => ({ games: [], loading: false, error: null, addGame: vi.fn(), refetch: vi.fn() }),
}))
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

const mockedUseDecks = vi.mocked(useDecks)
const mockedUseCards = vi.mocked(useCards)
const mockedAxios = {
  get: vi.mocked(axios.get),
  post: vi.mocked(axios.post),
  put: vi.mocked(axios.put),
  delete: vi.mocked(axios.delete),
}

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DECK = {
  id: 'test-deck-id',
  name: 'Mono Red Burn',
  format: 'standard',
  notes: 'Go fast.',
  card_count: 8,
  cards: [
    { quantity: 4, name: 'Lightning Bolt', scryfall_id: null, section: 'mainboard' },
    { quantity: 2, name: 'Mountain', scryfall_id: null, section: 'mainboard' },
  ],
  sideboard: [
    { quantity: 2, name: 'Smash to Smithereens', scryfall_id: null, section: 'sideboard' },
  ],
  unknown: [],
  tags: [],
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
}

const EMPTY_DECK = {
  id: 'empty-deck-id',
  name: 'Empty Deck',
  format: '',
  notes: '',
  cards: [],
  sideboard: [],
  unknown: [],
  tags: [],
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
}

/** Default useDecks stub. Override individual fields per-test. */
function makeUseDecks(overrides = {}) {
  return {
    decks: [DECK],
    loading: false,
    error: null,
    getDeck: vi.fn().mockResolvedValue(DECK),
    updateDeck: vi.fn().mockResolvedValue(DECK),
    createDeck: vi.fn(),
    deleteDeck: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  }
}

/** Default useCards stub (satisfies CardSearch requirements). */
function makeUseCards(overrides = {}) {
  return {
    searchCards: vi.fn().mockResolvedValue([]),
    getCard: vi.fn().mockResolvedValue(null),
    searching: false,
    error: null,
    ...overrides,
  }
}

/**
 * Renders DeckEditor at /deck/:deckId inside the required providers.
 * Because DeckEditor uses useParams, it must be rendered inside a Route.
 */
function renderEditor(deckId = 'test-deck-id') {
  return render(
    <MemoryRouter initialEntries={[`/deck/${deckId}`]}>
      <Routes>
        <Route path="/deck/:id" element={<DeckEditor />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockNavigate.mockReset()
  mockedUseDecks.mockReturnValue(makeUseDecks())
  mockedUseCards.mockReturnValue(makeUseCards())
  // Silence clipboard in jsdom (not implemented in test env)
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
})

// ── Renders without crashing ──────────────────────────────────────────────────

describe('DeckEditor — renders without crashing', () => {
  it('renders without crashing', async () => {
    renderEditor()
    // Loading state renders immediately — component should not throw
    expect(document.body).toBeTruthy()
  })

  it('renders loading state on mount', () => {
    // getDeck is async; the component shows a spinner before it resolves
    mockedUseDecks.mockReturnValue(
      makeUseDecks({ getDeck: vi.fn().mockReturnValue(new Promise(() => {})) }),
    )
    renderEditor()
    expect(screen.getByTestId('deck-editor-loading')).toBeInTheDocument()
  })

  it('renders the editor once the deck loads', async () => {
    renderEditor()
    await waitFor(() =>
      expect(screen.getByTestId('deck-editor')).toBeInTheDocument(),
    )
  })

  it('renders an error state when getDeck returns null', async () => {
    mockedUseDecks.mockReturnValue(makeUseDecks({ getDeck: vi.fn().mockResolvedValue(null) }))
    renderEditor()
    await waitFor(() =>
      expect(screen.getByTestId('deck-editor-error')).toBeInTheDocument(),
    )
  })
})

// ── Deck data display ─────────────────────────────────────────────────────────

describe('DeckEditor — deck data display', () => {
  it('displays the deck name', async () => {
    renderEditor()
    await waitFor(() =>
      expect(screen.getByTestId('deck-name-heading')).toHaveTextContent('Mono Red Burn'),
    )
  })

  it('displays the format in the selector', async () => {
    renderEditor()
    await waitFor(() =>
      expect(screen.getByTestId('deck-format-select')).toHaveValue('standard'),
    )
  })

  it('renders a CardRow for each mainboard card', async () => {
    renderEditor()
    await waitFor(() => expect(screen.getByTestId('mainboard-section')).toBeInTheDocument())
    expect(screen.getByText('Lightning Bolt')).toBeInTheDocument()
    expect(screen.getByText('Mountain')).toBeInTheDocument()
  })

  it('renders a CardRow for each sideboard card', async () => {
    renderEditor()
    await waitFor(() => expect(screen.getByTestId('sideboard-section')).toBeInTheDocument())
    expect(screen.getByText('Smash to Smithereens')).toBeInTheDocument()
  })

  it('shows empty mainboard message when no mainboard cards', async () => {
    mockedUseDecks.mockReturnValue(makeUseDecks({ getDeck: vi.fn().mockResolvedValue(EMPTY_DECK) }))
    renderEditor('empty-deck-id')
    await waitFor(() =>
      expect(screen.getByTestId('mainboard-empty')).toBeInTheDocument(),
    )
  })

  it('shows empty sideboard message when no sideboard cards', async () => {
    mockedUseDecks.mockReturnValue(makeUseDecks({ getDeck: vi.fn().mockResolvedValue(EMPTY_DECK) }))
    renderEditor('empty-deck-id')
    await waitFor(() =>
      expect(screen.getByTestId('sideboard-empty')).toBeInTheDocument(),
    )
  })
})

// ── Inline name editing ───────────────────────────────────────────────────────

describe('DeckEditor — inline name editing', () => {
  it('shows an input when the name heading is clicked', async () => {
    renderEditor()
    await waitFor(() => screen.getByTestId('deck-name-heading'))
    fireEvent.click(screen.getByTestId('deck-name-heading'))
    expect(screen.getByTestId('deck-name-input')).toBeInTheDocument()
  })

  it('hides the heading while editing', async () => {
    renderEditor()
    await waitFor(() => screen.getByTestId('deck-name-heading'))
    fireEvent.click(screen.getByTestId('deck-name-heading'))
    expect(screen.queryByTestId('deck-name-heading')).not.toBeInTheDocument()
  })

  it('saves name and schedules auto-save on blur', async () => {
    const updateDeck = vi.fn().mockResolvedValue(DECK)
    mockedUseDecks.mockReturnValue(makeUseDecks({ updateDeck }))

    renderEditor()
    await waitFor(() => screen.getByTestId('deck-name-heading'))
    fireEvent.click(screen.getByTestId('deck-name-heading'))

    const input = screen.getByTestId('deck-name-input')
    fireEvent.change(input, { target: { value: 'New Name' } })
    fireEvent.blur(input)

    // Heading is restored
    await waitFor(() => expect(screen.getByTestId('deck-name-heading')).toBeInTheDocument())
    expect(screen.getByTestId('deck-name-heading')).toHaveTextContent('New Name')

    // Auto-save fires after debounce (2 s — allow extra buffer)
    await waitFor(
      () =>
        expect(updateDeck).toHaveBeenCalledWith(
          'test-deck-id',
          expect.objectContaining({ name: 'New Name' }),
        ),
      { timeout: 3500 },
    )
  })

  it('saves name on Enter key', async () => {
    renderEditor()
    await waitFor(() => screen.getByTestId('deck-name-heading'))
    fireEvent.click(screen.getByTestId('deck-name-heading'))

    const input = screen.getByTestId('deck-name-input')
    fireEvent.change(input, { target: { value: 'Enter Name' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(screen.getByTestId('deck-name-heading')).toHaveTextContent('Enter Name'),
    )
  })

  it('reverts the name on Escape key', async () => {
    renderEditor()
    await waitFor(() => screen.getByTestId('deck-name-heading'))
    fireEvent.click(screen.getByTestId('deck-name-heading'))

    const input = screen.getByTestId('deck-name-input')
    fireEvent.change(input, { target: { value: 'Abandoned Name' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    await waitFor(() =>
      expect(screen.getByTestId('deck-name-heading')).toHaveTextContent('Mono Red Burn'),
    )
  })
})

// ── Format selector ───────────────────────────────────────────────────────────

describe('DeckEditor — format selector', () => {
  it('contains all required format options', async () => {
    renderEditor()
    await waitFor(() => screen.getByTestId('deck-format-select'))

    const select = screen.getByTestId('deck-format-select') as HTMLSelectElement
    const options = Array.from(select.options).map((o) => o.value)

    expect(options).toContain('standard')
    expect(options).toContain('pioneer')
    expect(options).toContain('modern')
    expect(options).toContain('legacy')
    expect(options).toContain('vintage')
    expect(options).toContain('commander')
    expect(options).toContain('draft')
  })

  it('schedules auto-save when format changes', async () => {
    const updateDeck = vi.fn().mockResolvedValue(DECK)
    mockedUseDecks.mockReturnValue(makeUseDecks({ updateDeck }))

    renderEditor()
    await waitFor(() => screen.getByTestId('deck-format-select'))
    fireEvent.change(screen.getByTestId('deck-format-select'), { target: { value: 'modern' } })

    await waitFor(
      () =>
        expect(updateDeck).toHaveBeenCalledWith(
          'test-deck-id',
          expect.objectContaining({ format: 'modern' }),
        ),
      { timeout: 3500 },
    )
  })
})

// ── Quantity controls ─────────────────────────────────────────────────────────

describe('DeckEditor — quantity controls via CardRow', () => {
  it('increments mainboard quantity via CardRow + button', async () => {
    const updateDeck = vi.fn().mockResolvedValue(DECK)
    mockedUseDecks.mockReturnValue(makeUseDecks({ updateDeck }))

    renderEditor()
    await waitFor(() => screen.getByText('Lightning Bolt'))

    // Switch to list view so CardRow renders (default is grid)
    fireEvent.click(screen.getByTestId('view-mode-list'))

    const incrementBtns = screen.getAllByTestId('increment-btn')
    fireEvent.click(incrementBtns[0]) // first mainboard card

    await waitFor(
      () =>
        expect(updateDeck).toHaveBeenCalledWith(
          'test-deck-id',
          expect.objectContaining({ cards: expect.any(Array) }),
        ),
      { timeout: 3500 },
    )
  })

  it('removes mainboard card when quantity reaches 0', async () => {
    const updateDeck = vi.fn().mockResolvedValue(DECK)
    mockedUseDecks.mockReturnValue(
      makeUseDecks({
        updateDeck,
        getDeck: vi.fn().mockResolvedValue({
          ...DECK,
          cards: [{ quantity: 1, name: 'Mountain', scryfall_id: null, section: 'mainboard' }],
          sideboard: [],
        }),
      }),
    )

    renderEditor()
    await waitFor(() => screen.getByText('Mountain'))

    // Switch to list view so CardRow renders (default is grid)
    fireEvent.click(screen.getByTestId('view-mode-list'))

    fireEvent.click(screen.getByTestId('decrement-btn'))

    await waitFor(() => expect(screen.queryByText('Mountain')).not.toBeInTheDocument())
  })

  it('removes card when the remove button is clicked', async () => {
    renderEditor()
    await waitFor(() => screen.getByText('Lightning Bolt'))

    // Switch to list view so CardRow renders (default is grid)
    fireEvent.click(screen.getByTestId('view-mode-list'))

    const removeBtns = screen.getAllByTestId('remove-btn')
    fireEvent.click(removeBtns[0])

    await waitFor(() => expect(screen.queryByText('Lightning Bolt')).not.toBeInTheDocument())
  })
})

// ── Add Card button ───────────────────────────────────────────────────────────

describe('DeckEditor — Add Card button', () => {
  it('renders the Add Card button', async () => {
    renderEditor()
    await waitFor(() =>
      expect(screen.getByTestId('add-card-btn')).toBeInTheDocument(),
    )
  })

  it('opens the CardSearch panel when Add Card is clicked', async () => {
    renderEditor()
    await waitFor(() => screen.getByTestId('add-card-btn'))
    fireEvent.click(screen.getByTestId('add-card-btn'))
    expect(screen.getByTestId('card-search-panel')).toHaveClass('translate-x-0')
  })

  it('closes the CardSearch panel when the panel close action fires', async () => {
    renderEditor()
    await waitFor(() => screen.getByTestId('add-card-btn'))
    fireEvent.click(screen.getByTestId('add-card-btn'))
    // Close via backdrop
    fireEvent.click(screen.getByTestId('search-backdrop'))
    expect(screen.getByTestId('card-search-panel')).toHaveClass('translate-x-full')
  })
})

// ── Export button ─────────────────────────────────────────────────────────────

describe('DeckEditor — Export button', () => {
  it('renders the Export button', async () => {
    renderEditor()
    await waitFor(() =>
      expect(screen.getByTestId('export-btn')).toBeInTheDocument(),
    )
  })

  it('calls the export API and writes to clipboard when clicked', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { text: '4 Lightning Bolt\n2 Mountain' } })

    renderEditor()
    await waitFor(() => screen.getByTestId('export-btn'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('export-btn'))
    })

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('Lightning Bolt'),
      ),
    )
  })
})


// ── Auto-save ─────────────────────────────────────────────────────────────────

describe('DeckEditor — auto-save', () => {
  it('accumulates multiple field changes into a single debounced updateDeck call', async () => {
    const updateDeck = vi.fn().mockResolvedValue(DECK)
    mockedUseDecks.mockReturnValue(makeUseDecks({ updateDeck }))

    renderEditor()
    // Wait for the deck to load before taking over the clock
    await waitFor(() => screen.getByTestId('deck-editor'))

    vi.useFakeTimers()

    // Trigger two format changes quickly — they should be batched into one call
    fireEvent.change(screen.getByTestId('deck-format-select'), {
      target: { value: 'legacy' },
    })
    fireEvent.change(screen.getByTestId('deck-format-select'), {
      target: { value: 'modern' },
    })

    // Flush debounce timer (debounce is 2000ms)
    await act(async () => {
      vi.advanceTimersByTime(2100)
    })

    expect(updateDeck).toHaveBeenCalledTimes(1)
    expect(updateDeck).toHaveBeenCalledWith(
      'test-deck-id',
      expect.objectContaining({ format: 'modern' }),
    )

    vi.useRealTimers()
  })

  it('flushes pending saves immediately when the component unmounts (navigation)', async () => {
    const updateDeck = vi.fn().mockResolvedValue(DECK)
    mockedUseDecks.mockReturnValue(makeUseDecks({ updateDeck }))

    const { unmount } = renderEditor()
    // Wait for the deck to finish loading
    await waitFor(() => screen.getByTestId('deck-editor'))

    // Take over the clock so the debounce timer never fires on its own
    vi.useFakeTimers()

    // Change format — this schedules a pending save but the timer is frozen
    fireEvent.change(screen.getByTestId('deck-format-select'), {
      target: { value: 'legacy' },
    })

    // Confirm the debounce hasn't fired yet
    expect(updateDeck).not.toHaveBeenCalled()

    // Simulate navigation: unmount the component
    act(() => {
      unmount()
    })

    // The cleanup effect must flush the pending save synchronously
    expect(updateDeck).toHaveBeenCalledTimes(1)
    expect(updateDeck).toHaveBeenCalledWith(
      'test-deck-id',
      expect.objectContaining({ format: 'legacy' }),
    )

    vi.useRealTimers()
  })

  it('does not call updateDeck on unmount when there are no pending changes', async () => {
    const updateDeck = vi.fn().mockResolvedValue(DECK)
    mockedUseDecks.mockReturnValue(makeUseDecks({ updateDeck }))

    const { unmount } = renderEditor()
    await waitFor(() => screen.getByTestId('deck-editor'))

    vi.useFakeTimers()

    // Unmount without making any changes
    act(() => {
      unmount()
    })

    expect(updateDeck).not.toHaveBeenCalled()

    vi.useRealTimers()
  })
})