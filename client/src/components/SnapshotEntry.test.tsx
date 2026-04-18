import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import SnapshotEntry from './SnapshotEntry'
import type { DeckSnapshot, CardDiff } from '../types'

const SNAPSHOT: DeckSnapshot = {
  id: 'snap-1',
  createdAt: '2026-04-16T14:14:00.000Z',
  cards: [{ name: 'Lightning Bolt', quantity: 4, scryfall_id: null, section: 'mainboard' }],
  sideboard: [],
  format: 'Modern',
  notes: '',
}

const DIFF: CardDiff[] = [
  { name: 'Lightning Bolt', delta: 2, section: 'mainboard' },
  { name: 'Path to Exile', delta: -4, section: 'mainboard' },
]

// ── rendering ─────────────────────────────────────────────────────────────────

describe('SnapshotEntry — rendering', () => {
  it('renders the card count', () => {
    render(
      <SnapshotEntry
        snapshot={SNAPSHOT}
        diff={[]}
        formatChange={null}
        notesChanged={false}
        winsAtPoint={3}
        lossesAtPoint={2}
        onRevert={vi.fn()}
      />,
    )
    expect(screen.getByText(/4 cards/i)).toBeInTheDocument()
  })

  it('renders the W/L record', () => {
    render(
      <SnapshotEntry
        snapshot={SNAPSHOT}
        diff={[]}
        formatChange={null}
        notesChanged={false}
        winsAtPoint={7}
        lossesAtPoint={4}
        onRevert={vi.fn()}
      />,
    )
    expect(screen.getByText('7W')).toBeInTheDocument()
    expect(screen.getByText('4L')).toBeInTheDocument()
  })

  it('renders aggregate diff counts when collapsed', () => {
    render(
      <SnapshotEntry
        snapshot={SNAPSHOT}
        diff={DIFF}
        formatChange={null}
        notesChanged={false}
        winsAtPoint={0}
        lossesAtPoint={0}
        onRevert={vi.fn()}
      />,
    )
    expect(screen.getByText(/\+2 added/)).toBeInTheDocument()
    expect(screen.getByText(/−4 removed/)).toBeInTheDocument()
  })

  it('shows "No card changes" when diff is empty and format/notes unchanged', () => {
    render(
      <SnapshotEntry
        snapshot={SNAPSHOT}
        diff={[]}
        formatChange={null}
        notesChanged={false}
        winsAtPoint={0}
        lossesAtPoint={0}
        onRevert={vi.fn()}
      />,
    )
    expect(screen.getByText(/no card changes/i)).toBeInTheDocument()
  })

  it('shows format change inline when format changed', () => {
    render(
      <SnapshotEntry
        snapshot={SNAPSHOT}
        diff={[]}
        formatChange="Standard → Modern"
        notesChanged={false}
        winsAtPoint={0}
        lossesAtPoint={0}
        onRevert={vi.fn()}
      />,
    )
    expect(screen.getByText(/Standard → Modern/)).toBeInTheDocument()
  })

  it('shows "notes changed" indicator when notes changed', () => {
    render(
      <SnapshotEntry
        snapshot={SNAPSHOT}
        diff={[]}
        formatChange={null}
        notesChanged={true}
        winsAtPoint={0}
        lossesAtPoint={0}
        onRevert={vi.fn()}
      />,
    )
    expect(screen.getByText(/notes changed/i)).toBeInTheDocument()
  })

  it('renders a Restore button', () => {
    render(
      <SnapshotEntry
        snapshot={SNAPSHOT}
        diff={[]}
        formatChange={null}
        notesChanged={false}
        winsAtPoint={0}
        lossesAtPoint={0}
        onRevert={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /restore/i })).toBeInTheDocument()
  })
})

// ── expand/collapse ───────────────────────────────────────────────────────────

describe('SnapshotEntry — expand/collapse', () => {
  it('does not show named card chips when collapsed', () => {
    render(
      <SnapshotEntry
        snapshot={SNAPSHOT}
        diff={DIFF}
        formatChange={null}
        notesChanged={false}
        winsAtPoint={0}
        lossesAtPoint={0}
        onRevert={vi.fn()}
      />,
    )
    expect(screen.queryByText('Lightning Bolt')).not.toBeInTheDocument()
  })

  it('shows named card chips after clicking show', () => {
    render(
      <SnapshotEntry
        snapshot={SNAPSHOT}
        diff={DIFF}
        formatChange={null}
        notesChanged={false}
        winsAtPoint={0}
        lossesAtPoint={0}
        onRevert={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    expect(screen.getByText('Lightning Bolt')).toBeInTheDocument()
    expect(screen.getByText('Path to Exile')).toBeInTheDocument()
  })

  it('hides named card chips after toggling hide', () => {
    render(
      <SnapshotEntry
        snapshot={SNAPSHOT}
        diff={DIFF}
        formatChange={null}
        notesChanged={false}
        winsAtPoint={0}
        lossesAtPoint={0}
        onRevert={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    fireEvent.click(screen.getByRole('button', { name: /hide/i }))
    expect(screen.queryByText('Lightning Bolt')).not.toBeInTheDocument()
  })

  it('does not render the show button when diff is empty', () => {
    render(
      <SnapshotEntry
        snapshot={SNAPSHOT}
        diff={[]}
        formatChange={null}
        notesChanged={false}
        winsAtPoint={0}
        lossesAtPoint={0}
        onRevert={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /show/i })).not.toBeInTheDocument()
  })
})

// ── isCurrent ────────────────────────────────────────────────────────────────

describe('SnapshotEntry — isCurrent', () => {
  it('shows a "Current" badge and no Restore button when isCurrent is true', () => {
    render(
      <SnapshotEntry
        snapshot={SNAPSHOT}
        diff={[]}
        formatChange={null}
        notesChanged={false}
        winsAtPoint={0}
        lossesAtPoint={0}
        onRevert={vi.fn()}
        isCurrent={true}
      />,
    )
    expect(screen.getByText('Current')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /restore/i })).not.toBeInTheDocument()
  })

  it('shows the Restore button when isCurrent is false (default)', () => {
    render(
      <SnapshotEntry
        snapshot={SNAPSHOT}
        diff={[]}
        formatChange={null}
        notesChanged={false}
        winsAtPoint={0}
        lossesAtPoint={0}
        onRevert={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /restore/i })).toBeInTheDocument()
    expect(screen.queryByText('Current')).not.toBeInTheDocument()
  })
})

// ── revert ────────────────────────────────────────────────────────────────────

describe('SnapshotEntry — revert', () => {
  it('calls onRevert when Restore button is clicked', () => {
    const onRevert = vi.fn()
    render(
      <SnapshotEntry
        snapshot={SNAPSHOT}
        diff={[]}
        formatChange={null}
        notesChanged={false}
        winsAtPoint={0}
        lossesAtPoint={0}
        onRevert={onRevert}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /restore/i }))
    expect(onRevert).toHaveBeenCalledTimes(1)
  })
})
