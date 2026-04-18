import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import client from '../api/client'
import { useDecks } from '../hooks/useDecks'
import { useGames } from '../hooks/useGames'
import { useToastContext } from '../context/ToastContext'
import CardRow from '../components/CardRow'
import CardGridView from '../components/CardGridView'
import CardCompactView from '../components/CardCompactView'
import CardDetailModal from '../components/CardDetailModal'
import CardSearch from '../components/CardSearch'
import GameLogger from '../components/GameLogger'
import GameLogList from '../components/GameLogList'
import Spinner from '../components/Spinner'
import FormatSelect from '../components/FormatSelect'
import UserAvatar from '../components/UserAvatar'
import { auth } from '../firebase'
import DeckHistory from '../components/DeckHistory'
import { formatDate } from '../utils'
import type { CardEntry, NewGameEntry, ScryfallCard, Deck, DeckSnapshot } from '../types'

type ViewMode = 'grid' | 'compact' | 'list'

type LoadState = 'loading' | 'ready' | 'error'
type ExportStatus = 'idle' | 'copied' | 'error'
type TabView = 'current' | 'history'

const SNAPSHOT_WINDOW_MS = 3 * 60 * 1000 // 3 minutes

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
 *  - All edits auto-save via updateDeck, debounced 2 seconds
 *    (accumulated patch so rapid changes never lose data)
 *  - Pending saves are flushed synchronously on unmount so navigating away
 *    never discards unsaved changes
 */
