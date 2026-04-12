'use strict';

const admin = require('firebase-admin');

/**
 * Express middleware that verifies Firebase ID tokens.
 * Attaches decoded token to `req.user` on success.
 * Returns 401 on missing or invalid tokens.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { requireAuth };
