'use strict';

const path = require('path');
const fs = require('fs');

// Load .env from the server directory regardless of the process CWD.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');

// ── Ensure data directories exist at startup ──────────────────────────────────
// DATA_DIR is resolved relative to this file so the path is correct no matter
// where the process is started from. mkdirSync with { recursive: true } is a
// no-op when the directory already exists, so this is safe to call every boot.
const dataDir = path.resolve(__dirname, process.env.DATA_DIR || '../data');
const decksDir = path.join(dataDir, 'decks');
const cacheDir = path.join(dataDir, 'cache');
const gamesDir = path.join(dataDir, 'games');

fs.mkdirSync(decksDir, { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });
fs.mkdirSync(gamesDir, { recursive: true });

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ── API Routes ────────────────────────────────────────────────────────────────
// Routes are loaded conditionally to allow incremental development — missing
// stub files don't crash the server. Errors are logged with full stack traces
// so that real problems (syntax errors, bad imports) are immediately visible.
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
    console.log(`Health check: http://localhost:${PORT}/health`);
  });
}

module.exports = app;