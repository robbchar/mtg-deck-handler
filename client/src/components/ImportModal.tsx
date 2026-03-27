import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { parseMtgaText } from '../utils/mtgaFormat'
import CloseButton from './CloseButton'
import FormatSelect from './FormatSelect'
import ImportPreview from './ImportPreview'
import type { ParsedDeck } from '../types'

interface ImportModalProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * ImportModal — paste MTGA deck text, preview the parsed result, then import.
 *
 * - "Preview" parses client-side (no network) and shows card count + unknown lines.
 * - "Import Deck" POSTs to /api/import and navigates to the editor on success.
 * - Closes on Escape, backdrop click, or the × button.
 * - All state resets when closed.
 *
 * Architecture note: preview is intentionally client-side (no dryRun API param)
 * because the POST /api/import spec does not define a dry-run mode. The client
 * utility parseMtgaText mirrors the server-side parser precisely so previews
 * are accurate without a round-trip.
 */
function ImportModal({ isOpen, onClose }: ImportModalProps) {
  const navigate = useNavigate()

  const [text, setText] = useState('')
  const [deckName, setDeckName] = useState('')
  const [format, setFormat] = useState('')
  const [preview, setPreview] = useState<ParsedDeck | null>(null)
  const [validationError, setValidationError] = useState('')
  const [apiError, setApiError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  // ── Reset state when modal closes ──────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setText('')
      setDeckName('')
      setFormat('')
      setPreview(null)
      setValidationError('')
      setApiError(null)
      setImporting(false)
    }
  }, [isOpen])

  // ── Escape key handler ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value)
    setValidationError('')
    setApiError(null)
    setPreview(null)
  }

  /** Client-side dry-run: parse without saving. No API call. */
  function handlePreview() {
    if (!text.trim()) {
      setValidationError('Paste some MTGA deck text before previewing.')
      setPreview(null)
      return
    }
    setValidationError('')
    setPreview(parseMtgaText(text))
  }

  async function handleImport() {
    if (!text.trim()) {
      setValidationError('Paste some MTGA deck text before importing.')
      return
    }
    if (!deckName.trim()) {
      setValidationError('Deck name is required.')
      return
    }

    setValidationError('')
    setApiError(null)
    setImporting(true)

    try {
      const { data } = await axios.post<{ id: string }>('/api/import', {
        text,
        name: deckName.trim(),
        format: format.trim(),
      })
      onClose()
      navigate(`/deck/${data.id}`)
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } }; message?: string }
      setApiError(e?.response?.data?.error ?? e?.message ?? 'Import failed. Please try again.')
    } finally {
      setImporting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
      data-testid="import-modal"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
        data-testid="import-modal-backdrop"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 id="import-modal-title" className="text-lg font-semibold text-gray-900">
            Import Deck
          </h2>
          <CloseButton
            onClick={onClose}
            aria-label="Close import modal"
            className="hover:text-gray-600 focus:ring-gray-300"
            data-testid="import-modal-close"
          />
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          {/* Deck name */}
          <div>
            <label htmlFor="import-deck-name" className="mb-1 block text-sm font-medium text-gray-700">
              Deck Name
            </label>
            <input
              id="import-deck-name"
              type="text"
              value={deckName}
              onChange={(e) => { setDeckName(e.target.value); setValidationError('') }}
              placeholder="My Awesome Deck"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              data-testid="import-deck-name"
            />
          </div>

          {/* Format (optional) */}
          <div>
            <label htmlFor="import-format" className="mb-1 block text-sm font-medium text-gray-700">
              Format{' '}
              <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <FormatSelect
              id="import-format"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              data-testid="import-format"
            />
          </div>

          {/* MTGA textarea */}
          <div>
            <label htmlFor="import-textarea" className="mb-1 block text-sm font-medium text-gray-700">
              Deck List{' '}
              <span className="text-xs font-normal text-gray-400">
                (MTGA format — paste from Arena's export)
              </span>
            </label>
            <textarea
              id="import-textarea"
              value={text}
              onChange={handleTextChange}
              placeholder={'4 Lightning Bolt\n2 Mountain\n\n2 Smash to Smithereens'}
              rows={10}
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500"
              data-testid="import-textarea"
            />
          </div>

          {/* Validation error */}
          {validationError && (
            <p role="alert" className="text-sm text-red-600" data-testid="import-validation-error">
              {validationError}
            </p>
          )}

          {/* API error */}
          {apiError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              data-testid="import-api-error"
            >
              {apiError}
            </div>
          )}

          {/* Preview panel — unknown cards shown as warnings, not errors */}
          {preview && <ImportPreview preview={preview} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={handlePreview}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300"
            data-testid="import-preview-button"
          >
            Preview
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={importing}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="import-submit-button"
          >
            {importing ? 'Importing…' : 'Import Deck'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ImportModal
