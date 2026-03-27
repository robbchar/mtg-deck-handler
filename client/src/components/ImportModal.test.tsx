import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import axios from 'axios'
import ImportModal from './ImportModal'

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_TEXT = '4 Lightning Bolt\n2 Mountain\n\n2 Smash to Smithereens'
const ARENA_TEXT = 'Deck\n4 Lightning Bolt (LEA) 161\n2 Mountain (FDN) 279\n\nSideboard\n2 Smash to Smithereens (M12) 133'
const MALFORMED_TEXT = '4 Lightning Bolt\nNot a card line\n2 Mountain'

const CREATED_DECK = {
  id: 'deck-new-001',
  name: 'Mono Red',
  format: 'Standard',
  cards: [
    { quantity: 4, name: 'Lightning Bolt', scryfall_id: null, section: 'mainboard' },
    { quantity: 2, name: 'Mountain', scryfall_id: null, section: 'mainboard' },
  ],
  sideboard: [
    { quantity: 2, name: 'Smash to Smithereens', scryfall_id: null, section: 'sideboard' },
  ],
  unknown: ['Lightning Bolt', 'Mountain', 'Smash to Smithereens'],
  notes: '',
  tags: [],
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
}

/** Renders the modal, open by default unless overridden. */
function renderModal({ isOpen = true, onClose = vi.fn() } = {}) {
  return render(
    <MemoryRouter>
      <ImportModal isOpen={isOpen} onClose={onClose} />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockNavigate.mockReset()
})

// ── Visibility ────────────────────────────────────────────────────────────────

describe('ImportModal — visibility', () => {
  it('renders the modal when isOpen is true', () => {
    renderModal({ isOpen: true })
    expect(screen.getByTestId('import-modal')).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    renderModal({ isOpen: false })
    expect(screen.queryByTestId('import-modal')).not.toBeInTheDocument()
  })

  it('renders the title "Import Deck"', () => {
    renderModal()
    expect(screen.getByRole('heading', { name: 'Import Deck' })).toBeInTheDocument()
  })

  it('renders a textarea for deck list input', () => {
    renderModal()
    expect(screen.getByTestId('import-textarea')).toBeInTheDocument()
  })

  it('renders a deck name input', () => {
    renderModal()
    expect(screen.getByTestId('import-deck-name')).toBeInTheDocument()
  })

  it('renders a Preview button', () => {
    renderModal()
    expect(screen.getByTestId('import-preview-button')).toBeInTheDocument()
  })

  it('renders an Import Deck button', () => {
    renderModal()
    expect(screen.getByTestId('import-submit-button')).toBeInTheDocument()
  })

  it('does not show validation error initially', () => {
    renderModal()
    expect(screen.queryByTestId('import-validation-error')).not.toBeInTheDocument()
  })

  it('does not show preview panel initially', () => {
    renderModal()
    expect(screen.queryByTestId('import-preview')).not.toBeInTheDocument()
  })
})

// ── Preview — valid text ───────────────────────────────────────────────────────

describe('ImportModal — preview with valid text', () => {
  it('shows the preview panel after clicking Preview with text', () => {
    renderModal()
    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: VALID_TEXT } })
    fireEvent.click(screen.getByTestId('import-preview-button'))
    expect(screen.getByTestId('import-preview')).toBeInTheDocument()
  })

  it('shows the parsed card count in the preview summary', () => {
    renderModal()
    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: VALID_TEXT } })
    fireEvent.click(screen.getByTestId('import-preview-button'))
    // 4 + 2 + 2 = 8 cards total
    expect(screen.getByTestId('import-preview-summary')).toHaveTextContent('8 cards parsed')
  })

  it('shows mainboard entry count in preview summary', () => {
    renderModal()
    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: VALID_TEXT } })
    fireEvent.click(screen.getByTestId('import-preview-button'))
    expect(screen.getByTestId('import-preview-summary')).toHaveTextContent('2 mainboard')
  })

  it('shows sideboard entry count when sideboard is present', () => {
    renderModal()
    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: VALID_TEXT } })
    fireEvent.click(screen.getByTestId('import-preview-button'))
    expect(screen.getByTestId('import-preview-summary')).toHaveTextContent('1 sideboard')
  })

  it('does not show sideboard count when no sideboard cards', () => {
    renderModal()
    fireEvent.change(screen.getByTestId('import-textarea'), {
      target: { value: '4 Lightning Bolt\n2 Mountain' },
    })
    fireEvent.click(screen.getByTestId('import-preview-button'))
    expect(screen.getByTestId('import-preview-summary')).not.toHaveTextContent('sideboard')
  })

  it('parses MTGA Arena format with set/collector suffixes correctly', () => {
    renderModal()
    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: ARENA_TEXT } })
    fireEvent.click(screen.getByTestId('import-preview-button'))
    // 4 + 2 + 2 = 8 total
    expect(screen.getByTestId('import-preview-summary')).toHaveTextContent('8 cards parsed')
  })

  it('shows empty-parse warning when no valid card lines are found', () => {
    renderModal()
    fireEvent.change(screen.getByTestId('import-textarea'), {
      target: { value: '// just a comment\nDeck' },
    })
    fireEvent.click(screen.getByTestId('import-preview-button'))
    expect(screen.getByTestId('import-preview-empty')).toBeInTheDocument()
  })
})

