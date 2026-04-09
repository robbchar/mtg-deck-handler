import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import GameLogger from './GameLogger'
import type { CardEntry, NewGameEntry } from '../types'

vi.mock('../context/ToastContext', () => ({
  useToastContext: () => ({ addToast: mockAddToast }),
}))

const mockAddToast = vi.fn()

const CARDS: CardEntry[] = [
  { name: 'Impact Tremors', quantity: 4, scryfall_id: 'abc', section: 'mainboard' },
  { name: "Warleader's Call", quantity: 4, scryfall_id: 'def', section: 'mainboard' },
  { name: 'Mountain', quantity: 20, scryfall_id: 'ghi', section: 'mainboard' },
]

function renderLogger(onSubmit = vi.fn().mockResolvedValue(true), cards = CARDS) {
  render(<GameLogger cards={cards} onSubmit={onSubmit} />)
}

function openPanel() {
  fireEvent.click(screen.getByTestId('game-logger-toggle'))
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── collapsed state ───────────────────────────────────────────────────────────

describe('GameLogger — collapsed state', () => {
  it('renders the toggle button', () => {
    renderLogger()
    expect(screen.getByTestId('game-logger-toggle')).toBeInTheDocument()
  })

  it('does not render the panel when collapsed', () => {
    renderLogger()
    expect(screen.queryByTestId('game-logger-panel')).not.toBeInTheDocument()
  })

  it('shows "Log a Game" label on the toggle', () => {
    renderLogger()
    expect(screen.getByText('Log a Game')).toBeInTheDocument()
  })
})

// ── expand / collapse ─────────────────────────────────────────────────────────

describe('GameLogger — expand/collapse', () => {
  it('shows the panel after clicking the toggle', () => {
    renderLogger()
    openPanel()
    expect(screen.getByTestId('game-logger-panel')).toBeInTheDocument()
  })

  it('hides the panel after toggling twice', () => {
    renderLogger()
    openPanel()
    fireEvent.click(screen.getByTestId('game-logger-toggle'))
    expect(screen.queryByTestId('game-logger-panel')).not.toBeInTheDocument()
  })
})

// ── result selection ──────────────────────────────────────────────────────────

describe('GameLogger — result selection', () => {
  it('shows Win and Loss buttons after opening', () => {
    renderLogger()
    openPanel()
    expect(screen.getByTestId('result-win')).toBeInTheDocument()
    expect(screen.getByTestId('result-loss')).toBeInTheDocument()
  })

  it('does not show detail fields before a result is selected', () => {
    renderLogger()
    openPanel()
    expect(screen.queryByTestId('game-logger-details')).not.toBeInTheDocument()
  })

  it('shows detail fields after selecting Win', () => {
    renderLogger()
    openPanel()
    fireEvent.click(screen.getByTestId('result-win'))
    expect(screen.getByTestId('game-logger-details')).toBeInTheDocument()
  })

  it('shows detail fields after selecting Loss', () => {
    renderLogger()
    openPanel()
    fireEvent.click(screen.getByTestId('result-loss'))
    expect(screen.getByTestId('game-logger-details')).toBeInTheDocument()
  })

  it('marks Win button as pressed when Win is selected', () => {
    renderLogger()
    openPanel()
    fireEvent.click(screen.getByTestId('result-win'))
    expect(screen.getByTestId('result-win')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('result-loss')).toHaveAttribute('aria-pressed', 'false')
  })

  it('marks Loss button as pressed when Loss is selected', () => {
    renderLogger()
    openPanel()
    fireEvent.click(screen.getByTestId('result-loss'))
    expect(screen.getByTestId('result-loss')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('result-win')).toHaveAttribute('aria-pressed', 'false')
  })
})

// ── form fields ───────────────────────────────────────────────────────────────

describe('GameLogger — form fields', () => {
  beforeEach(() => {
    renderLogger()
    openPanel()
    fireEvent.click(screen.getByTestId('result-win'))
  })

  it('renders turn ended input', () => {
    expect(screen.getByTestId('turn-ended-input')).toBeInTheDocument()
  })

  it('renders all 5 color pip buttons', () => {
    for (const color of ['W', 'U', 'B', 'R', 'G']) {
      expect(screen.getByTestId(`color-${color}`)).toBeInTheDocument()
    }
  })

  it('toggles a color on click and marks it as pressed', () => {
    const btn = screen.getByTestId('color-R')
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders archetype select', () => {
    expect(screen.getByTestId('archetype-select')).toBeInTheDocument()
  })

  it('renders opening hand feel select', () => {
    expect(screen.getByTestId('opening-hand-feel-select')).toBeInTheDocument()
  })

  it('opening hand feel select has flood, good, and screw options', () => {
    const select = screen.getByTestId('opening-hand-feel-select') as HTMLSelectElement
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).toContain('flood')
    expect(values).toContain('good')
    expect(values).toContain('screw')
  })

  it('renders card name chips from the deck', () => {
    const container = screen.getByTestId('cards-in-hand')
    expect(container).toBeInTheDocument()
    expect(container).toHaveTextContent('Impact Tremors')
    expect(container).toHaveTextContent("Warleader's Call")
  })

  it('renders tough opponent card input', () => {
    expect(screen.getByTestId('tough-card-input')).toBeInTheDocument()
  })

  it('renders mtga rank select', () => {
    expect(screen.getByTestId('mtga-rank-select')).toBeInTheDocument()
  })

  it('mtga rank select has all six tier options', () => {
    const select = screen.getByTestId('mtga-rank-select') as HTMLSelectElement
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).toEqual(expect.arrayContaining(['bronze', 'silver', 'gold', 'platinum', 'diamond', 'mythic']))
  })

  it('renders notes textarea', () => {
    expect(screen.getByTestId('game-notes-input')).toBeInTheDocument()
  })

  it('disables submit button before result is selected (panel just opened)', () => {
    // Re-render without selecting result
    vi.clearAllMocks()
    render(<GameLogger cards={CARDS} onSubmit={vi.fn()} />)
    fireEvent.click(screen.getAllByTestId('game-logger-toggle')[1])
    const submit = screen.getAllByTestId('log-game-submit')[1]
    expect(submit).toBeDisabled()
  })
})