function DeckEditor() {
  const { id } = useParams<{ id: string }>()
  const { getDeck, updateDeck } = useDecks()
  const { addToast } = useToastContext()
  const { games, addGame } = useGames(id)

  // ── Loading state ─────────────────────────────────────────────────────────
  const [loadState, setLoadState] = useState<LoadState>('loading')

  // ── Editable fields ───────────────────────────────────────────────────────
  const [isEditingName, setIsEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [format, setFormat] = useState('')
  const [mainboard, setMainboard] = useState<CardEntry[]>([])
  const [sideboard, setSideboard] = useState<CardEntry[]>([])

  /** Snapshot used to restore name on Escape key. */
  const savedNameRef = useRef('')

  // ── UI state ──────────────────────────────────────────────────────────────
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [detailCard, setDetailCard] = useState<CardEntry | null>(null)

  // ── Auto-save debounce ────────────────────────────────────────────────────
  /** Accumulates all unsaved changes; flushed together when the timer fires. */
  const pendingRef = useRef<DeckPatch>({})
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Tab state ────────────────────────────────────────────────────────────────
  const [tabView, setTabView] = useState<TabView>('current')

  // ── Active snapshot ───────────────────────────────────────────────────────────
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null)

  // ── Notes ref (notes not editable in UI, stored from deck load) ───────────────
  const notesRef = useRef('')

  // ── Snapshot timer ────────────────────────────────────────────────────────────
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snapshotPendingRef = useRef(false)
  /** Tracks the snapshot ID the user last restored to, so new edits can prune future history. */
  const revertedToSnapshotIdRef = useRef<string | null>(null)

  /** Mirrors current deck state into a ref for snapshot timer and beforeunload. */
  const snapshotDataRef = useRef<{
    cards: CardEntry[]
    sideboard: CardEntry[]
    format: string
    notes: string
  }>({ cards: [], sideboard: [], format: '', notes: '' })

  /** Cached Firebase ID token for the beforeunload best-effort flush. */
  const tokenRef = useRef<string | null>(null)

  /**
   * Keep a stable ref to `updateDeck` so the unmount cleanup can call the
   * latest version without needing it as a dep (which would cause the effect
   * to re-register and clear `pendingRef` on every render).
   */
  const updateDeckRef = useRef(updateDeck)
  useEffect(() => {
    updateDeckRef.current = updateDeck
  })

  // Keep a cached copy of the Firebase ID token for the beforeunload handler.
  // onIdTokenChanged fires on sign-in and on every token refresh (~hourly).
  useEffect(() => {
    return auth.onIdTokenChanged(async (user) => {
      tokenRef.current = user ? await user.getIdToken() : null
    })
  }, [])

  const scheduleAutoSave = useCallback(
    (patch: DeckPatch) => {
      pendingRef.current = { ...pendingRef.current, ...patch }
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const snapshot = { ...pendingRef.current }
        pendingRef.current = {}
        updateDeck(id!, snapshot)
      }, 2000)
    },
    [id, updateDeck],
  )

  // Keep snapshotDataRef in sync with the latest state so the timer always
  // fires with up-to-date data even if state changed after the timer was set.
  useEffect(() => {
    snapshotDataRef.current = {
      cards: mainboard,
      sideboard,
      format,
      notes: notesRef.current,
    }
  }, [mainboard, sideboard, format])

  /** Resets the 3-minute inactivity timer that commits a snapshot. */
  const scheduleSnapshot = useCallback(() => {
    snapshotPendingRef.current = true
    if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current)
    snapshotTimerRef.current = setTimeout(async () => {
      snapshotPendingRef.current = false
      if (!id) return
      if (revertedToSnapshotIdRef.current) {
        try {
          await client.delete(`/api/decks/${id}/snapshots/after/${revertedToSnapshotIdRef.current}`)
        } catch (pruneErr) {
          console.error('Timeline prune failed silently:', pruneErr)
        }
        revertedToSnapshotIdRef.current = null
      }
      try {
        await client.post(`/api/decks/${id}/snapshots`, snapshotDataRef.current)
      } catch (err) {
        console.error('Snapshot failed silently:', err)
      }
    }, SNAPSHOT_WINDOW_MS)
  }, [id])

  // On unmount (navigation), flush any pending debounced save immediately so
  // no changes are silently discarded when the user navigates away.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      const snapshot = { ...pendingRef.current }
      if (Object.keys(snapshot).length > 0 && id) {
        pendingRef.current = {}
        updateDeckRef.current(id, snapshot)
      }
    },
    // `id` is the only reactive value that should trigger re-registration.
    // `updateDeckRef` is a ref — intentionally not listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  )

  // Best-effort snapshot on page unload using fetch keepalive.
  // Failures are silently ignored.
  useEffect(() => {
    function handleBeforeUnload() {
      if (!snapshotPendingRef.current || !id || !tokenRef.current) return
      snapshotPendingRef.current = false
      if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current)
      fetch(`/api/decks/${id}/snapshots`, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify(snapshotDataRef.current),
      })
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [id])

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
      setMainboard(deck.cards ?? [])
      setSideboard(deck.sideboard ?? [])
      notesRef.current = deck.notes ?? ''
      setActiveSnapshotId(deck.activeSnapshotId ?? null)
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
    scheduleSnapshot()
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
    scheduleSnapshot()
  }

  // ── Mainboard handlers ────────────────────────────────────────────────────

  function handleMainQuantityChange(cardName: string, newQty: number) {
    const updated = mainboard.map((c) =>
      c.name === cardName ? { ...c, quantity: newQty } : c,
    )
    setMainboard(updated)
    scheduleAutoSave({ cards: updated })
    scheduleSnapshot()
  }

  function handleMainRemove(cardName: string) {
    const updated = mainboard.filter((c) => c.name !== cardName)
    setMainboard(updated)
    scheduleAutoSave({ cards: updated })
    scheduleSnapshot()
  }

  // ── Sideboard handlers ────────────────────────────────────────────────────

  function handleSideQuantityChange(cardName: string, newQty: number) {
    const updated = sideboard.map((c) =>
      c.name === cardName ? { ...c, quantity: newQty } : c,
    )
    setSideboard(updated)
    scheduleAutoSave({ sideboard: updated })
    scheduleSnapshot()
  }

  function handleSideRemove(cardName: string) {
    const updated = sideboard.filter((c) => c.name !== cardName)
    setSideboard(updated)
    scheduleAutoSave({ sideboard: updated })
    scheduleSnapshot()
  }

  // ── Add card from CardSearch ───────────────────────────────────────────────
  // Bug fix: copy mana_cost and type_line from the Scryfall result so CardRow
  // can render them immediately and they persist to the server.

  function handleAddCard(card: ScryfallCard, section: string) {
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
              image_uris: card.image_uris,
            },
          ]
      setMainboard(updated)
      scheduleAutoSave({ cards: updated })
      scheduleSnapshot()
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
              image_uris: card.image_uris,
            },
          ]
      setSideboard(updated)
      scheduleAutoSave({ sideboard: updated })
      scheduleSnapshot()
    }
  }

  // ── Log game ─────────────────────────────────────────────────────────────

  async function handleLogGame(gameData: NewGameEntry): Promise<boolean> {
    const entry = await addGame(gameData)
    return entry !== null
  }

  // ── Revert to snapshot ────────────────────────────────────────────────────────

  function handleRevert(deck: Deck, snapshot: DeckSnapshot) {
    // Cancel any pending auto-save so pre-revert edits don't overwrite the revert
    if (debounceRef.current) clearTimeout(debounceRef.current)
    pendingRef.current = {}
    // Cancel any pending snapshot from the pre-revert session
    if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current)
    snapshotPendingRef.current = false
    // Remember where we restored to so the next snapshot creation can prune future history
    revertedToSnapshotIdRef.current = snapshot.id

    setNameValue(deck.name ?? '')
    savedNameRef.current = deck.name ?? ''
    setFormat(deck.format ?? '')
    setMainboard(deck.cards ?? [])
    setSideboard(deck.sideboard ?? [])
    notesRef.current = deck.notes ?? ''
    setActiveSnapshotId(deck.activeSnapshotId ?? null)
    setTabView('current')
    addToast(`Restored to ${formatDate(snapshot.createdAt)}`)
  }

  // ── Export to clipboard ───────────────────────────────────────────────────

  async function handleExport() {
    try {
      // Primary: use the server-side export endpoint for consistent formatting.
      const { data } = await client.post<{ text?: string }>(`/api/decks/${id}/export`)
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
        addToast('Failed to copy deck to clipboard.')
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
            <FormatSelect
              id="deck-format"
              value={format}
              onChange={handleFormatChange}
              className="rounded-lg border border-gray-300 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              data-testid="deck-format-select"
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View mode toggle */}
          <div
            className="flex rounded-lg border border-gray-300 bg-white overflow-hidden"
            role="group"
            aria-label="Card view mode"
            data-testid="view-mode-toggle"
          >
            {(
              [
                { mode: 'grid', label: 'Grid', icon: '⊞' },
                { mode: 'compact', label: 'Compact', icon: '≡' },
                { mode: 'list', label: 'List', icon: '☰' },
              ] as { mode: ViewMode; label: string; icon: string }[]
            ).map(({ mode, label, icon }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                aria-pressed={viewMode === mode}
                title={label}
                className={`px-3 py-1.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset ${
                  viewMode === mode
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                data-testid={`view-mode-${mode}`}
              >
                {icon}
              </button>
            ))}
          </div>

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

          <UserAvatar />
        </div>
      </header>

      {/* ── Tab navigation ── */}
      <div className="mb-6 flex border-b border-gray-200" role="tablist">
        {(['current', 'history'] as TabView[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={tabView === tab}
            onClick={() => setTabView(tab)}
            className={`px-4 py-2 text-sm font-medium focus:outline-none ${
              tabView === tab
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            data-testid={`tab-${tab}`}
          >
            {tab === 'current' ? 'Current Deck' : 'Deck History'}
          </button>
        ))}
      </div>

      {tabView === 'current' ? (
        <>
          {/* ── Game Log ── */}
          <section className="mb-8" data-testid="game-logger-wrapper">
            <h2 className="mb-3 text-lg font-semibold text-gray-900">Game Log</h2>
            <div className="mb-4">
              <GameLogList games={games} />
            </div>
            <GameLogger cards={mainboard} onSubmit={handleLogGame} />
          </section>

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
            ) : viewMode === 'grid' ? (
              <CardGridView
                cards={mainboard}
                onQuantityChange={handleMainQuantityChange}
                onRemove={handleMainRemove}
                onCardClick={setDetailCard}
              />
            ) : viewMode === 'compact' ? (
              <CardCompactView
                cards={mainboard}
                onQuantityChange={handleMainQuantityChange}
                onRemove={handleMainRemove}
                onCardClick={setDetailCard}
              />
            ) : (
              <div className="space-y-1">
                {mainboard.map((card) => (
                  <CardRow
                    key={card.scryfall_id ?? card.name}
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
            ) : viewMode === 'grid' ? (
              <CardGridView
                cards={sideboard}
                onQuantityChange={handleSideQuantityChange}
                onRemove={handleSideRemove}
                onCardClick={setDetailCard}
              />
            ) : viewMode === 'compact' ? (
              <CardCompactView
                cards={sideboard}
                onQuantityChange={handleSideQuantityChange}
                onRemove={handleSideRemove}
                onCardClick={setDetailCard}
              />
            ) : (
              <div className="space-y-1">
                {sideboard.map((card) => (
                  <CardRow
                    key={card.scryfall_id ?? card.name}
                    card={card}
                    quantity={card.quantity}
                    onQuantityChange={(qty) => handleSideQuantityChange(card.name, qty)}
                    onRemove={() => handleSideRemove(card.name)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <DeckHistory
          deckId={id!}
          games={games}
          activeSnapshotId={activeSnapshotId}
          onRevert={handleRevert}
        />
      )}


      {/* ── CardSearch panel ── */}
      <CardSearch
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        sectionNames={['mainboard', 'sideboard']}
        onAddToSection={handleAddCard}
      />

      {/* ── Card detail modal ── */}
      {detailCard && (
        <CardDetailModal
          scryfallId={detailCard.scryfall_id ?? undefined}
          name={detailCard.name}
          onClose={() => setDetailCard(null)}
          deckControls={{
            quantity: detailCard.quantity,
            onQuantityChange: (qty) => {
              const isMain = mainboard.some((c) => c.name === detailCard.name)
              if (isMain) {
                handleMainQuantityChange(detailCard.name, qty)
              } else {
                handleSideQuantityChange(detailCard.name, qty)
              }
              setDetailCard((prev) => prev ? { ...prev, quantity: qty } : null)
            },
            onRemove: () => {
              const isMain = mainboard.some((c) => c.name === detailCard.name)
              if (isMain) handleMainRemove(detailCard.name)
              else handleSideRemove(detailCard.name)
              setDetailCard(null)
            },
          }}
        />
      )}
    </main>
  )
}

export default DeckEditor