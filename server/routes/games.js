'use strict';

/**
 * Game log API routes — per-deck game logging.
 *
 * Mounted at /api/decks in index.js (nested under the deck id).
 */

const { Router } = require('express');
const { getGames, addGame, removeGame } = require('../services/gameService');

const router = Router({ mergeParams: true });

/**
 * GET /api/decks/:id/games
 * Returns all logged games for a deck, newest first.
 */
router.get('/', async (req, res) => {
  try {
    const games = await getGames(req.params.id);
    res.json(games);
  } catch (err) {
    console.error('GET /api/decks/:id/games error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * POST /api/decks/:id/games
 * Appends a new game entry. `result` ("win" | "loss") is required.
 */
router.post('/', async (req, res) => {
  try {
    const entry = await addGame(req.params.id, req.body || {});
    res.status(201).json(entry);
  } catch (err) {
    if (err.message && err.message.startsWith('result is required')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('POST /api/decks/:id/games error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * DELETE /api/decks/:id/games/:gameId
 * Removes a single game entry from the deck's log.
 */
router.delete('/:gameId', async (req, res) => {
  try {
    const result = await removeGame(req.params.id, req.params.gameId);
    res.json(result);
  } catch (err) {
    if (err.message && (
      err.message.startsWith('Game log not found') ||
      err.message.startsWith('Game not found')
    )) {
      return res.status(404).json({ error: err.message });
    }
    console.error('DELETE /api/decks/:id/games/:gameId error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

module.exports = router;
