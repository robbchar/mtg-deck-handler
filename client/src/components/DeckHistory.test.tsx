import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import DeckHistory from './DeckHistory'
import type { DeckSnapshot, GameEntry, Deck, CardEntry } from '../types'

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

// currentState that matches SNAPSHOT_LATE exactly → no pending changes
const CURRENT_STATE_CLEAN = {
  cards: [
    { name: 'Lightning Bolt', quantity: 4, scryfall_id: null, section: 'mainboard' } as CardEntry,
    { name: 'Monastery Swiftspear', quantity: 2, scryfall_id: null, section: 'mainboard' } as CardEntry,
  ],
  sideboard: [] as CardEntry[],
  format: 'Modern',
  notes: '',
}

// currentState with an extra card → pending changes
const CURRENT_STATE_DIRTY = {
  ...CURRENT_STATE_CLEAN,
  cards: [
    ...CURRENT_STATE_CLEAN.cards,
    { name: 'Goblin Guide', quantity: 2, scryfall_id: null, section: 'mainboard' as const },
  ],
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
    render(<DeckHistory deckId="deck-1" games={[]} currentState={CURRENT_STATE_CLEAN} onRevert={vi.fn()} />)
    expect(screen.getByTestId('history-loading')).toBeInTheDocument()
  })
})

describe('DeckHistory — empty state', () => {
  it('shows empty state message when no snapshots and no pending changes exist', () => {
    render(<DeckHistory deckId="deck-1" games={[]} currentState={{ cards: [], sideboard: [], format: '', notes: '' }} onRevert={vi.fn()} />)
    expect(screen.getByText(/no history yet/i)).toBeInTheDocument()
  })
})

