'use strict';

/**
 * Import / Export routes for MTGA-format deck text.
 *
 * Mounted at /api in index.js, so:
 *   POST /api/decks/:id/export  →  router.post('/decks/:id/export', ...)
 *   POST /api/import            →  router.post('/import', ...)
 */

const { Router } = require('express');
const { getDeck, createDeck, updateDeck } = require('../services/deckService');
const { exportDeck, parseMtgaText } = require('../services/mtgaService');
const { getCard, searchCards, getCardBySetCollector } = require('../services/cardService');
const { validateImport, validateUpdateImport } = require('../middleware/validate');

const router = Router();

// ── POST /api/decks/:id/export ────────────────────────────────────────────────

/**
 * Exports an existing deck as MTGA-formatted text.
 *
 * @route  POST /api/decks/:id/export
 * @returns {200} { text: string }
 * @returns {404} { error: string }
 * @returns {500} { error: string }
 */
router.post('/decks/:id/export', async (req, res) => {
  try {
    const deck = await getDeck(req.params.id);
    const text = exportDeck(deck);
    res.json({ text });
  } catch (err) {
    if (err.message && err.message.startsWith('Deck not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('POST /api/decks/:id/export error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── POST /api/import ──────────────────────────────────────────────────────────

/**
 * Imports an MTGA-formatted text string and creates a new deck.
 *
 * Accepts both the simple "{quantity} {card name}" format and the full MTGA
 * Arena export format "{quantity} {card name} ({set}) {collector}".
 * The "Deck" / "Sideboard" / "Commander" header keywords are handled by
 * parseMtgaText automatically.
 *
 * Flow:
 *   1. Validate required fields (text, name).
 *   2. Call parseMtgaText(text) → { mainboard, sideboard }.
 *   3. Map parsed entries into card objects with scryfall_id: null.
 *   4. Collect all names into unknown[] (no Scryfall lookup in M1).
 *   5. Call createDeck() and return the saved deck as 201.
 *
 * @route   POST /api/import
 * @returns {201} Full deck JSON with unknown[] array
 * @returns {400} { error: string }
 * @returns {500} { error: string }
 */
/**
 * Resolves a single parsed card entry to a full Scryfall-enriched card.
 *
 * Strategy (in order):
 *   1. If set_code + collector_number are present, use Scryfall's
 *      `/cards/:set/:collector_number` — this is the exact printing MTGA exported.
 *   2. Fall back to an exact-name search `!"<name>"` which returns the most
 *      recent oracle printing.
 *   3. If both fail, return a stub entry with scryfall_id: null.
 *
 * @param {{ quantity: number, name: string, set_code?: string, collector_number?: string }} c
 * @param {'mainboard'|'sideboard'} section
 * @returns {Promise<object>} CardEntry-shaped object
 */
async function resolveCardEntry(c, section) {
  let resolved = null;

  try {
    if (c.set_code && c.collector_number) {
      resolved = await getCardBySetCollector(c.set_code, c.collector_number);
    }
    if (!resolved) {
      // Exact-name search: Scryfall syntax !"name" matches only the precise card name.
      const results = await searchCards(`!"${c.name}"`);
      resolved = results[0] ?? null;
    }
  } catch (err) {
    // Non-fatal — card will land in unknown[].
    console.warn(`Import: could not resolve "${c.name}":`, err.message);
  }

  return {
    quantity: c.quantity,
    name: c.name,
    scryfall_id: resolved?.id ?? null,
    section,
    ...(resolved?.mana_cost !== undefined && { mana_cost: resolved.mana_cost }),
    ...(resolved?.type_line !== undefined && { type_line: resolved.type_line }),
    ...(resolved?.image_uris
      ? {
          image_uris: {
            small: resolved.image_uris.small,
            normal: resolved.image_uris.normal,
          },
        }
      : {}),
  };
}

router.post('/import', validateImport, async (req, res) => {
  try {
    const { text, name, format } = req.body || {};

    // parseMtgaText handles: CRLF/LF, "Deck"/"Sideboard" headers,
    // set/collector suffixes, comment lines, and invalid quantities.
    const { mainboard, sideboard } = parseMtgaText(text);

    // Resolve all cards concurrently — the scryfallLimiter inside cardService
    // serialises outgoing Scryfall requests to respect the 10 req/s limit.
    const [cards, sideboardCards] = await Promise.all([
      Promise.all(mainboard.map((c) => resolveCardEntry(c, 'mainboard'))),
      Promise.all(sideboard.map((c) => resolveCardEntry(c, 'sideboard'))),
    ]);

    // Only cards we could not resolve go into unknown[].
    const unknown = [...cards, ...sideboardCards]
      .filter((c) => !c.scryfall_id)
      .map((c) => c.name);

    const deck = await createDeck({
      name: name.trim(),
      format: typeof format === 'string' ? format.trim() : '',
      cards,
      sideboard: sideboardCards,
      unknown,
    });

    res.status(201).json(deck);
  } catch (err) {
    console.error('POST /api/import error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── POST /api/decks/:id/import ────────────────────────────────────────────────

/**
 * Updates an existing deck's card list from MTGA-formatted text.
 *
 * Replaces `cards`, `sideboard`, and `unknown` on the deck.
 * Name, format, and notes are left unchanged.
 *
 * Flow:
 *   1. Validate required field (text).
 *   2. Call parseMtgaText(text) → { mainboard, sideboard }.
 *   3. Resolve all cards via resolveCardEntry (Scryfall, rate-limited).
 *   4. Call updateDeck(id, { cards, sideboard, unknown }).
 *   5. Return the updated deck as 200.
 *
 * @route   POST /api/decks/:id/import
 * @returns {200} Full deck JSON
 * @returns {400} { error: string }
 * @returns {404} { error: string }
 * @returns {500} { error: string }
 */
router.post('/decks/:id/import', validateUpdateImport, async (req, res) => {
  try {
    const { text } = req.body;
    const { id } = req.params;

    const { mainboard, sideboard } = parseMtgaText(text);

    const [cards, sideboardCards] = await Promise.all([
      Promise.all(mainboard.map((c) => resolveCardEntry(c, 'mainboard'))),
      Promise.all(sideboard.map((c) => resolveCardEntry(c, 'sideboard'))),
    ]);

    const unknown = [...cards, ...sideboardCards]
      .filter((c) => !c.scryfall_id)
      .map((c) => c.name);

    const deck = await updateDeck(id, { cards, sideboard: sideboardCards, unknown });

    res.json(deck);
  } catch (err) {
    if (err.message && err.message.startsWith('Deck not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('POST /api/decks/:id/import error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

module.exports = router;
