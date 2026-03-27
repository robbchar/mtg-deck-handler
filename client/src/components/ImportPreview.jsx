/**
 * ImportPreview — shows the parsed result of an MTGA deck text preview.
 *
 * Displays:
 *   - Total card count and per-section entry counts (summary row)
 *   - An empty-parse warning when no valid card lines were found
 *   - Any unparseable lines as amber warnings (they will be skipped on import)
 *
 * Unknown / unparseable lines are shown as warnings, not errors — they never
 * block the import flow.
 *
 * @param {{ preview: { mainboard: object[], sideboard: object[], unknownLines: string[] } }} props
 */
function ImportPreview({ preview }) {
  const totalCards = [...preview.mainboard, ...preview.sideboard].reduce(
    (sum, c) => sum + c.quantity,
    0,
  )
  const mainEntries = preview.mainboard.length
  const sideEntries = preview.sideboard.length
  const unknownLines = preview.unknownLines ?? []

  return (
    <div
      className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4"
      data-testid="import-preview"
    >
      {totalCards === 0 ? (
        <p className="text-sm text-amber-700" data-testid="import-preview-empty">
          No valid card lines were found. Check your deck list format.
        </p>
      ) : (
        <p className="text-sm font-medium text-gray-700" data-testid="import-preview-summary">
          {totalCards} card{totalCards !== 1 ? 's' : ''} parsed —{' '}
          {mainEntries} mainboard entr{mainEntries !== 1 ? 'ies' : 'y'}
          {sideEntries > 0
            ? `, ${sideEntries} sideboard entr${sideEntries !== 1 ? 'ies' : 'y'}`
            : ''}
        </p>
      )}

      {unknownLines.length > 0 && (
        <div data-testid="import-unknown-warning">
          <p className="mb-1 text-sm font-medium text-amber-700">
            {unknownLines.length} line{unknownLines.length !== 1 ? 's' : ''} could not be parsed
            (will be skipped on import):
          </p>
          <ul className="space-y-0.5">
            {unknownLines.map((line, idx) => (
              <li
                key={idx}
                className="rounded bg-amber-50 px-2 py-0.5 font-mono text-xs text-amber-800"
              >
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default ImportPreview