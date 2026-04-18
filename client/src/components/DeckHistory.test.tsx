import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import DeckHistory from './DeckHistory'
import type { DeckSnapshot, GameEntry, Deck } from '../types'

// ── Mock useSnapshots ─────────────────────────────────────────────────────────

const mockRevertSnapshot = vi.fn()
const mockUseSnapshotsResult = {
  snapshots: [] as DeckSnapshot[],
  loading: false,
  error: null as string | null,
  revertSnapshot: mockRevertSnapshot,
}

vi.mock('../hooks/useSnapshots', () => ({
  useSnapshots: () => mockUseSnapshotsResult,
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const GAME_WIN: GameEntry = {
  id: 'g1',
  logged_at: '2026-04-16T09:00:00.000Z',
  result: 'win',
  turn_ended: null, opponent_colors: [], opponent_archetype: null,
  opening_hand_feel: null, mtga_rank: null, cards_in_hand: [],
  tough_opponent_card: '', notes: '',
}
const GAME_LOSS: GameEntry = {
  id: 'g2',
  logged_at: '2026-04-15T09:00:00.000Z',
  result: 'loss',
  turn_ended: null, opponent_colors: [], opponent_archetype: null,
  opening_hand_feel: null, mtga_rank: null, cards_in_hand: [],
  tough_opponent_card: '', notes: '',
}

const SNAPSHOT_EARLY: DeckSnapshot = {
  id: 'snap-1',
  createdAt: '2026-04-15T10:00:00.000Z',
  cards: [{ name: 'Lightning Bolt', quantity: 4, scryfall_id: null, section: 'mainboard' }],
  sideboard: [],
  format: 'Modern',
  notes: '',
}
const SNAPSHOT_LATE: DeckSnapshot = {
  id: 'snap-2',
  createdAt: '2026-04-16T10:00:00.000Z',
  cards: [
    { name: 'Lightning Bolt', quantity: 4, scryfall_id: null, section: 'mainboard' },
    { name: 'Monastery Swiftspear', quantity: 2, scryfall_id: null, section: 'mainboard' },
  ],
  sideboard: [],
  format: 'Modern',
  notes: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseSnapshotsResult.snapshots = []
  mockUseSnapshotsResult.loading = false
  mockUseSnapshotsResult.error = null
})

// ── states ────────────────────────────────────────────────────────────────────

describe('DeckHistory — loading state', () => {
  it('shows a loading spinner while fetching', () => {
    mockUseSnapshotsResult.loading = true
    render(<DeckHistory deckId="deck-1" games={[]} onRevert={vi.fn()} />)
    expect(screen.getByTestId('history-loading')).toBeInTheDocument()
  })
})

describe('DeckHistory — empty state', () => {
  it('shows empty state message when no snapshots exist', () => {
    render(<DeckHistory deckId="deck-1" games={[]} onRevert={vi.fn()} />)
    expect(screen.getByText(/no history yet/i)).toBeInTheDocument()
  })
})

describe('DeckHistory — error state', () => {
  it('shows an error message when loading fails', () => {
    mockUseSnapshotsResult.error = 'Failed to load history'
    render(<DeckHistory deckId="deck-1" games={[]} onRevert={vi.fn()} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

// ── list rendering ────────────────────────────────────────────────────────────

describe('DeckHistory — list rendering', () => {
  it('renders one SnapshotEntry per snapshot', () => {
    mockUseSnapshotsResult.snapshots = [SNAPSHOT_LATE, SNAPSHOT_EARLY]
    render(<DeckHistory deckId="deck-1" games={[]} onRevert={vi.fn()} />)
    expect(screen.getAllByRole('button', { name: /restore/i })).toHaveLength(2)
  })
})

// ── W/L derivation ────────────────────────────────────────────────────────────

describe('DeckHistory — W/L derivation', () => {
  it('counts only games logged before the snapshot createdAt', () => {
    // GAME_WIN logged 2026-04-16T09:00 — after SNAPSHOT_EARLY (2026-04-15T10:00) but before SNAPSHOT_LATE (2026-04-16T10:00)
    // GAME_LOSS logged 2026-04-15T09:00 — before both snapshots
    mockUseSnapshotsResult.snapshots = [SNAPSHOT_LATE, SNAPSHOT_EARLY]
    render(<DeckHistory deckId="deck-1" games={[GAME_WIN, GAME_LOSS]} onRevert={vi.fn()} />)
    // SNAPSHOT_LATE (Apr 16 10:00): both games happened before → 1W 1L
    // SNAPSHOT_EARLY (Apr 15 10:00): only GAME_LOSS (Apr 15 09:00) → 0W 1L
    const wCells = screen.getAllByText(/\dW/)
    const lCells = screen.getAllByText(/\dL/)
    expect(wCells[0].textContent).toBe('1W') // SNAPSHOT_LATE
    expect(lCells[0].textContent).toBe('1L')
    expect(wCells[1].textContent).toBe('0W') // SNAPSHOT_EARLY
    expect(lCells[1].textContent).toBe('1L')
  })
})

// ── diff derivation ───────────────────────────────────────────────────────────

describe('DeckHistory — diff derivation', () => {
  it('shows added card in the diff for the later snapshot', async () => {
    mockUseSnapshotsResult.snapshots = [SNAPSHOT_LATE, SNAPSHOT_EARLY]
    render(<DeckHistory deckId="deck-1" games={[]} onRevert={vi.fn()} />)
    // Click show on the first entry (SNAPSHOT_LATE)
    fireEvent.click(screen.getAllByRole('button', { name: /show/i })[0])
    expect(screen.getByText('Monastery Swiftspear')).toBeInTheDocument()
  })
})

// ── revert ────────────────────────────────────────────────────────────────────

describe('DeckHistory — revert', () => {
  it('calls onRevert with the returned deck when revert succeeds', async () => {
    const updatedDeck: Deck = {
      id: 'deck-1', name: 'Test', format: 'Modern', notes: '',
      cards: [], sideboard: [], created_at: '', updated_at: '',
    }
    mockRevertSnapshot.mockResolvedValueOnce(updatedDeck)
    mockUseSnapshotsResult.snapshots = [SNAPSHOT_EARLY]
    const onRevert = vi.fn()
    render(<DeckHistory deckId="deck-1" games={[]} onRevert={onRevert} />)
    fireEvent.click(screen.getByRole('button', { name: /restore/i }))
    await waitFor(() => expect(onRevert).toHaveBeenCalledWith(updatedDeck, SNAPSHOT_EARLY))
  })

  it('does not call onRevert when revert returns null', async () => {
    mockRevertSnapshot.mockResolvedValueOnce(null)
    mockUseSnapshotsResult.snapshots = [SNAPSHOT_EARLY]
    const onRevert = vi.fn()
    render(<DeckHistory deckId="deck-1" games={[]} onRevert={onRevert} />)
    fireEvent.click(screen.getByRole('button', { name: /restore/i }))
    await waitFor(() => expect(mockRevertSnapshot).toHaveBeenCalled())
    expect(onRevert).not.toHaveBeenCalled()
  })
})
