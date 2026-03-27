'use strict';

/**
 * MTGA Service — converts between deck JSON and Magic: The Gathering Arena
 * plain-text import/export format.
 *
 * Two MTGA text format variants are supported:
 *
 *   Simple format (spec):
 *     "{quantity} {card name}"
 *     e.g. "4 Lightning Bolt"
 *
 *   Full MTGA Arena export format:
 *     "{quantity} {card name} ({set}) {collector}"
 *     e.g. "8 Mountain (FDN) 279"
 *     e.g. "1 Swamp (PRM) ★"        ← promo star symbol
 *     e.g. "2 Island (SLD) 2017F"   ← alphanumeric collector
 *     e.g. "4 Mountain (ZNR) 279a"  ← variant frame suffix
 *
 *   The Arena format also emits "Deck" / "Sideboard" / "Commander" section
 *   header keywords which are ignored / used to switch section mode.
 */

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * Converts a deck JSON object into an MTGA-formatted text string.
 *
 * @param {object} deck - Full deck object (cards[], sideboard[])
 * @returns {string} MTGA-formatted text
 */
function exportDeck(deck) {
  const mainLines = (deck.cards || [])
    .filter((c) => c.quantity > 0)
    .map((c) => `${c.quantity} ${c.name}`);

  const sideLines = (deck.sideboard || [])
    .filter((c) => c.quantity > 0)
    .map((c) => `${c.quantity} ${c.name}`);

  if (mainLines.length === 0 && sideLines.length === 0) return '';
  if (sideLines.length === 0) return mainLines.join('\n');
  if (mainLines.length === 0) return sideLines.join('\n');

  return [...mainLines, '', ...sideLines].join('\n');
}

// ── Import / Parse ────────────────────────────────────────────────────────────

/**
 * Regex that matches the MTGA Arena set/collector suffix appended to card names.
 *
 * Format: " (SET) collectorToken"
 *
 * The collector token matches one or more word characters (\w = [A-Za-z0-9_])
 * or the Unicode star character ★. This is intentionally permissive to handle:
 *   - Standard numeric:    " (FDN) 279"
 *   - Alphanumeric promo:  " (SLD) 2017F"
 *   - Variant frame:       " (ZNR) 279a"
 *   - Promo star:          " (PRM) ★"
 */
const MTGA_SUFFIX_RE = /\s+\([A-Z0-9]+\)\s+[\w★]+$/;

/**
 * Section header keywords emitted by MTGA Arena's export tool.
 */
const SECTION_HEADERS = new Set(['Deck', 'Sideboard', 'Commander']);

/**
 * Parses MTGA-formatted text into categorised card lists.
 *
 * Parsing rules:
 *   - Line endings are normalised (CRLF → LF).
 *   - Lines starting with "//" are comments and skipped.
 *   - "Deck" header is silently ignored; "Sideboard"/"Commander" switch to sideboard.
 *   - A blank line after at least one mainboard card also switches to sideboard.
 *   - Card lines: "{quantity} {name}" — optional " ({SET}) {collector}" suffix is stripped.
 *   - Quantity ≤ 0 is skipped.
 *   - `unknown[]` is always empty from the parser; callers populate it post-lookup.
 *
 * @param {string} text
 * @returns {{ mainboard: Array<{quantity: number, name: string}>,
 *             sideboard: Array<{quantity: number, name: string}>,
 *             unknown:  string[] }}
 */
function parseMtgaText(text) {
  const normalised = (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalised.split('\n');

  /** @type {Array<{quantity: number, name: string}>} */
  const mainboard = [];
  /** @type {Array<{quantity: number, name: string}>} */
  const sideboard = [];

  let inSideboard = false;
  let hasMainboardCards = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith('//')) continue;

    if (SECTION_HEADERS.has(line)) {
      if (line !== 'Deck') inSideboard = true;
      continue;
    }

    if (line === '') {
      if (hasMainboardCards && !inSideboard) inSideboard = true;
      continue;
    }

    const match = line.match(/^(\d+)\s+(.+)$/);
    if (!match) continue;

    const quantity = parseInt(match[1], 10);
    if (quantity <= 0) continue;

    const rawName = match[2].trim();
    const name = rawName.replace(MTGA_SUFFIX_RE, '').trim();

    const card = { quantity, name };

    if (inSideboard) {
      sideboard.push(card);
    } else {
      mainboard.push(card);
      hasMainboardCards = true;
    }
  }

  return { mainboard, sideboard, unknown: [] };
}

module.exports = { exportDeck, parseMtgaText };