// ── Preview — unknown / unparseable lines (warnings) ─────────────────────────

describe('ImportModal — unknown card warnings', () => {
  it('shows a warning for unparseable lines', () => {
    renderModal()
    fireEvent.change(screen.getByTestId('import-textarea'), {
      target: { value: MALFORMED_TEXT },
    })
    fireEvent.click(screen.getByTestId('import-preview-button'))
    expect(screen.getByTestId('import-unknown-warning')).toBeInTheDocument()
  })

  it('displays the offending unparseable line text', () => {
    renderModal()
    fireEvent.change(screen.getByTestId('import-textarea'), {
      target: { value: MALFORMED_TEXT },
    })
    fireEvent.click(screen.getByTestId('import-preview-button'))
    expect(screen.getByText('Not a card line')).toBeInTheDocument()
  })

  it('does not show the warning when all lines parse successfully', () => {
    renderModal()
    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: VALID_TEXT } })
    fireEvent.click(screen.getByTestId('import-preview-button'))
    expect(screen.queryByTestId('import-unknown-warning')).not.toBeInTheDocument()
  })

  it('still shows the preview summary alongside unknown warnings (warnings do not block preview)', () => {
    renderModal()
    fireEvent.change(screen.getByTestId('import-textarea'), {
      target: { value: MALFORMED_TEXT },
    })
    fireEvent.click(screen.getByTestId('import-preview-button'))
    // 4 + 2 valid cards
    expect(screen.getByTestId('import-preview-summary')).toHaveTextContent('6 cards parsed')
    expect(screen.getByTestId('import-unknown-warning')).toBeInTheDocument()
  })
})

// ── Validation — empty textarea ───────────────────────────────────────────────

describe('ImportModal — empty textarea validation', () => {
  it('shows a validation message when Preview is clicked with empty textarea', () => {
    renderModal()
    fireEvent.click(screen.getByTestId('import-preview-button'))
    expect(screen.getByTestId('import-validation-error')).toBeInTheDocument()
  })

  it('shows a validation message when Import is clicked with empty textarea', async () => {
    renderModal()
    fireEvent.change(screen.getByTestId('import-deck-name'), {
      target: { value: 'My Deck' },
    })
    fireEvent.click(screen.getByTestId('import-submit-button'))
    expect(screen.getByTestId('import-validation-error')).toBeInTheDocument()
    expect(axios.post).not.toHaveBeenCalled()
  })

  it('validation message has role="alert"', () => {
    renderModal()
    fireEvent.click(screen.getByTestId('import-preview-button'))
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('hides validation error after the user starts typing', () => {
    renderModal()
    fireEvent.click(screen.getByTestId('import-preview-button'))
    expect(screen.getByTestId('import-validation-error')).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('import-textarea'), {
      target: { value: '4 Lightning Bolt' },
    })
    expect(screen.queryByTestId('import-validation-error')).not.toBeInTheDocument()
  })

  it('shows a validation message when Import is clicked without a deck name', async () => {
    renderModal()
    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: VALID_TEXT } })
    fireEvent.click(screen.getByTestId('import-submit-button'))
    expect(screen.getByTestId('import-validation-error')).toBeInTheDocument()
    expect(axios.post).not.toHaveBeenCalled()
  })
})

// ── Import — success ──────────────────────────────────────────────────────────

