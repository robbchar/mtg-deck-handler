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
  activeSnapshotId?: string | null
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

// ── Game log types ────────────────────────────────────────────────────────────

export type GameResult = 'win' | 'loss'
export type OpponentColor = 'W' | 'U' | 'B' | 'R' | 'G'
export type OpponentArchetype = 'aggro' | 'midrange' | 'control' | 'combo' | 'unknown'
export type OpeningHandFeel = 'flood' | 'good' | 'screw'
export type MtgaRank = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'mythic'

export interface GameEntry {
  id: string
  logged_at: string
  result: GameResult
  turn_ended: number | null
  opponent_colors: OpponentColor[]
  opponent_archetype: OpponentArchetype | null
  opening_hand_feel: OpeningHandFeel | null
  mtga_rank: MtgaRank | null
  cards_in_hand: string[]
  tough_opponent_card: string
  notes: string
}

export interface NewGameEntry {
  result: GameResult
  turn_ended?: number | null
  opponent_colors?: OpponentColor[]
  opponent_archetype?: OpponentArchetype | null
  opening_hand_feel?: OpeningHandFeel | null
  mtga_rank?: MtgaRank | null
  cards_in_hand?: string[]
  tough_opponent_card?: string
  notes?: string
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

// ── Deck history types ────────────────────────────────────────────────────────

export interface DeckSnapshot {
  id: string
  createdAt: string      // ISO timestamp
  cards: CardEntry[]     // mainboard at snapshot time
  sideboard: CardEntry[] // sideboard at snapshot time
  format: string
  notes: string
}

/**
 * Represents a net change to a single card between two consecutive snapshots.
 * delta > 0 = added, delta < 0 = removed.
 */
export interface CardDiff {
  name: string
  delta: number
  section: 'mainboard' | 'sideboard'
  /** Quantity in the prior snapshot. 0 means the card is brand new. */
  previousQuantity?: number
}
