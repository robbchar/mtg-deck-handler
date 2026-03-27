'use strict';

/**
 * Request validation middleware.
 *
 * Each exported function is an Express middleware that validates req.body
 * fields and returns 400 with a JSON error message if validation fails.
 * All field constraints are kept minimal — only what the spec requires.
 */

/**
 * Validate a deck name field.
 * Used by POST /api/decks and PUT /api/decks/:id.
 */
function validateDeckName(req, res, next) {
  const { name } = req.body || {};

  // name is required on creation (POST). On update (PUT) it's optional.
  if (req.method === 'POST') {
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'name is required and must be a non-empty string' });
    }
  } else if (name !== undefined) {
    // If name is provided on a PUT it must still be a non-empty string.
    if (typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'name must be a non-empty string' });
    }
  }

  next();
}

/**
 * Validate the body of POST /api/import.
 * Requires `text` and `name` (non-empty strings). `format` is optional.
 */
function validateImport(req, res, next) {
  const { text, name } = req.body || {};

  if (!text || typeof text !== 'string' || text.trim() === '') {
    return res.status(400).json({ error: 'text is required and must be a non-empty string' });
  }

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'name is required and must be a non-empty string' });
  }

  next();
}

module.exports = { validateDeckName, validateImport };