describe('ImportModal — successful import', () => {
  async function importDeck({
    deckNameValue = 'Mono Red',
    formatValue = 'standard',
    textValue = VALID_TEXT,
  } = {}) {
    axios.post.mockResolvedValueOnce({ data: CREATED_DECK })
    renderModal()

    fireEvent.change(screen.getByTestId('import-deck-name'), {
      target: { value: deckNameValue },
    })
    if (formatValue) {
      fireEvent.change(screen.getByTestId('import-format'), {
        target: { value: formatValue },
      })
    }
    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: textValue } })
    fireEvent.click(screen.getByTestId('import-submit-button'))

    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1))
  }

  it('calls POST /api/import with text, name, and format', async () => {
    await importDeck()
    expect(axios.post).toHaveBeenCalledWith('/api/import', {
      text: VALID_TEXT,
      name: 'Mono Red',
      format: 'standard',
    })
  })

  it('trims whitespace from name before sending', async () => {
    await importDeck({ deckNameValue: '  Mono Red  ', formatValue: 'modern' })
    expect(axios.post).toHaveBeenCalledWith('/api/import', {
      text: VALID_TEXT,
      name: 'Mono Red',
      format: 'modern',
    })
  })

  it('sends empty string for format when not provided', async () => {
    await importDeck({ formatValue: '' })
    expect(axios.post).toHaveBeenCalledWith('/api/import', {
      text: VALID_TEXT,
      name: 'Mono Red',
      format: '',
    })
  })

  it('navigates to /deck/:id after a successful import', async () => {
    await importDeck()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/deck/deck-new-001'))
  })

  it('shows "Importing…" on the button while the request is in-flight', async () => {
    let resolvePost
    axios.post.mockReturnValueOnce(new Promise((r) => { resolvePost = r }))

    renderModal()
    fireEvent.change(screen.getByTestId('import-deck-name'), { target: { value: 'My Deck' } })
    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: VALID_TEXT } })
    fireEvent.click(screen.getByTestId('import-submit-button'))

    expect(screen.getByTestId('import-submit-button')).toHaveTextContent('Importing…')
    expect(screen.getByTestId('import-submit-button')).toBeDisabled()

    await waitFor(async () => resolvePost({ data: CREATED_DECK }))
  })

  it('does not show a validation or API error on success', async () => {
    await importDeck()
    expect(screen.queryByTestId('import-validation-error')).not.toBeInTheDocument()
    expect(screen.queryByTestId('import-api-error')).not.toBeInTheDocument()
  })
})

// ── Import — failure ──────────────────────────────────────────────────────────

describe('ImportModal — failed import', () => {
  it('shows an API error banner when the request fails', async () => {
    axios.post.mockRejectedValueOnce({
      response: { data: { error: 'text is required' } },
    })

    renderModal()
    fireEvent.change(screen.getByTestId('import-deck-name'), { target: { value: 'My Deck' } })
    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: VALID_TEXT } })
    fireEvent.click(screen.getByTestId('import-submit-button'))

    await waitFor(() =>
      expect(screen.getByTestId('import-api-error')).toBeInTheDocument()
    )
  })

  it('API error contains the server error message', async () => {
    axios.post.mockRejectedValueOnce({
      response: { data: { error: 'name is required' } },
    })

    renderModal()
    fireEvent.change(screen.getByTestId('import-deck-name'), { target: { value: 'My Deck' } })
    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: VALID_TEXT } })
    fireEvent.click(screen.getByTestId('import-submit-button'))

    await waitFor(() =>
      expect(screen.getByTestId('import-api-error')).toHaveTextContent('name is required')
    )
  })

  it('falls back to a generic message when no server error is available', async () => {
    axios.post.mockRejectedValueOnce(new Error('Network Error'))

    renderModal()
    fireEvent.change(screen.getByTestId('import-deck-name'), { target: { value: 'My Deck' } })
    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: VALID_TEXT } })
    fireEvent.click(screen.getByTestId('import-submit-button'))

    await waitFor(() =>
      expect(screen.getByTestId('import-api-error')).toBeInTheDocument()
    )
  })

  it('does not navigate when the request fails', async () => {
    axios.post.mockRejectedValueOnce(new Error('fail'))

    renderModal()
    fireEvent.change(screen.getByTestId('import-deck-name'), { target: { value: 'My Deck' } })
    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: VALID_TEXT } })
    fireEvent.click(screen.getByTestId('import-submit-button'))

    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1))
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('re-enables the Import button after a failed request', async () => {
    axios.post.mockRejectedValueOnce(new Error('fail'))

    renderModal()
    fireEvent.change(screen.getByTestId('import-deck-name'), { target: { value: 'My Deck' } })
    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: VALID_TEXT } })
    fireEvent.click(screen.getByTestId('import-submit-button'))

    await waitFor(() =>
      expect(screen.getByTestId('import-submit-button')).not.toBeDisabled()
    )
  })

  it('unknown cards in the deck do not block import (server accepts them)', async () => {
    // Server returns deck with unknown[] populated — import should still succeed
    const deckWithUnknowns = {
      ...CREATED_DECK,
      unknown: ['Lightning Bolt', 'Mountain', 'Smash to Smithereens'],
    }
    axios.post.mockResolvedValueOnce({ data: deckWithUnknowns })

    renderModal()
    fireEvent.change(screen.getByTestId('import-deck-name'), { target: { value: 'My Deck' } })
    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: VALID_TEXT } })
    fireEvent.click(screen.getByTestId('import-submit-button'))

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(`/deck/${deckWithUnknowns.id}`)
    )
  })
})

