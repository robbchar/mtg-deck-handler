'use strict';

/**
 * Import / Export routes for MTGA-format deck text.
 *
 * Mounted at /api in index.js, so:
 *   POST /api/decks/:id/export  →  router.post('/decks/:id/export', ...)
 *   POST /api/import            →  router.post('/import', ...)
 */

const { Router } = require('express');
const { getDeck, createDeck } = require('../services/deckService');
const { exportDeck, parseMtgaText } = require('../services/mtgaService');

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
router.post('/decks/:id/export', (req, res) => {
  try {
    const deck = getDeck(req.params.id);
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
router.post('/import', (req, res) => {
  try {
    const { text, name, format } = req.body || {};

    if (!text || typeof text !== 'string' || text.trim() === '') {
      return res.status(400).json({ error: 'text is required' });
    }

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'name is required' });
    }

    // parseMtgaText handles: CRLF/LF, "Deck"/"Sideboard" headers,
    // set/collector suffixes, comment lines, and invalid quantities.
    const { mainboard, sideboard } = parseMtgaText(text);

    const toCardEntry = (section) => (c) => ({
      quantity: c.quantity,
      name: c.name,
      scryfall_id: null,
      section,
    });

    const cards = mainboard.map(toCardEntry('mainboard'));
    const sideboardCards = sideboard.map(toCardEntry('sideboard'));

    // All card names go into unknown[] — no Scryfall lookup in Milestone 1.
    // TODO (Task 2.2): replace with cache lookup, only add unresolved to unknown[].
    const unknown = [...mainboard, ...sideboard].map((c) => c.name);

    const deck = createDeck({
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

module.exports = router;