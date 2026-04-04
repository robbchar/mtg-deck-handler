import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import GameLogList from './GameLogList'
import type { GameEntry } from '../types'

function makeEntry(overrides: Partial<GameEntry> = {}): GameEntry {
  return {
    id: 'game-1',
    logged_at: new Date().toISOString(),
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

  it('does not render the summary when games is empty', () => {
    render(<GameLogList games={[]} />)
    expect(screen.queryByTestId('game-log-summary')).not.toBeInTheDocument()
  })
})

// ── overall record ────────────────────────────────────────────────────────────

describe('GameLogList — overall record', () => {
  it('shows correct W/L record', () => {
    const games = [
      makeEntry({ id: '1', result: 'win' }),
      makeEntry({ id: '2', result: 'win' }),
      makeEntry({ id: '3', result: 'loss' }),
    ]
    render(<GameLogList games={games} />)
    const record = screen.getByTestId('game-log-record')
    expect(record).toHaveTextContent('2W')
    expect(record).toHaveTextContent('1L')
  })

  it('shows 0W when all losses', () => {
    render(<GameLogList games={[makeEntry({ result: 'loss' })]} />)
    const record = screen.getByTestId('game-log-record')
    expect(record).toHaveTextContent('0W')
    expect(record).toHaveTextContent('1L')
  })
})

// ── last 5 dots ───────────────────────────────────────────────────────────────

describe('GameLogList — last 5 dots', () => {
  it('renders one dot per game up to 5', () => {
    const games = Array.from({ length: 3 }, (_, i) =>
      makeEntry({ id: `g${i}`, result: 'win' }),
    )
    render(<GameLogList games={games} />)
    expect(screen.getAllByTestId('game-dot')).toHaveLength(3)
  })

  it('renders exactly 5 dots when more than 5 games', () => {
    const games = Array.from({ length: 8 }, (_, i) =>
      makeEntry({ id: `g${i}`, result: i % 2 === 0 ? 'win' : 'loss' }),
    )
    render(<GameLogList games={games} />)
    expect(screen.getAllByTestId('game-dot')).toHaveLength(5)
  })

  it('shows "Last N:" label matching the number of dots', () => {
    const games = Array.from({ length: 3 }, (_, i) =>
      makeEntry({ id: `g${i}`, result: 'win' }),
    )
    render(<GameLogList games={games} />)
    expect(screen.getByTestId('game-log-last5')).toHaveTextContent('Last 3:')
  })
})

// ── trend indicator ───────────────────────────────────────────────────────────

describe('GameLogList — trend indicator', () => {
  it('does not render trend when fewer than 6 games', () => {
    const games = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ id: `g${i}`, result: 'win' }),
    )
    render(<GameLogList games={games} />)
    expect(screen.queryByTestId('game-log-trend')).not.toBeInTheDocument()
  })

  it('shows Hot when last 5 win rate is >20% higher than previous 5', () => {
    // last 5: all wins (100%), prev 5: all losses (0%) → diff = 1.0
    const games = [
      ...Array.from({ length: 5 }, (_, i) => makeEntry({ id: `new${i}`, result: 'win' })),
      ...Array.from({ length: 5 }, (_, i) => makeEntry({ id: `old${i}`, result: 'loss' })),
    ]
    render(<GameLogList games={games} />)
    expect(screen.getByTestId('game-log-trend')).toHaveTextContent('Hot')
  })

  it('shows Cold when last 5 win rate is >20% lower than previous 5', () => {
    // last 5: all losses (0%), prev 5: all wins (100%) → diff = -1.0
    const games = [
      ...Array.from({ length: 5 }, (_, i) => makeEntry({ id: `new${i}`, result: 'loss' })),
      ...Array.from({ length: 5 }, (_, i) => makeEntry({ id: `old${i}`, result: 'win' })),
    ]
    render(<GameLogList games={games} />)
    expect(screen.getByTestId('game-log-trend')).toHaveTextContent('Cold')
  })

  it('shows Even when win rate difference is ≤20%', () => {
    // last 5: 3 wins (60%), prev 5: 3 wins (60%) → diff = 0
    const games = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeEntry({ id: `new${i}`, result: i < 3 ? 'win' : 'loss' }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeEntry({ id: `old${i}`, result: i < 3 ? 'win' : 'loss' }),
      ),
    ]
    render(<GameLogList games={games} />)
    expect(screen.getByTestId('game-log-trend')).toHaveTextContent('Even')
  })
})
