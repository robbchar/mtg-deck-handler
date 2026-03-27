
/**
 * Formats an ISO 8601 date string into a human-readable short date.
 *
 * @param {string | null | undefined} isoString
 * @returns {string}
 */
export function formatDate(isoString) {
  if (!isoString) return '—'
  try {
    return new Date(isoString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return '—'
  }
}