// ── Close behaviours ──────────────────────────────────────────────────────────

describe('ImportModal — close behaviours', () => {
  it('calls onClose when the × button is clicked', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByTestId('import-modal-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByTestId('import-modal-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose for keys other than Escape', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.keyDown(document, { key: 'Enter' })
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not call onClose from Escape when modal is closed', () => {
    const onClose = vi.fn()
    renderModal({ isOpen: false, onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('removes the Escape listener after the modal closes', () => {
    const onClose = vi.fn()
    const { rerender } = renderModal({ isOpen: true, onClose })
    rerender(
      <MemoryRouter>
        <ImportModal isOpen={false} onClose={onClose} />
      </MemoryRouter>
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})

// ── State reset ───────────────────────────────────────────────────────────────

describe('ImportModal — state reset on close', () => {
  it('clears the textarea when the modal is reopened', () => {
    const { rerender } = renderModal({ isOpen: true })
    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: VALID_TEXT } })

    rerender(
      <MemoryRouter>
        <ImportModal isOpen={false} onClose={vi.fn()} />
      </MemoryRouter>
    )
    rerender(
      <MemoryRouter>
        <ImportModal isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>
    )

    expect(screen.getByTestId('import-textarea')).toHaveValue('')
  })

  it('clears the deck name when the modal is reopened', () => {
    const { rerender } = renderModal({ isOpen: true })
    fireEvent.change(screen.getByTestId('import-deck-name'), { target: { value: 'My Deck' } })

    rerender(
      <MemoryRouter>
        <ImportModal isOpen={false} onClose={vi.fn()} />
      </MemoryRouter>
    )
    rerender(
      <MemoryRouter>
        <ImportModal isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>
    )

    expect(screen.getByTestId('import-deck-name')).toHaveValue('')
  })

  it('clears the preview panel when the modal is reopened', () => {
    const { rerender } = renderModal({ isOpen: true })
    fireEvent.change(screen.getByTestId('import-textarea'), { target: { value: VALID_TEXT } })
    fireEvent.click(screen.getByTestId('import-preview-button'))
    expect(screen.getByTestId('import-preview')).toBeInTheDocument()

    rerender(
      <MemoryRouter>
        <ImportModal isOpen={false} onClose={vi.fn()} />
      </MemoryRouter>
    )
    rerender(
      <MemoryRouter>
        <ImportModal isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>
    )

    expect(screen.queryByTestId('import-preview')).not.toBeInTheDocument()
  })

  it('clears validation errors when the modal is reopened', () => {
    const { rerender } = renderModal({ isOpen: true })
    fireEvent.click(screen.getByTestId('import-preview-button'))
    expect(screen.getByTestId('import-validation-error')).toBeInTheDocument()

    rerender(
      <MemoryRouter>
        <ImportModal isOpen={false} onClose={vi.fn()} />
      </MemoryRouter>
    )
    rerender(
      <MemoryRouter>
        <ImportModal isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>
    )

    expect(screen.queryByTestId('import-validation-error')).not.toBeInTheDocument()
  })
})