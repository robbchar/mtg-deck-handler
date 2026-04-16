'use strict';

/**
 * Deck API routes — CRUD operations backed by deckService.
 *
 * Mounted at /api/decks in index.js.
 * All routes require a valid Firebase ID token (enforced by requireAuth middleware).
 * Deck ownership is scoped to req.user.uid.
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
 * Returns metadata for all decks owned by the authenticated user.
 * Includes: id, name, format, notes, card_count, updated_at.
 */
router.get('/', async (req, res) => {
  try {
    const decks = await listDecks(req.user.uid);
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
router.get('/:id', async (req, res) => {
  try {
    const deck = await getDeck(req.params.id);
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
 * Creates a new deck owned by the authenticated user.
 * Requires `name` in the request body.
 */
router.post('/', validateDeckName, async (req, res) => {
  try {
    const deck = await createDeck({
      ...req.body,
      name: req.body.name.trim(),
      userId: req.user.uid,
    });
    res.status(201).json(deck);
  } catch (err) {
    console.error('POST /api/decks error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * PUT /api/decks/:id
 * Merges the request body into the existing deck.
 */
router.put('/:id', validateDeckName, async (req, res) => {
  try {
    const deck = await updateDeck(req.params.id, req.body || {});
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
router.delete('/:id', async (req, res) => {
  try {
    const result = await deleteDeck(req.params.id);
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
