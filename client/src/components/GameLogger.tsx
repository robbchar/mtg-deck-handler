import { useState } from 'react'
import { useToastContext } from '../context/ToastContext'
import type {
  CardEntry,
  GameResult,
  MtgaRank,
  NewGameEntry,
  OpponentArchetype,
  OpponentColor,
  OpeningHandFeel,
} from '../types'

const COLOR_LABELS: { value: OpponentColor; label: string }[] = [
  { value: 'W', label: 'W' },
  { value: 'U', label: 'U' },
  { value: 'B', label: 'B' },
  { value: 'R', label: 'R' },
  { value: 'G', label: 'G' },
]

const COLOR_STYLES: Record<OpponentColor, { base: string; selected: string; hover: string }> = {
  W: {
    base:     'border-yellow-200 bg-yellow-50   text-yellow-700',
    selected: 'border-yellow-400 bg-yellow-200  text-yellow-900',
    hover:    'hover:border-yellow-300 hover:bg-yellow-100',
  },
  U: {
    base:     'border-blue-200   bg-blue-50     text-blue-700',
    selected: 'border-blue-500   bg-blue-200    text-blue-900',
    hover:    'hover:border-blue-300   hover:bg-blue-100',
  },
  B: {
    base:     'border-gray-500   bg-gray-800    text-gray-200',
    selected: 'border-gray-300   bg-gray-900    text-white',
    hover:    'hover:border-gray-400   hover:bg-gray-700',
  },
  R: {
    base:     'border-red-200    bg-red-50      text-red-700',
    selected: 'border-red-500    bg-red-200     text-red-900',
    hover:    'hover:border-red-300    hover:bg-red-100',
  },
  G: {
    base:     'border-green-200  bg-green-50    text-green-700',
    selected: 'border-green-500  bg-green-200   text-green-900',
    hover:    'hover:border-green-300  hover:bg-green-100',
  },
}

const ARCHETYPES: { value: OpponentArchetype; label: string }[] = [
  { value: 'aggro', label: 'Aggro' },
  { value: 'midrange', label: 'Midrange' },
  { value: 'control', label: 'Control' },
  { value: 'combo', label: 'Combo' },
  { value: 'unknown', label: 'Unknown' },
]

const HAND_FEELS: { value: OpeningHandFeel; label: string }[] = [
  { value: 'flood', label: 'Mana Flood' },
  { value: 'good', label: 'Good Hand' },
  { value: 'screw', label: 'Mana Screw' },
]

const MTGA_RANKS: { value: MtgaRank; label: string }[] = [
  { value: 'bronze', label: 'Bronze' },
  { value: 'silver', label: 'Silver' },
  { value: 'gold', label: 'Gold' },
  { value: 'platinum', label: 'Platinum' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'mythic', label: 'Mythic' },
]

interface GameLoggerProps {
  cards: CardEntry[]
  onSubmit: (gameData: NewGameEntry) => Promise<boolean>
}

function buildEmptyForm() {
  return {
    turn_ended: '',
    opponent_colors: [] as OpponentColor[],
    opponent_archetype: '' as OpponentArchetype | '',
    opening_hand_feel: '' as OpeningHandFeel | '',
    mtga_rank: '' as MtgaRank | '',
    cards_in_hand: [] as string[],
    tough_opponent_card: '',
    notes: '',
  }
}

/**
 * GameLogger — collapsible panel for logging a single game result.
 *
 * Progressive disclosure: Win/Loss buttons appear first; detail fields
 * expand only after result is selected.
 */
