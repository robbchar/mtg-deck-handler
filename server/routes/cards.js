'use strict';

/**
 * Card API routes — search and individual card lookup backed by cardService.
 *
 * Mounted at /api/cards in server/index.js.
 *
 * Routes:
 *   GET /api/cards/search?q={query}  — search Scryfall (cache-first)
 *   GET /api/cards/:scryfallId       — single card lookup (cache-first)
 *
 * Important: /search must be declared before /:scryfallId so Express does not
 * interpret the literal string "search" as a scryfallId parameter value.
 */

const { Router } = require('express');
const { getCard, searchCards } = require('../services/cardService');

const router = Router();

// ── GET /api/cards/search ─────────────────────────────────────────────────────

/**
 * Search for cards matching a Scryfall query string.
 *
 * Query params:
 *   q {string} — Scryfall search syntax query (required, non-empty)
 *
 * @route   GET /api/cards/search
 * @returns {200} Array of Scryfall card objects (may be empty when no matches)
 * @returns {400} { error: string } — missing or blank query parameter
 * @returns {429} { error: string } — Scryfall rate limit hit
 * @returns {500} { error: string } — unexpected server error
 */
router.get('/search', async (req, res) => {
  const { q } = req.query;

  if (!q || typeof q !== 'string' || q.trim() === '') {
    return res.status(400).json({ error: 'query parameter q is required' });
  }

  try {
    const cards = await searchCards(q.trim());
    res.json(cards);
  } catch (err) {
    if (err.type === 'RATE_LIMITED') {
      return res.status(429).json({ error: 'Scryfall rate limit exceeded. Please retry shortly.' });
    }
    console.error('GET /api/cards/search error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── GET /api/cards/:scryfallId ────────────────────────────────────────────────

/**
 * Fetch a single card by its Scryfall UUID using a cache-first strategy.
 *
 * @route   GET /api/cards/:scryfallId
 * @returns {200} Scryfall card object
 * @returns {404} { error: string } — card not found in Scryfall
 * @returns {429} { error: string } — Scryfall rate limit hit
 * @returns {500} { error: string } — unexpected server error
 */
router.get('/:scryfallId', async (req, res) => {
  const { scryfallId } = req.params;

  try {
    const card = await getCard(scryfallId);

    if (card === null) {
      return res.status(404).json({ error: `Card not found: ${scryfallId}` });
    }

    res.json(card);
  } catch (err) {
    if (err.type === 'RATE_LIMITED') {
      return res.status(429).json({ error: 'Scryfall rate limit exceeded. Please retry shortly.' });
    }
    console.error('GET /api/cards/:scryfallId error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

module.exports = router;