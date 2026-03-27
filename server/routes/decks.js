'use strict';

/**
 * Deck API routes — CRUD operations backed by deckService file I/O.
 *
 * Mounted at /api/decks in index.js.
 */

const { Router } = require('express');
const {
  listDecks,
  getDeck,
  createDeck,
  updateDeck,
  deleteDeck,
} = require('../services/deckService');
const { validateDeckName } = require('../middleware/validate');

const router = Router();

/**
 * GET /api/decks
 * Returns metadata for all decks (no card arrays).
 * Includes: id, name, format, notes, card_count, updated_at.
 */
router.get('/', (_req, res) => {
  try {
    const decks = listDecks();
    res.json(decks);
  } catch (err) {
    console.error('GET /api/decks error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * GET /api/decks/:id
 * Returns the full deck JSON for the given id.
 */
router.get('/:id', (req, res) => {
  try {
    const deck = getDeck(req.params.id);
    res.json(deck);
  } catch (err) {
    if (err.message && err.message.startsWith('Deck not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('GET /api/decks/:id error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * POST /api/decks
 * Creates a new deck. Requires `name` in the request body.
 */
router.post('/', validateDeckName, (req, res) => {
  try {
    const deck = createDeck({ ...req.body, name: req.body.name.trim() });
    res.status(201).json(deck);
  } catch (err) {
    console.error('POST /api/decks error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * PUT /api/decks/:id
 * Merges the request body into the existing deck via updateDeck().
 * updateDeck() writes the result atomically to disk; a subsequent
 * GET /api/decks (which calls listDecks()) reads the updated file and
 * reflects the new notes/name/format in the list response.
 */
router.put('/:id', validateDeckName, (req, res) => {
  try {
    const deck = updateDeck(req.params.id, req.body || {});
    res.json(deck);
  } catch (err) {
    if (err.message && err.message.startsWith('Deck not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('PUT /api/decks/:id error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * DELETE /api/decks/:id
 */
router.delete('/:id', (req, res) => {
  try {
    const result = deleteDeck(req.params.id);
    res.json(result);
  } catch (err) {
    if (err.message && err.message.startsWith('Deck not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('DELETE /api/decks/:id error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

module.exports = router;