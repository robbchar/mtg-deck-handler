'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { requireAuth } = require('./middleware/auth');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// All API routes require a valid Firebase ID token
app.use('/api', requireAuth);

// ── API Routes ────────────────────────────────────────────────────────────────
try {
  const deckRoutes = require('./routes/decks');
  app.use('/api/decks', deckRoutes);
} catch (err) {
  console.error('Optional route not loaded (routes/decks):', err.stack);
}

try {
  const cardRoutes = require('./routes/cards');
  app.use('/api/cards', cardRoutes);
} catch (err) {
  console.error('Optional route not loaded (routes/cards):', err.stack);
}

try {
  const importExportRoutes = require('./routes/importExport');
  app.use('/api', importExportRoutes);
} catch (err) {
  console.error('Optional route not loaded (routes/importExport):', err.stack);
}

try {
  const gameRoutes = require('./routes/games');
  app.use('/api/decks/:id/games', gameRoutes);
} catch (err) {
  console.error('Optional route not loaded (routes/games):', err.stack);
}

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Start server (only when run directly, not when required by tests) ─────────
const PORT = process.env.PORT || 3001;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`MTG Deck Manager server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