// ── cards in hand cap ─────────────────────────────────────────────────────────

describe('GameLogger — cards_in_hand cap', () => {
  it('allows selecting up to 7 cards', () => {
    const manyCards: CardEntry[] = Array.from({ length: 10 }, (_, i) => ({
      name: `Card ${i + 1}`,
      quantity: 4,
      scryfall_id: `id-${i}`,
      section: 'mainboard' as const,
    }))
    render(<GameLogger cards={manyCards} onSubmit={vi.fn()} />)
    openPanel()
    fireEvent.click(screen.getByTestId('result-win'))

    const container = screen.getByTestId('cards-in-hand')
    const buttons = container.querySelectorAll('button')

    // Select 7
    for (let i = 0; i < 7; i++) {
      fireEvent.click(buttons[i])
    }
    // 8th should be disabled
    expect(buttons[7]).toBeDisabled()
  })

  it('re-enables a card slot when a selected card is deselected', () => {
    const manyCards: CardEntry[] = Array.from({ length: 8 }, (_, i) => ({
      name: `Card ${i + 1}`,
      quantity: 4,
      scryfall_id: `id-${i}`,
      section: 'mainboard' as const,
    }))
    render(<GameLogger cards={manyCards} onSubmit={vi.fn()} />)
    openPanel()
    fireEvent.click(screen.getByTestId('result-win'))

    const container = screen.getByTestId('cards-in-hand')
    const buttons = container.querySelectorAll('button')

    for (let i = 0; i < 7; i++) fireEvent.click(buttons[i])
    expect(buttons[7]).toBeDisabled()

    fireEvent.click(buttons[0]) // deselect one
    expect(buttons[7]).not.toBeDisabled()
  })
})

// ── submission ────────────────────────────────────────────────────────────────

