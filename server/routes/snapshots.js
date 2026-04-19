'use strict';

/**
 * Snapshot routes — deck history.
 *
 * Mounted at /api/decks/:id/snapshots in index.js.
 * All routes verify that the authenticated user owns the deck before proceeding.
 */

const { Router } = require('express');
const { getDeck } = require('../services/deckService');
const { listSnapshots, createSnapshot, revertToSnapshot, deleteSnapshotsAfter } = require('../services/snapshotService');

const router = Router({ mergeParams: true });

/**
 * Middleware — verifies the deck exists and belongs to req.user.uid.
 * Attaches the deck to req.deck on success.
 */
async function verifyDeckOwnership(req, res, next) {
  try {
    const deck = await getDeck(req.params.id);
    if (deck.userId !== req.user.uid) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.deck = deck;
    next();
  } catch (err) {
    if (err.message && err.message.startsWith('Deck not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('verifyDeckOwnership error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

router.use(verifyDeckOwnership);

/**
 * GET /api/decks/:id/snapshots
 * Returns all snapshots for the deck, newest first.
 */
router.get('/', async (req, res) => {
  try {
    const snapshots = await listSnapshots(req.params.id);
    res.json(snapshots);
  } catch (err) {
    console.error('GET /api/decks/:id/snapshots error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * POST /api/decks/:id/snapshots
 * Creates a new snapshot from the request body.
 */
router.post('/', async (req, res) => {
  try {
    const snapshot = await createSnapshot(req.params.id, req.body || {});
    res.status(201).json(snapshot);
  } catch (err) {
    console.error('POST /api/decks/:id/snapshots error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * POST /api/decks/:id/snapshots/:snapshotId/revert
 * Reverts the deck to the state captured in the snapshot.
 */
router.post('/:snapshotId/revert', async (req, res) => {
  try {
    const deck = await revertToSnapshot(req.params.id, req.params.snapshotId);
    res.json(deck);
  } catch (err) {
    if (err.message && err.message.startsWith('Snapshot not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('POST /api/decks/:id/snapshots/:snapshotId/revert error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * DELETE /api/decks/:id/snapshots/after/:snapshotId
 * Deletes all snapshots created after the given pivot snapshot.
 * Called before creating a new snapshot when the user edits after a restore.
 */
router.delete('/after/:snapshotId', async (req, res) => {
  try {
    const result = await deleteSnapshotsAfter(req.params.id, req.params.snapshotId);
    res.json(result);
  } catch (err) {
    if (err.message && err.message.startsWith('Snapshot not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('DELETE /api/decks/:id/snapshots/after/:snapshotId error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

module.exports = router;
