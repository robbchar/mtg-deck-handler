import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import { useDecks } from '../hooks/useDecks'
import CardRow from '../components/CardRow'
import CardSearch from '../components/CardSearch'
import ImportModal from '../components/ImportModal'
import Spinner from '../components/Spinner'
import type { CardEntry, ScryfallCard } from '../types'

/** Ordered list of supported format values for the dropdown. */
const FORMATS = ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'commander', 'draft']

type LoadState = 'loading' | 'ready' | 'error'
type ExportStatus = 'idle' | 'copied' | 'error'

interface DeckPatch {
  name?: string
  format?: string
  notes?: string
  cards?: CardEntry[]
  sideboard?: CardEntry[]
}

/**
 * Converts local deck state to MTGA plain-text for the client-side fallback.
 */
function buildMtgaText(cards: CardEntry[], sideboard: CardEntry[]): string {
  const mainLines = cards.filter((c) => c.quantity > 0).map((c) => `${c.quantity} ${c.name}`)
  const sideLines = sideboard.filter((c) => c.quantity > 0).map((c) => `${c.quantity} ${c.name}`)
  if (!mainLines.length && !sideLines.length) return ''
  if (!sideLines.length) return mainLines.join('\n')
  if (!mainLines.length) return sideLines.join('\n')
  return [...mainLines, '', ...sideLines].join('\n')
}

/**
 * DeckEditor page — full inline deck editing.
 *
 * Features:
 *  - Load deck on mount via useDecks().getDeck(id)
 *  - Inline name editing (click to edit, blur/Enter to save)
 *  - Format dropdown (standard → draft)
 *  - Mainboard + sideboard card lists via CardRow
 *  - Notes textarea — saves on blur
 *  - "Add Card" opens CardSearch slide-in panel
 *  - "Export" copies MTGA-format text to clipboard
 *  - "Import" opens ImportModal
 *  - All edits auto-save via updateDeck, debounced 1 second
 *    (accumulated patch so rapid changes never lose data)
 */
