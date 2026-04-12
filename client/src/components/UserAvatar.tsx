import { useAuth } from '../context/AuthContext'

/**
 * Shows the signed-in user's photo when available; falls back to a circle
 * with their initial (or a generic icon if neither is available).
 */
export default function UserAvatar() {
  const { user } = useAuth()
  if (!user) return null

  const initial = user.displayName?.[0] ?? user.email?.[0] ?? '?'

  if (user.photoURL) {
    return (
      <img
        src={user.photoURL}
        alt={user.displayName ?? user.email ?? 'User avatar'}
        referrerPolicy="no-referrer"
        className="h-8 w-8 rounded-full object-cover ring-2 ring-indigo-300"
      />
    )
  }

  return (
    <div
      aria-label={user.displayName ?? user.email ?? 'User avatar'}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold uppercase text-white ring-2 ring-indigo-300 select-none"
    >
      {initial}
    </div>
  )
}
