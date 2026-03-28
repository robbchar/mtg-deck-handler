import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import CardSearch from './CardSearch'
import type { ScryfallCard } from '../types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CARD_A: ScryfallCard = {
  id: 'card-a',
  name: 'Lightning Bolt',
  mana_cost: '{R}',
  type_line: 'Instant',
  image_uris: { small: 'https://example.com/small-a.jpg' },
}

const CARD_A_WITH_NORMAL: ScryfallCard = {
  id: 'card-a-normal',
  name: 'Lightning Bolt',
  mana_cost: '{R}',
  type_line: 'Instant',
  image_uris: { small: 'https://example.com/small-a.jpg', normal: 'https://example.com/normal-a.jpg' },
}

const CARD_B: ScryfallCard = {
  id: 'card-b',
  name: 'Counterspell',
  mana_cost: '{U}{U}',
  type_line: 'Instant',
  image_uris: { small: 'https://example.com/small-b.jpg', normal: 'https://example.com/normal-b.jpg' },
}

const CARD_NO_IMAGE: ScryfallCard = {
  id: 'card-no-img',
  name: 'Mystery Card',
  mana_cost: '{1}',
  type_line: 'Artifact',
}

const CARD_DFC: ScryfallCard = {
  id: 'card-dfc',
  name: 'Delver of Secrets',
  mana_cost: '{U}',
  type_line: 'Creature — Human Wizard // Creature — Human Insect',
  card_faces: [
    {
      image_uris: {
        small: 'https://example.com/dfc-small-front.jpg',
        normal: 'https://example.com/dfc-normal-front.jpg',
      },
    },
    {
      image_uris: {
        small: 'https://example.com/dfc-small-back.jpg',
        normal: 'https://example.com/dfc-normal-back.jpg',
      },
    },
  ],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockFetch = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  global.fetch = mockFetch
})

function mockSearchResults(cards: ScryfallCard[]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => cards,
  } as unknown as Response)
}

async function renderAndSearch(cards: ScryfallCard[]) {
  mockSearchResults(cards)
  render(<CardSearch sectionNames={['Mainboard', 'Sideboard']} onAddToSection={vi.fn()} />)
  const input = screen.getByRole('searchbox')
  fireEvent.change(input, { target: { value: 'bolt' } })
  fireEvent.submit(input.closest('form')!)
  await waitFor(() => expect(screen.getByText(cards[0].name)).toBeInTheDocument())
}

async function renderWithResultsAndClickCard(card: ScryfallCard) {
  await renderAndSearch([card])
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /add/i }))
  })
}

// ---------------------------------------------------------------------------
// Tests — rendering
// ---------------------------------------------------------------------------

describe('CardSearch', () => {
  it('renders without crashing', () => {
    render(<CardSearch sectionNames={[]} onAddToSection={vi.fn()} />)
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })

  it('shows search results after a successful fetch', async () => {
    await renderAndSearch([CARD_A, CARD_B])
    expect(screen.getByText('Lightning Bolt')).toBeInTheDocument()
    expect(screen.getByText('Counterspell')).toBeInTheDocument()
  })

  it('shows an error message when the fetch fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false } as Response)
    render(<CardSearch sectionNames={[]} onAddToSection={vi.fn()} />)
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: 'bolt' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  // -------------------------------------------------------------------------
  // Image: thumbnails
  // -------------------------------------------------------------------------

  it('renders a thumbnail img with loading="lazy" for cards with images', async () => {
    await renderAndSearch([CARD_A])
    const img = screen.getByRole('img', { name: 'Lightning Bolt' })
    expect(img).toHaveAttribute('src', CARD_A.image_uris!.small)
    expect(img).toHaveAttribute('loading', 'lazy')
  })

  it('renders a thumbnail placeholder for cards without image_uris', async () => {
    await renderAndSearch([CARD_NO_IMAGE])
    expect(screen.queryByRole('img')).toBeNull()
    // The thumbnail placeholder (there will be one in the list item)
    expect(screen.getAllByTestId('card-image-placeholder').length).toBeGreaterThanOrEqual(1)
  })

  it('renders the front-face small image for a DFC', async () => {
    await renderAndSearch([CARD_DFC])
    const img = screen.getByRole('img', { name: CARD_DFC.name })
    expect(img).toHaveAttribute('src', CARD_DFC.card_faces![0].image_uris!.small)
  })

  it('shows placeholder when thumbnail fails to load', async () => {
    await renderAndSearch([CARD_A])
    const img = screen.getByRole('img', { name: 'Lightning Bolt' })
    fireEvent.error(img)
    await waitFor(() => {
      expect(screen.queryByRole('img')).toBeNull()
      expect(screen.getByTestId('card-image-placeholder')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Image: section-picker preview (normal URI)
  // -------------------------------------------------------------------------

  it('shows normal image in section picker with loading="lazy"', async () => {
    await renderWithResultsAndClickCard(CARD_A_WITH_NORMAL)
    const picker = screen.getByTestId('section-picker')
    const img = within(picker).getByRole('img')
    expect(img).toHaveAttribute('src', CARD_A_WITH_NORMAL.image_uris!.normal)
    expect(img).toHaveAttribute('loading', 'lazy')
  })

  it('shows placeholder in section picker when card has no image at all', async () => {
    await renderWithResultsAndClickCard(CARD_NO_IMAGE)
    const picker = screen.getByTestId('section-picker')
    expect(picker.querySelector('img')).toBeNull()
    expect(within(picker).getByTestId('card-image-placeholder')).toBeInTheDocument()
  })

  it('shows front-face normal image in section picker for a DFC', async () => {
    await renderWithResultsAndClickCard(CARD_DFC)
    const picker = screen.getByTestId('section-picker')
    const img = within(picker).getByRole('img')
    expect(img).toHaveAttribute('src', CARD_DFC.card_faces![0].image_uris!.normal)
  })

  // -------------------------------------------------------------------------
  // Section picker — add behaviour
  // -------------------------------------------------------------------------

  it('calls onAddToSection with the correct arguments', async () => {
    const onAdd = vi.fn()
    mockSearchResults([CARD_A])
    render(<CardSearch sectionNames={['Mainboard']} onAddToSection={onAdd} />)
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: 'bolt' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(screen.getByText('Lightning Bolt')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /add/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Mainboard' }))

    expect(onAdd).toHaveBeenCalledWith(CARD_A, 'Mainboard')
  })
})