import type { GameEntry, OpponentColor } from '../types'

const COLOR_CLASSES: Record<OpponentColor, string> = {
  W: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  U: 'bg-blue-50 text-blue-700 border-blue-200',
  B: 'bg-gray-800 text-gray-100 border-gray-600',
  R: 'bg-red-50 text-red-700 border-red-200',
  G: 'bg-green-50 text-green-700 border-green-200',
}

function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  const diffMo = Math.floor(diffDay / 30)
  if (diffMo < 12) return `${diffMo}mo ago`
  return `${Math.floor(diffMo / 12)}y ago`
}

interface GameLogListProps {
  games: GameEntry[]
}

/**
 * GameLogList — chronological list of past game entries (newest first).
 * Each row shows result badge, turn, opponent colors, archetype, timestamp.
 */
export default function GameLogList({ games }: GameLogListProps) {
  if (games.length === 0) {
    return (
      <p className="py-4 text-sm text-gray-400" data-testid="game-log-empty">
        No games logged yet.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-gray-100" data-testid="game-log-list">
      {games.map((game) => (
        <li
          key={game.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm"
          data-testid="game-log-row"
        >
          {/* Result badge */}
          <span
            className={`inline-flex min-w-[3rem] items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
              game.result === 'win'
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}
            data-testid="game-result-badge"
          >
            {game.result === 'win' ? 'Win' : 'Loss'}
          </span>

          {/* Turn */}
          {game.turn_ended != null && (
            <span className="text-gray-500" data-testid="game-turn">
              T{game.turn_ended}
            </span>
          )}

          {/* Opponent colors */}
          {game.opponent_colors.length > 0 && (
            <span className="flex gap-1" data-testid="game-colors">
              {game.opponent_colors.map((color) => (
                <span
                  key={color}
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${COLOR_CLASSES[color]}`}
                  aria-label={color}
                >
                  {color}
                </span>
              ))}
            </span>
          )}

          {/* Archetype */}
          {game.opponent_archetype && (
            <span className="capitalize text-gray-600" data-testid="game-archetype">
              {game.opponent_archetype}
            </span>
          )}

          {/* Timestamp */}
          <span className="ml-auto text-xs text-gray-400" data-testid="game-timestamp">
            {relativeTime(game.logged_at)}
          </span>
        </li>
      ))}
    </ul>
  )
}