describe('DeckHistory — error state', () => {
  it('shows an error message when loading fails', () => {
    mockUseSnapshotsResult.error = 'Failed to load history'
    render(<DeckHistory deckId="deck-1" games={[]} currentState={CURRENT_STATE_CLEAN} onRevert={vi.fn()} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

// ── list rendering ────────────────────────────────────────────────────────────

describe('DeckHistory — list rendering', () => {
  it('renders one SnapshotEntry per snapshot', () => {
    mockUseSnapshotsResult.snapshots = [SNAPSHOT_LATE, SNAPSHOT_EARLY]
    render(<DeckHistory deckId="deck-1" games={[]} currentState={CURRENT_STATE_CLEAN} onRevert={vi.fn()} />)
    // Newest (index 0) gets "Current" badge; older entries get "Restore" button
    expect(screen.getByText('Current')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /restore/i })).toHaveLength(1)
  })
})

// ── W/L derivation ────────────────────────────────────────────────────────────

describe('DeckHistory — W/L derivation', () => {
  it('counts only games logged before the snapshot createdAt', () => {
    // GAME_WIN logged 2026-04-16T09:00 — after SNAPSHOT_EARLY (2026-04-15T10:00) but before SNAPSHOT_LATE (2026-04-16T10:00)
    // GAME_LOSS logged 2026-04-15T09:00 — before both snapshots
    mockUseSnapshotsResult.snapshots = [SNAPSHOT_LATE, SNAPSHOT_EARLY]
    render(<DeckHistory deckId="deck-1" games={[GAME_WIN, GAME_LOSS]} currentState={CURRENT_STATE_CLEAN} onRevert={vi.fn()} />)
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
    render(<DeckHistory deckId="deck-1" games={[]} currentState={CURRENT_STATE_CLEAN} onRevert={vi.fn()} />)
    // Click show on the first entry (SNAPSHOT_LATE)
    fireEvent.click(screen.getAllByRole('button', { name: /show/i })[0])
    expect(screen.getByText('Monastery Swiftspear')).toBeInTheDocument()
  })
})

// ── revert ────────────────────────────────────────────────────────────────────

describe('DeckHistory — current badge', () => {
  it('falls back to marking the newest snapshot as current when activeSnapshotId is not provided', () => {
    mockUseSnapshotsResult.snapshots = [SNAPSHOT_LATE, SNAPSHOT_EARLY]
    render(<DeckHistory deckId="deck-1" games={[]} currentState={CURRENT_STATE_CLEAN} onRevert={vi.fn()} />)
    expect(screen.getByText('Current')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /restore/i })).toHaveLength(1)
  })

  it('marks the snapshot matching activeSnapshotId as current', () => {
    mockUseSnapshotsResult.snapshots = [SNAPSHOT_LATE, SNAPSHOT_EARLY]
    // Simulate a prior restore to SNAPSHOT_EARLY
    render(<DeckHistory deckId="deck-1" games={[]} currentState={CURRENT_STATE_CLEAN} activeSnapshotId={SNAPSHOT_EARLY.id} onRevert={vi.fn()} />)
    // SNAPSHOT_LATE should now have the Restore button
    expect(screen.getByRole('button', { name: /restore/i })).toBeInTheDocument()
    // Current badge is present (on SNAPSHOT_EARLY)
    expect(screen.getByText('Current')).toBeInTheDocument()
    // Only one Restore button — SNAPSHOT_LATE gets it, SNAPSHOT_EARLY gets badge
    expect(screen.getAllByRole('button', { name: /restore/i })).toHaveLength(1)
  })
})

describe('DeckHistory — revert', () => {
  it('calls onRevert with the returned deck when revert succeeds', async () => {
    const updatedDeck: Deck = {
      id: 'deck-1', name: 'Test', format: 'Modern', notes: '',
      cards: [], sideboard: [], created_at: '', updated_at: '',
    }
    mockRevertSnapshot.mockResolvedValueOnce(updatedDeck)
    // Two snapshots: SNAPSHOT_LATE is current (index 0), SNAPSHOT_EARLY gets Restore button
    mockUseSnapshotsResult.snapshots = [SNAPSHOT_LATE, SNAPSHOT_EARLY]
    const onRevert = vi.fn()
    render(<DeckHistory deckId="deck-1" games={[]} currentState={CURRENT_STATE_CLEAN} onRevert={onRevert} />)
    fireEvent.click(screen.getByRole('button', { name: /restore/i }))
    await waitFor(() => expect(onRevert).toHaveBeenCalledWith(updatedDeck, SNAPSHOT_EARLY))
  })

  it('does not call onRevert when revert returns null', async () => {
    mockRevertSnapshot.mockResolvedValueOnce(null)
    // Two snapshots: SNAPSHOT_LATE is current (index 0), SNAPSHOT_EARLY gets Restore button
    mockUseSnapshotsResult.snapshots = [SNAPSHOT_LATE, SNAPSHOT_EARLY]
    const onRevert = vi.fn()
    render(<DeckHistory deckId="deck-1" games={[]} currentState={CURRENT_STATE_CLEAN} onRevert={onRevert} />)
    fireEvent.click(screen.getByRole('button', { name: /restore/i }))
    await waitFor(() => expect(mockRevertSnapshot).toHaveBeenCalled())
    expect(onRevert).not.toHaveBeenCalled()
  })
})

// ── pending entry ─────────────────────────────────────────────────────────────

describe('DeckHistory — pending entry', () => {
  it('shows pending entry when current state differs from the latest snapshot', () => {
    mockUseSnapshotsResult.snapshots = [SNAPSHOT_LATE, SNAPSHOT_EARLY]
    render(<DeckHistory deckId="deck-1" games={[]} currentState={CURRENT_STATE_DIRTY} onRevert={vi.fn()} />)
    expect(screen.getByTestId('pending-entry')).toBeInTheDocument()
    expect(screen.getByText('Working changes')).toBeInTheDocument()
  })

  it('hides pending entry when current state matches the latest snapshot', () => {
    mockUseSnapshotsResult.snapshots = [SNAPSHOT_LATE, SNAPSHOT_EARLY]
    render(<DeckHistory deckId="deck-1" games={[]} currentState={CURRENT_STATE_CLEAN} onRevert={vi.fn()} />)
    expect(screen.queryByTestId('pending-entry')).not.toBeInTheDocument()
  })

  it('shows pending entry as Current and snapshots as Restore when pending changes exist', () => {
    mockUseSnapshotsResult.snapshots = [SNAPSHOT_LATE, SNAPSHOT_EARLY]
    render(<DeckHistory deckId="deck-1" games={[]} currentState={CURRENT_STATE_DIRTY} onRevert={vi.fn()} />)
    expect(screen.getByText('Current')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /restore/i })).toHaveLength(2)
  })

  it('shows pending entry with no snapshots when fresh deck has cards (first-time user)', () => {
    mockUseSnapshotsResult.snapshots = []
    const freshState = { cards: [{ name: 'Lightning Bolt', quantity: 4, scryfall_id: null, section: 'mainboard' as const }], sideboard: [], format: '', notes: '' }
    render(<DeckHistory deckId="deck-1" games={[]} currentState={freshState} onRevert={vi.fn()} />)
    expect(screen.getByTestId('pending-entry')).toBeInTheDocument()
    expect(screen.queryByText(/no history yet/i)).not.toBeInTheDocument()
  })

  it('shows empty state when no snapshots and no pending changes', () => {
    mockUseSnapshotsResult.snapshots = []
    render(<DeckHistory deckId="deck-1" games={[]} currentState={{ cards: [], sideboard: [], format: '', notes: '' }} onRevert={vi.fn()} />)
    expect(screen.getByText(/no history yet/i)).toBeInTheDocument()
    expect(screen.queryByTestId('pending-entry')).not.toBeInTheDocument()
  })
})
