// ── Canonical data shapes ─────────────────────────────────────────────────────

/**
 * A single card entry as stored in a deck (server persistence format).
 * snake_case fields match the server JSON exactly.
 */
export interface CardEntry {
  name: string
  quantity: number
  scryfall_id: string | null
  section: 'mainboard' | 'sideboard'
  mana_cost?: string
  type_line?: string
  /** Stored when added via CardSearch so grid/compact views can show images without re-fetching. */
  image_uris?: { small: string; normal?: string }
}

/** Full deck object returned by GET /api/decks/:id */
export interface Deck {
  id: string
  name: string
  format: string
  notes: string
  cards: CardEntry[]
  sideboard: CardEntry[]
  tags?: string[]
  created_at: string
  updated_at: string
  unknown?: string[]
}

/** Slim metadata returned by GET /api/decks (list endpoint — no card arrays) */
export interface DeckMetadata {
  id: string
  name: string
  format: string
  notes: string
  card_count: number
  updated_at: string
}

/** Scryfall card as returned by /api/cards/search and /api/cards/:id */
export interface ScryfallCard {
  id: string
  name: string
  mana_cost: string
  type_line: string
  oracle_text?: string
  image_uris?: { small: string; normal?: string }
  card_faces?: Array<{
    name?: string
    oracle_text?: string
    image_uris?: { small: string; normal?: string }
  }>
}

/** Return shape of parseMtgaText (client-side MTGA parser) */
export interface ParsedDeck {
  mainboard: Array<{ quantity: number; name: string; set_code?: string; collector_number?: string }>
  sideboard: Array<{ quantity: number; name: string; set_code?: string; collector_number?: string }>
  unknownLines: string[]
}

// ── Reducer types ─────────────────────────────────────────────────────────────

export interface DeckState {
  decks: DeckMetadata[]
  loading: boolean
  error: string | null
}

/**
 * Discriminated union of all reducer actions.
 * Each case's payload type is enforced at the call site.
 */
export type DeckAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: DeckMetadata[] }
  | { type: 'FETCH_ERROR'; payload: string }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'ADD_DECK'; payload: DeckMetadata }
  | { type: 'REPLACE_TEMP_DECK'; payload: { tempId: string; deck: DeckMetadata } }
  | { type: 'ROLLBACK_ADD'; payload: string }
  | { type: 'UPDATE_DECK'; payload: DeckMetadata }
  | { type: 'REMOVE_DECK'; payload: string }
  | { type: 'ROLLBACK_REMOVE'; payload: DeckMetadata }
