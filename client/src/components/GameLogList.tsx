import type { GameEntry } from '../types'

function trend(games: GameEntry[]): { label: string; className: string } | null {
  if (games.length === 0) return null
  const window = games.slice(0, 10)
  const winRate = window.filter((g) => g.result === 'win').length / window.length
  if (winRate > 0.5) return { label: '↑ Hot', className: 'text-green-600' }
  if (winRate < 0.5) return { label: '↓ Cold', className: 'text-red-500' }
  return { label: '→ Even', className: 'text-gray-500' }
}

interface GameLogListProps {
  games: GameEntry[]
}

/**
 * GameLogSummary — shows overall W/L record, last 5 results as dots,
 * and a trend indicator (last 5 vs previous 5 win rate).
 */
export default function GameLogList({ games }: GameLogListProps) {
  if (games.length === 0) {
    return (
      <p className="py-2 text-sm text-gray-400" data-testid="game-log-empty">
        No games logged yet.
      </p>
    )
  }

  const wins = games.filter((g) => g.result === 'win').length
  const losses = games.length - wins
  const last5 = games.slice(0, 5).reverse() // chronological order left→right
  const trendResult = trend(games)

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2" data-testid="game-log-summary">
      {/* Overall record */}
      <span className="text-sm font-medium text-gray-700" data-testid="game-log-record">
        <span className="text-green-600">{wins}W</span>
        {' / '}
        <span className="text-red-500">{losses}L</span>
      </span>

      {/* Last 5 dots */}
      <span className="flex items-center gap-1" data-testid="game-log-last5">
        <span className="mr-1 text-xs text-gray-400">Last {last5.length}:</span>
        {last5.map((g) => (
          <span
            key={g.id}
            title={g.result}
            className={`inline-block h-3 w-3 rounded-full ${
              g.result === 'win' ? 'bg-green-500' : 'bg-red-400'
            }`}
            data-testid="game-dot"
          />
        ))}
      </span>

      {/* Trend */}
      {trendResult && (
        <span
          className={`text-sm font-semibold ${trendResult.className}`}
          data-testid="game-log-trend"
        >
          {trendResult.label}
        </span>
      )}
    </div>
  )
}