export default function GameLogger({ cards, onSubmit }: GameLoggerProps) {
  const { addToast } = useToastContext()
  const [isOpen, setIsOpen] = useState(false)
  const [result, setResult] = useState<GameResult | null>(null)
  const [form, setForm] = useState(buildEmptyForm)
  const [submitting, setSubmitting] = useState(false)

  const cardNames = cards.map((c) => c.name)

  function handleResultSelect(value: GameResult) {
    setResult(value)
  }

  function toggleColor(color: OpponentColor) {
    setForm((prev) => ({
      ...prev,
      opponent_colors: prev.opponent_colors.includes(color)
        ? prev.opponent_colors.filter((c) => c !== color)
        : [...prev.opponent_colors, color],
    }))
  }

  function toggleCardInHand(name: string) {
    setForm((prev) => {
      const already = prev.cards_in_hand.includes(name)
      if (!already && prev.cards_in_hand.length >= 7) return prev
      return {
        ...prev,
        cards_in_hand: already
          ? prev.cards_in_hand.filter((c) => c !== name)
          : [...prev.cards_in_hand, name],
      }
    })
  }

  function reset() {
    setResult(null)
    setForm(buildEmptyForm())
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!result) return

    const gameData: NewGameEntry = {
      result,
      turn_ended: form.turn_ended ? parseInt(form.turn_ended, 10) : null,
      opponent_colors: form.opponent_colors,
      opponent_archetype: form.opponent_archetype || null,
      opening_hand_feel: form.opening_hand_feel || null,
      mtga_rank: form.mtga_rank || null,
      cards_in_hand: form.cards_in_hand,
      tough_opponent_card: form.tough_opponent_card,
      notes: form.notes,
    }

    setSubmitting(true)
    const success = await onSubmit(gameData)
    setSubmitting(false)

    if (success) {
      addToast('Game logged')
      reset()
    }
  }

  return (
    <section data-testid="game-logger-section">
      {/* ── Toggle header ── */}
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm font-semibold text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        aria-expanded={isOpen}
        data-testid="game-logger-toggle"
      >
        <span>Log a Game</span>
        <span aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div
          className="mt-3 rounded-lg border border-gray-200 bg-white p-5"
          data-testid="game-logger-panel"
        >
          <form onSubmit={handleSubmit} noValidate>
            {/* ── Win / Loss ── */}
            <div className="mb-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Result <span className="text-red-500">*</span>
              </p>
              <div className="flex gap-3" role="group" aria-label="Game result">
                <button
                  type="button"
                  onClick={() => handleResultSelect('win')}
                  aria-pressed={result === 'win'}
                  data-testid="result-win"
                  className={`flex-1 rounded-lg border-2 py-3 text-base font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    result === 'win'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-green-300 hover:text-green-600'
                  }`}
                >
                  Win
                </button>
                <button
                  type="button"
                  onClick={() => handleResultSelect('loss')}
                  aria-pressed={result === 'loss'}
                  data-testid="result-loss"
                  className={`flex-1 rounded-lg border-2 py-3 text-base font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    result === 'loss'
                      ? 'border-red-400 bg-red-50 text-red-700'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-red-300 hover:text-red-600'
                  }`}
                >
                  Loss
                </button>
              </div>
            </div>

            {/* ── Detail fields (progressive disclosure) ── */}
            {result && (
              <div className="space-y-5" data-testid="game-logger-details">
                {/* Turn / Colors / Archetype / Hand Feel — single row */}
                <div className="flex flex-wrap items-end gap-4 [&>*]:flex-1">
                  {/* Turn Ended */}
                  <div className="flex flex-col items-center">
                    <label
                      htmlFor="turn-ended"
                      className="mb-1 block text-center text-sm font-medium text-gray-700"
                    >
                      Game ended on turn
                    </label>
                    <input
                      id="turn-ended"
                      type="number"
                      min={1}
                      max={20}
                      value={form.turn_ended}
                      onChange={(e) => setForm((p) => ({ ...p, turn_ended: e.target.value }))}
                      placeholder="—"
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      data-testid="turn-ended-input"
                    />
                  </div>

                  {/* Opponent Colors */}
                  <div className="flex flex-col items-center">
                    <p className="mb-1 text-center text-sm font-medium text-gray-700">Opponent colors</p>
                    <div className="flex justify-center gap-1.5" role="group" aria-label="Opponent colors">
                      {COLOR_LABELS.map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => toggleColor(value)}
                          aria-pressed={form.opponent_colors.includes(value)}
                          data-testid={`color-${value}`}
                          className={`h-9 w-9 rounded-full border-2 text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                            form.opponent_colors.includes(value)
                              ? COLOR_STYLES[value].selected
                              : `${COLOR_STYLES[value].base} ${COLOR_STYLES[value].hover}`
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Opponent Archetype */}
                  <div className="flex flex-col items-center">
                    <label
                      htmlFor="opponent-archetype"
                      className="mb-1 block text-center text-sm font-medium text-gray-700"
                    >
                      Opponent archetype
                    </label>
                    <select
                      id="opponent-archetype"
                      value={form.opponent_archetype}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          opponent_archetype: e.target.value as OpponentArchetype | '',
                        }))
                      }
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      data-testid="archetype-select"
                    >
                      <option value="">— select —</option>
                      {ARCHETYPES.map(({ value, label }) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Opening Hand Feel */}
                  <div className="flex flex-col items-center">
                    <label
                      htmlFor="opening-hand-feel"
                      className="mb-1 block text-center text-sm font-medium text-gray-700"
                    >
                      Opening hand feel
                    </label>
                    <select
                      id="opening-hand-feel"
                      value={form.opening_hand_feel}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          opening_hand_feel: e.target.value as OpeningHandFeel | '',
                        }))
                      }
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      data-testid="opening-hand-feel-select"
                    >
                      <option value="">— select —</option>
                      {HAND_FEELS.map(({ value, label }) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* MTGA Rank */}
                  <div className="flex flex-col items-center">
                    <label
                      htmlFor="mtga-rank"
                      className="mb-1 block text-center text-sm font-medium text-gray-700"
                    >
                      MTGA rank
                    </label>
                    <select
                      id="mtga-rank"
                      value={form.mtga_rank}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          mtga_rank: e.target.value as MtgaRank | '',
                        }))
                      }
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      data-testid="mtga-rank-select"
                    >
                      <option value="">— select —</option>
                      {MTGA_RANKS.map(({ value, label }) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Cards in Hand */}
                {cardNames.length > 0 && (
                  <div>
                    <p className="mb-1 text-sm font-medium text-gray-700">
                      Key cards in opening hand
                      <span className="ml-1 text-xs font-normal text-gray-400">
                        (up to 7)
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-1.5" data-testid="cards-in-hand">
                      {cardNames.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => toggleCardInHand(name)}
                          aria-pressed={form.cards_in_hand.includes(name)}
                          disabled={
                            !form.cards_in_hand.includes(name) && form.cards_in_hand.length >= 7
                          }
                          className={`rounded border px-2 py-1 text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 ${
                            form.cards_in_hand.includes(name)
                              ? 'border-indigo-500 bg-indigo-100 text-indigo-700'
                              : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tough Opponent Card */}
                <div>
                  <label
                    htmlFor="tough-card"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Opponent card that caused problems
                  </label>
                  <input
                    id="tough-card"
                    type="text"
                    value={form.tough_opponent_card}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, tough_opponent_card: e.target.value }))
                    }
                    placeholder="Card name (optional)"
                    className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    data-testid="tough-card-input"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label
                    htmlFor="game-notes"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Notes
                  </label>
                  <textarea
                    id="game-notes"
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="How did the game go? (optional)"
                    rows={3}
                    className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    data-testid="game-notes-input"
                  />
                </div>
              </div>
            )}

            {/* ── Submit ── */}
            <div className="mt-5">
              <button
                type="submit"
                disabled={!result || submitting}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="log-game-submit"
              >
                {submitting ? 'Logging…' : 'Log Game'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
