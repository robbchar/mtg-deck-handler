export const FORMATS = ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'commander', 'draft']

/**
 * Controlled <select> populated with the canonical MTG format list.
 * All native select props (id, value, onChange, className, data-testid, etc.)
 * are forwarded directly to the underlying element.
 */
function FormatSelect(props: React.ComponentPropsWithoutRef<'select'>) {
  return (
    <select {...props}>
      <option value="">— none —</option>
      {FORMATS.map((f) => (
        <option key={f} value={f}>
          {f.charAt(0).toUpperCase() + f.slice(1)}
        </option>
      ))}
    </select>
  )
}

export default FormatSelect