function DeckEditor() {
  const { id } = useParams<{ id: string }>()
  const { getDeck, updateDeck } = useDecks()

  // ── Loading state ─────────────────────────────────────────────────────────
  const [loadState, setLoadState] = useState<LoadState>('loading')

  // ── Editable fields ───────────────────────────────────────────────────────
  const [isEditingName, setIsEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [format, setFormat] = useState('')
  const [notes, setNotes] = useState('')
  const [mainboard, setMainboard] = useState<CardEntry[]>([])
  const [sideboard, setSideboard] = useState<CardEntry[]>([])

  /** Snapshot used to restore name on Escape key. */
  const savedNameRef = useRef('')

  // ── UI state ──────────────────────────────────────────────────────────────
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle')

  // ── Auto-save debounce ────────────────────────────────────────────────────
  /** Accumulates all unsaved changes; flushed together when the timer fires. */
  const pendingRef = useRef<DeckPatch>({})
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleAutoSave = useCallback(
    (patch: DeckPatch) => {
      pendingRef.current = { ...pendingRef.current, ...patch }
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const snapshot = { ...pendingRef.current }
        pendingRef.current = {}
        updateDeck(id!, snapshot)
      }, 1000)
    },
    [id, updateDeck],
  )

  // Clean up the timer when the component unmounts.
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  // ── Load deck on mount ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoadState('loading')
      const deck = await getDeck(id!)
      if (cancelled) return
      if (!deck) {
        setLoadState('error')
        return
      }
      setNameValue(deck.name ?? '')
      savedNameRef.current = deck.name ?? ''
      setFormat(deck.format ?? '')
      setNotes(deck.notes ?? '')
      setMainboard(deck.cards ?? [])
      setSideboard(deck.sideboard ?? [])
      setLoadState('ready')
    }

    load()
    return () => {
      cancelled = true
    }
    // getDeck is intentionally omitted: it changes identity when `decks` list
    // changes (useCallback dep), which would cause infinite re-fetches.
    // The deck is identified by `id` alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ── Name editing handlers ─────────────────────────────────────────────────

  function commitNameEdit() {
    setIsEditingName(false)
    savedNameRef.current = nameValue
    scheduleAutoSave({ name: nameValue })
  }

  function handleNameBlur() {
    commitNameEdit()
  }

  function handleNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      commitNameEdit()
    } else if (e.key === 'Escape') {
      setNameValue(savedNameRef.current)
      setIsEditingName(false)
    }
  }

  // ── Format handler ────────────────────────────────────────────────────────

  function handleFormatChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    setFormat(val)
    scheduleAutoSave({ format: val })
  }

  // ── Notes handler ─────────────────────────────────────────────────────────

  function handleNotesBlur() {
    scheduleAutoSave({ notes })
  }

  // ── Mainboard handlers ────────────────────────────────────────────────────

  function handleMainQuantityChange(cardName: string, newQty: number) {
    const updated = mainboard.map((c) =>
      c.name === cardName ? { ...c, quantity: newQty } : c,
    )
    setMainboard(updated)
    scheduleAutoSave({ cards: updated })
  }

  function handleMainRemove(cardName: string) {
    const updated = mainboard.filter((c) => c.name !== cardName)
    setMainboard(updated)
    scheduleAutoSave({ cards: updated })
  }

  // ── Sideboard handlers ────────────────────────────────────────────────────

  function handleSideQuantityChange(cardName: string, newQty: number) {
    const updated = sideboard.map((c) =>
      c.name === cardName ? { ...c, quantity: newQty } : c,
    )
    setSideboard(updated)
    scheduleAutoSave({ sideboard: updated })
  }

  function handleSideRemove(cardName: string) {
    const updated = sideboard.filter((c) => c.name !== cardName)
    setSideboard(updated)
    scheduleAutoSave({ sideboard: updated })
  }

  // ── Add card from CardSearch ───────────────────────────────────────────────
  // Bug fix: copy mana_cost and type_line from the Scryfall result so CardRow
  // can render them immediately and they persist to the server.

  function handleAddCard(card: ScryfallCard, section: 'mainboard' | 'sideboard') {
    if (section === 'mainboard') {
      const existing = mainboard.find((c) => c.name === card.name)
      const updated: CardEntry[] = existing
        ? mainboard.map((c) =>
            c.name === card.name ? { ...c, quantity: c.quantity + 1 } : c,
          )
        : [
            ...mainboard,
            {
              name: card.name,
              quantity: 1,
              scryfall_id: card.id ?? null,
              section: 'mainboard',
              mana_cost: card.mana_cost,
              type_line: card.type_line,
            },
          ]
      setMainboard(updated)
      scheduleAutoSave({ cards: updated })
    } else {
      const existing = sideboard.find((c) => c.name === card.name)
      const updated: CardEntry[] = existing
        ? sideboard.map((c) =>
            c.name === card.name ? { ...c, quantity: c.quantity + 1 } : c,
          )
        : [
            ...sideboard,
            {
              name: card.name,
              quantity: 1,
              scryfall_id: card.id ?? null,
              section: 'sideboard',
              mana_cost: card.mana_cost,
              type_line: card.type_line,
            },
          ]
      setSideboard(updated)
      scheduleAutoSave({ sideboard: updated })
    }
  }

  // ── Export to clipboard ───────────────────────────────────────────────────

  async function handleExport() {
    try {
      // Primary: use the server-side export endpoint for consistent formatting.
      const { data } = await axios.post<{ text?: string }>(`/api/decks/${id}/export`)
      await navigator.clipboard.writeText(data.text ?? buildMtgaText(mainboard, sideboard))
      setExportStatus('copied')
      setTimeout(() => setExportStatus('idle'), 2000)
    } catch {
      // Fallback: build text client-side using the mtgaFormat utility logic
      try {
        await navigator.clipboard.writeText(buildMtgaText(mainboard, sideboard))
        setExportStatus('copied')
        setTimeout(() => setExportStatus('idle'), 2000)
      } catch {
        setExportStatus('error')
        setTimeout(() => setExportStatus('idle'), 2000)
      }
    }
  }

  // ── Computed totals ───────────────────────────────────────────────────────

  const mainTotal = mainboard.reduce((sum, c) => sum + (c.quantity ?? 0), 0)
  const sideTotal = sideboard.reduce((sum, c) => sum + (c.quantity ?? 0), 0)

  // ── Render: loading ───────────────────────────────────────────────────────

  if (loadState === 'loading') {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div
          className="flex items-center justify-center py-20"
          data-testid="deck-editor-loading"
        >
          <Spinner className="h-8 w-8" />
          <span className="sr-only">Loading deck…</span>
        </div>
      </main>
    )
  }

  // ── Render: error ─────────────────────────────────────────────────────────

  if (loadState === 'error') {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <nav className="mb-6">
          <Link to="/" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
            ← Back to decks
          </Link>
        </nav>
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          data-testid="deck-editor-error"
        >
          Deck not found or could not be loaded.
        </div>
      </main>
    )
  }

  // ── Render: ready ─────────────────────────────────────────────────────────

  return (
    <main className="mx-auto max-w-5xl px-4 py-10" data-testid="deck-editor">
      {/* ── Back nav ── */}
      <nav className="mb-6">
        <Link to="/" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
          ← Back to decks
        </Link>
      </nav>

      {/* ── Deck header: name + format + actions ── */}
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          {/* Inline name editing */}
          {isEditingName ? (
            <input
              type="text"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={handleNameKeyDown}
              autoFocus
              className="w-full rounded-lg border border-indigo-400 px-3 py-1 text-2xl font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Deck name"
              data-testid="deck-name-input"
            />
          ) : (
            <h1
              onClick={() => setIsEditingName(true)}
              className="cursor-pointer rounded px-1 text-3xl font-bold tracking-tight text-gray-900 hover:bg-gray-100"
              title="Click to edit"
              data-testid="deck-name-heading"
            >
              {nameValue || 'Untitled Deck'}
            </h1>
          )}

          {/* Format selector */}
          <div className="mt-3">
            <label htmlFor="deck-format" className="mr-2 text-sm font-medium text-gray-600">
              Format:
            </label>
            <select
              id="deck-format"
              value={format}
              onChange={handleFormatChange}
              className="rounded-lg border border-gray-300 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              data-testid="deck-format-select"
            >
              <option value="">— none —</option>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            data-testid="add-card-btn"
          >
            + Add Card
          </button>

          <button
            type="button"
            onClick={handleExport}
            className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              exportStatus === 'copied'
                ? 'border-green-300 bg-green-50 text-green-700'
                : exportStatus === 'error'
                ? 'border-red-300 bg-red-50 text-red-700'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
            data-testid="export-btn"
          >
            {exportStatus === 'copied'
              ? '✓ Copied!'
              : exportStatus === 'error'
              ? 'Copy failed'
              : 'Export'}
          </button>

          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            data-testid="import-btn"
          >
            Import
          </button>
        </div>
      </header>

      {/* ── Mainboard ── */}
      <section className="mb-8" data-testid="mainboard-section">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
          Mainboard
          <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
            {mainTotal}
          </span>
        </h2>

        {mainboard.length === 0 ? (
          <p className="text-sm text-gray-400" data-testid="mainboard-empty">
            No mainboard cards yet. Use + Add Card to get started.
          </p>
        ) : (
          <div className="space-y-1">
            {mainboard.map((card) => (
              <CardRow
                key={card.name}
                card={card}
                quantity={card.quantity}
                onQuantityChange={(qty) => handleMainQuantityChange(card.name, qty)}
                onRemove={() => handleMainRemove(card.name)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Sideboard ── */}
      <section className="mb-8" data-testid="sideboard-section">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
          Sideboard
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            {sideTotal}
          </span>
        </h2>

        {sideboard.length === 0 ? (
          <p className="text-sm text-gray-400" data-testid="sideboard-empty">
            No sideboard cards yet.
          </p>
        ) : (
          <div className="space-y-1">
            {sideboard.map((card) => (
              <CardRow
                key={card.name}
                card={card}
                quantity={card.quantity}
                onQuantityChange={(qty) => handleSideQuantityChange(card.name, qty)}
                onRemove={() => handleSideRemove(card.name)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Notes ── */}
      <section className="mb-8" data-testid="notes-section">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Notes</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={handleNotesBlur}
          placeholder="Strategy notes, sideboard guide, card explanations…"
          rows={5}
          className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          data-testid="notes-textarea"
        />
      </section>

      {/* ── CardSearch panel ── */}
      <CardSearch
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onAddCard={handleAddCard}
      />

      {/* ── ImportModal ── */}
      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      />
    </main>
  )
}

export default DeckEditor