describe('GameLogger — submission', () => {
  it('calls onSubmit with result only (minimal entry)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    renderLogger(onSubmit)
    openPanel()
    fireEvent.click(screen.getByTestId('result-win'))
    fireEvent.click(screen.getByTestId('log-game-submit'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const arg: NewGameEntry = onSubmit.mock.calls[0][0]
    expect(arg.result).toBe('win')
  })

  it('calls onSubmit with all fields when fully filled', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    renderLogger(onSubmit)
    openPanel()
    fireEvent.click(screen.getByTestId('result-loss'))

    fireEvent.change(screen.getByTestId('turn-ended-input'), { target: { value: '8' } })
    fireEvent.click(screen.getByTestId('color-R'))
    fireEvent.click(screen.getByTestId('color-G'))
    fireEvent.change(screen.getByTestId('archetype-select'), { target: { value: 'aggro' } })
    fireEvent.change(screen.getByTestId('opening-hand-feel-select'), { target: { value: 'screw' } })
    fireEvent.change(screen.getByTestId('mtga-rank-select'), { target: { value: 'gold' } })
    fireEvent.change(screen.getByTestId('tough-card-input'), { target: { value: 'Embercleave' } })
    fireEvent.change(screen.getByTestId('game-notes-input'), { target: { value: 'rough game' } })
    fireEvent.click(screen.getByTestId('log-game-submit'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const arg: NewGameEntry = onSubmit.mock.calls[0][0]
    expect(arg.result).toBe('loss')
    expect(arg.turn_ended).toBe(8)
    expect(arg.opponent_colors).toEqual(['R', 'G'])
    expect(arg.opponent_archetype).toBe('aggro')
    expect(arg.opening_hand_feel).toBe('screw')
    expect(arg.mtga_rank).toBe('gold')
    expect(arg.tough_opponent_card).toBe('Embercleave')
    expect(arg.notes).toBe('rough game')
  })

  it('shows success toast and resets form on successful submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    renderLogger(onSubmit)
    openPanel()
    fireEvent.click(screen.getByTestId('result-win'))
    fireEvent.click(screen.getByTestId('log-game-submit'))

    await waitFor(() => expect(mockAddToast).toHaveBeenCalledWith('Game logged'))
    // Form should reset: detail fields hidden again (result cleared)
    expect(screen.queryByTestId('game-logger-details')).not.toBeInTheDocument()
  })

  it('does not call addToast when onSubmit returns false', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false)
    renderLogger(onSubmit)
    openPanel()
    fireEvent.click(screen.getByTestId('result-win'))
    fireEvent.click(screen.getByTestId('log-game-submit'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(mockAddToast).not.toHaveBeenCalled()
  })

  it('does not reset form when onSubmit returns false', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false)
    renderLogger(onSubmit)
    openPanel()
    fireEvent.click(screen.getByTestId('result-win'))
    fireEvent.click(screen.getByTestId('log-game-submit'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    // Result still selected, details still visible
    expect(screen.getByTestId('game-logger-details')).toBeInTheDocument()
  })

  it('passes null for empty optional fields', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    renderLogger(onSubmit)
    openPanel()
    fireEvent.click(screen.getByTestId('result-win'))
    fireEvent.click(screen.getByTestId('log-game-submit'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const arg: NewGameEntry = onSubmit.mock.calls[0][0]
    expect(arg.turn_ended).toBeNull()
    expect(arg.opponent_archetype).toBeNull()
    expect(arg.opening_hand_feel).toBeNull()
    expect(arg.mtga_rank).toBeNull()
  })
})

// ── no cards ──────────────────────────────────────────────────────────────────

describe('GameLogger — no cards', () => {
  it('does not render the cards-in-hand section when deck is empty', () => {
    render(<GameLogger cards={[]} onSubmit={vi.fn()} />)
    openPanel()
    fireEvent.click(screen.getByTestId('result-win'))
    expect(screen.queryByTestId('cards-in-hand')).not.toBeInTheDocument()
  })
})
