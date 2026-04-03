import { render, screen, within, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import GameLogList from './GameLogList'
import type { GameEntry } from '../types'

const NOW = new Date('2025-04-03T20:00:00.000Z').getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

function makeEntry(overrides: Partial<GameEntry> = {}): GameEntry {
  return {
    id: 'game-1',
    logged_at: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    result: 'win',
    turn_ended: null,
    opponent_colors: [],
    opponent_archetype: null,
    opening_hand_feel: null,
    cards_in_hand: [],
    tough_opponent_card: '',
    notes: '',
    ...overrides,
  }
}

// ── empty state ───────────────────────────────────────────────────────────────

describe('GameLogList — empty state', () => {
  it('shows empty state message when games array is empty', () => {
    render(<GameLogList games={[]} />)
    expect(screen.getByTestId('game-log-empty')).toBeInTheDocument()
    expect(screen.getByText('No games logged yet.')).toBeInTheDocument()
  })

  it('does not render the list when games is empty', () => {
    render(<GameLogList games={[]} />)
    expect(screen.queryByTestId('game-log-list')).not.toBeInTheDocument()
  })
})

// ── list rendering ────────────────────────────────────────────────────────────

describe('GameLogList — list rendering', () => {
  it('renders one row per game entry', () => {
    render(<GameLogList games={[makeEntry(), makeEntry({ id: 'game-2', result: 'loss' })]} />)
    expect(screen.getAllByTestId('game-log-row')).toHaveLength(2)
  })

  it('renders the list container', () => {
    render(<GameLogList games={[makeEntry()]} />)
    expect(screen.getByTestId('game-log-list')).toBeInTheDocument()
  })
})

// ── result badge ──────────────────────────────────────────────────────────────

describe('GameLogList — result badge', () => {
  it('shows Win badge for a win', () => {
    render(<GameLogList games={[makeEntry({ result: 'win' })]} />)
    expect(screen.getByTestId('game-result-badge')).toHaveTextContent('Win')
  })

  it('shows Loss badge for a loss', () => {
    render(<GameLogList games={[makeEntry({ result: 'loss' })]} />)
    expect(screen.getByTestId('game-result-badge')).toHaveTextContent('Loss')
  })
})

// ── turn ──────────────────────────────────────────────────────────────────────

describe('GameLogList — turn', () => {
  it('shows turn when present', () => {
    render(<GameLogList games={[makeEntry({ turn_ended: 6 })]} />)
    expect(screen.getByTestId('game-turn')).toHaveTextContent('T6')
  })

  it('does not render turn element when turn_ended is null', () => {
    render(<GameLogList games={[makeEntry({ turn_ended: null })]} />)
    expect(screen.queryByTestId('game-turn')).not.toBeInTheDocument()
  })
})

// ── opponent colors ───────────────────────────────────────────────────────────

describe('GameLogList — opponent colors', () => {
  it('renders color pips when present', () => {
    render(<GameLogList games={[makeEntry({ opponent_colors: ['R', 'G'] })]} />)
    const colorContainer = screen.getByTestId('game-colors')
    expect(within(colorContainer).getByText('R')).toBeInTheDocument()
    expect(within(colorContainer).getByText('G')).toBeInTheDocument()
  })

  it('does not render color pips when opponent_colors is empty', () => {
    render(<GameLogList games={[makeEntry({ opponent_colors: [] })]} />)
    expect(screen.queryByTestId('game-colors')).not.toBeInTheDocument()
  })
})

// ── archetype ────────────────────────────────────────────────────────────────

describe('GameLogList — archetype', () => {
  it('renders archetype when present', () => {
    render(<GameLogList games={[makeEntry({ opponent_archetype: 'aggro' })]} />)
    expect(screen.getByTestId('game-archetype')).toHaveTextContent('aggro')
  })

  it('does not render archetype element when null', () => {
    render(<GameLogList games={[makeEntry({ opponent_archetype: null })]} />)
    expect(screen.queryByTestId('game-archetype')).not.toBeInTheDocument()
  })
})

// ── remove button ─────────────────────────────────────────────────────────────

describe('GameLogList — remove button', () => {
  it('renders a remove button on each row when onRemove is provided', () => {
    render(<GameLogList games={[makeEntry(), makeEntry({ id: 'game-2' })]} onRemove={vi.fn()} />)
    expect(screen.getAllByTestId('remove-game-btn')).toHaveLength(2)
  })

  it('does not render remove buttons when onRemove is not provided', () => {
    render(<GameLogList games={[makeEntry()]} />)
    expect(screen.queryByTestId('remove-game-btn')).not.toBeInTheDocument()
  })

  it('calls onRemove with the game id when clicked', () => {
    const onRemove = vi.fn()
    const entry = makeEntry({ id: 'game-abc' })
    render(<GameLogList games={[entry]} onRemove={onRemove} />)
    fireEvent.click(screen.getByTestId('remove-game-btn'))
    expect(onRemove).toHaveBeenCalledWith('game-abc')
  })
})

// ── relative timestamp ────────────────────────────────────────────────────────

describe('GameLogList — relative timestamp', () => {
  it('shows "just now" for recent entries (< 1 minute)', () => {
    render(<GameLogList games={[makeEntry({ logged_at: new Date(NOW - 30_000).toISOString() })]} />)
    expect(screen.getByTestId('game-timestamp')).toHaveTextContent('just now')
  })

  it('shows minutes ago', () => {
    render(<GameLogList games={[makeEntry({ logged_at: new Date(NOW - 5 * 60_000).toISOString() })]} />)
    expect(screen.getByTestId('game-timestamp')).toHaveTextContent('5m ago')
  })

  it('shows hours ago', () => {
    render(<GameLogList games={[makeEntry({ logged_at: new Date(NOW - 2 * 3600_000).toISOString() })]} />)
    expect(screen.getByTestId('game-timestamp')).toHaveTextContent('2h ago')
  })

  it('shows days ago', () => {
    render(<GameLogList games={[makeEntry({ logged_at: new Date(NOW - 3 * 86400_000).toISOString() })]} />)
    expect(screen.getByTestId('game-timestamp')).toHaveTextContent('3d ago')
  })
})
