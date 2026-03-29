'use strict';

const { exportDeck, parseMtgaText } = require('./mtgaService');

// ── exportDeck ────────────────────────────────────────────────────────────────

describe('exportDeck', () => {
  const mainCard = (quantity, name) => ({ quantity, name, scryfall_id: 'x', section: 'mainboard' });
  const sideCard = (quantity, name) => ({ quantity, name, scryfall_id: 'x', section: 'sideboard' });

  it('formats each mainboard card as "{quantity} {name}"', () => {
    const deck = { cards: [mainCard(4, 'Lightning Bolt')], sideboard: [] };
    expect(exportDeck(deck)).toBe('4 Lightning Bolt');
  });

  it('separates mainboard and sideboard with a blank line', () => {
    const deck = {
      cards: [mainCard(4, 'Lightning Bolt')],
      sideboard: [sideCard(2, 'Smash to Smithereens')],
    };
    expect(exportDeck(deck)).toBe('4 Lightning Bolt\n\n2 Smash to Smithereens');
  });

  it('outputs multiple mainboard cards one per line', () => {
    const deck = {
      cards: [mainCard(4, 'Lightning Bolt'), mainCard(2, 'Mountain')],
      sideboard: [],
    };
    expect(exportDeck(deck)).toBe('4 Lightning Bolt\n2 Mountain');
  });

  it('returns empty string for a deck with no cards', () => {
    expect(exportDeck({ cards: [], sideboard: [] })).toBe('');
    expect(exportDeck({})).toBe('');
  });

  it('omits cards with quantity of 0', () => {
    const deck = { cards: [mainCard(0, 'Lightning Bolt'), mainCard(4, 'Mountain')], sideboard: [] };
    expect(exportDeck(deck)).toBe('4 Mountain');
  });

  it('omits cards with negative quantity', () => {
    const deck = { cards: [mainCard(-1, 'Lightning Bolt'), mainCard(4, 'Mountain')], sideboard: [] };
    expect(exportDeck(deck)).toBe('4 Mountain');
  });

  it('does not add a blank separator when sideboard is empty', () => {
    const deck = { cards: [mainCard(4, 'Lightning Bolt')], sideboard: [] };
    expect(exportDeck(deck)).not.toContain('\n\n');
  });

  it('does not add a leading blank line when only sideboard has cards', () => {
    const deck = { cards: [], sideboard: [sideCard(2, 'Smash to Smithereens')] };
    const text = exportDeck(deck);
    expect(text).toBe('2 Smash to Smithereens');
    expect(text.startsWith('\n')).toBe(false);
  });

  it('handles missing cards and sideboard properties gracefully', () => {
    expect(exportDeck({})).toBe('');
  });
});

// ── parseMtgaText — (a) simple '{qty} {name}' format ─────────────────────────

describe('parseMtgaText — simple format', () => {
  it('parses a basic mainboard-only deck', () => {
    const { mainboard, sideboard } = parseMtgaText('4 Lightning Bolt\n2 Mountain');
    expect(mainboard).toEqual([
      { quantity: 4, name: 'Lightning Bolt' },
      { quantity: 2, name: 'Mountain' },
    ]);
    expect(sideboard).toHaveLength(0);
  });

  it('ignores malformed lines (no quantity prefix)', () => {
    const { mainboard } = parseMtgaText('Lightning Bolt\n4 Mountain');
    expect(mainboard).toEqual([{ quantity: 4, name: 'Mountain' }]);
  });

  it('trims whitespace from card names', () => {
    const { mainboard } = parseMtgaText('4 Lightning Bolt   ');
    expect(mainboard[0].name).toBe('Lightning Bolt');
  });

  it('handles empty string input', () => {
    expect(parseMtgaText('')).toEqual({ mainboard: [], sideboard: [], unknown: [] });
  });

  it('handles null/undefined input gracefully', () => {
    expect(() => parseMtgaText(null)).not.toThrow();
    expect(() => parseMtgaText(undefined)).not.toThrow();
  });

  it('always returns unknown as an empty array', () => {
    expect(parseMtgaText('4 Lightning Bolt').unknown).toEqual([]);
  });
});

// ── parseMtgaText — (b) full MTGA Arena '{qty} {name} ({set}) {collector}' ───

describe('parseMtgaText — MTGA Arena export format', () => {
  it('strips numeric set/collector suffix from name', () => {
    const { mainboard } = parseMtgaText('8 Mountain (FDN) 279');
    expect(mainboard[0].name).toBe('Mountain');
    expect(mainboard[0].quantity).toBe(8);
    expect(mainboard[0].set_code).toBe('FDN');
    expect(mainboard[0].collector_number).toBe('279');
  });

  it('handles multi-word names with set suffix', () => {
    const { mainboard } = parseMtgaText('2 Dawnwing Marshal (FDN) 570');
    expect(mainboard[0].name).toBe('Dawnwing Marshal');
    expect(mainboard[0].set_code).toBe('FDN');
    expect(mainboard[0].collector_number).toBe('570');
  });

  it('handles comma in name before set suffix', () => {
    const { mainboard } = parseMtgaText('1 Aurelia, the Warleader (FDN) 651');
    expect(mainboard[0].name).toBe('Aurelia, the Warleader');
    expect(mainboard[0].set_code).toBe('FDN');
    expect(mainboard[0].collector_number).toBe('651');
  });

  it('handles apostrophe in name before set suffix', () => {
    const { mainboard } = parseMtgaText("2 Teferi's Protection (CMR) 46");
    expect(mainboard[0].name).toBe("Teferi's Protection");
    expect(mainboard[0].set_code).toBe('CMR');
    expect(mainboard[0].collector_number).toBe('46');
  });

  it('handles different set codes', () => {
    const text = "1 Great Train Heist (OTJ) 125\n2 Warleader's Call (MKM) 242";
    const { mainboard } = parseMtgaText(text);
    expect(mainboard[0].name).toBe('Great Train Heist');
    expect(mainboard[1].name).toBe("Warleader's Call");
  });

  it('does not modify simple-format cards (no regression)', () => {
    const { mainboard } = parseMtgaText('4 Lightning Bolt');
    expect(mainboard[0].name).toBe('Lightning Bolt');
  });

  // (h) promo collector token ★
  it('captures promo star (★) collector number', () => {
    const { mainboard } = parseMtgaText('1 Swamp (PRM) ★');
    expect(mainboard[0].name).toBe('Swamp');
    expect(mainboard[0].set_code).toBe('PRM');
    expect(mainboard[0].collector_number).toBe('★');
  });

  it('captures alphanumeric promo collector number', () => {
    const { mainboard } = parseMtgaText('2 Island (SLD) 2017F');
    expect(mainboard[0].name).toBe('Island');
    expect(mainboard[0].set_code).toBe('SLD');
    expect(mainboard[0].collector_number).toBe('2017F');
  });

  it('captures variant frame collector suffix (e.g. 279a)', () => {
    const { mainboard } = parseMtgaText('4 Mountain (ZNR) 279a');
    expect(mainboard[0].name).toBe('Mountain');
    expect(mainboard[0].set_code).toBe('ZNR');
    expect(mainboard[0].collector_number).toBe('279a');
  });
});

// ── parseMtgaText — (c) 'Deck' header line is ignored ────────────────────────

describe('parseMtgaText — Deck header', () => {
  it('ignores the "Deck" header without dropping cards', () => {
    const text = 'Deck\n4 Lightning Bolt\n2 Mountain';
    const { mainboard } = parseMtgaText(text);
    expect(mainboard).toHaveLength(2);
    expect(mainboard[0]).toEqual({ quantity: 4, name: 'Lightning Bolt' });
    expect(mainboard[1]).toEqual({ quantity: 2, name: 'Mountain' });
  });

  it('deck with only a Deck header and no cards produces empty arrays', () => {
    const { mainboard, sideboard } = parseMtgaText('Deck');
    expect(mainboard).toHaveLength(0);
    expect(sideboard).toHaveLength(0);
  });
});

// ── parseMtgaText — (d) 'Sideboard' keyword switches section ─────────────────

describe('parseMtgaText — Sideboard keyword', () => {
  it('cards after "Sideboard" keyword go to sideboard', () => {
    const text = 'Deck\n4 Lightning Bolt\nSideboard\n2 Smash to Smithereens';
    const { mainboard, sideboard } = parseMtgaText(text);
    expect(mainboard).toEqual([{ quantity: 4, name: 'Lightning Bolt' }]);
    expect(sideboard).toEqual([{ quantity: 2, name: 'Smash to Smithereens' }]);
  });

  it('"Commander" keyword also switches to sideboard section', () => {
    const text = 'Deck\n4 Lightning Bolt\nCommander\n1 Atraxa';
    const { mainboard, sideboard } = parseMtgaText(text);
    expect(mainboard).toHaveLength(1);
    expect(sideboard).toHaveLength(1);
  });

  it('blank line then Sideboard keyword does not produce duplicate section switch', () => {
    const text = 'Deck\n4 Lightning Bolt\n\nSideboard\n2 Smash to Smithereens';
    const { mainboard, sideboard } = parseMtgaText(text);
    expect(mainboard).toHaveLength(1);
    expect(sideboard).toHaveLength(1);
  });
});

// ── parseMtgaText — (e) blank-line separator ──────────────────────────────────

describe('parseMtgaText — blank-line section separator', () => {
  it('splits mainboard and sideboard on a blank line', () => {
    const text = '4 Lightning Bolt\n\n2 Smash to Smithereens';
    const { mainboard, sideboard } = parseMtgaText(text);
    expect(mainboard).toEqual([{ quantity: 4, name: 'Lightning Bolt' }]);
    expect(sideboard).toEqual([{ quantity: 2, name: 'Smash to Smithereens' }]);
  });

  it('handles multiple consecutive blank lines as a single separator', () => {
    const text = '4 Lightning Bolt\n\n\n\n2 Smash to Smithereens';
    const { mainboard, sideboard } = parseMtgaText(text);
    expect(mainboard).toHaveLength(1);
    expect(sideboard).toHaveLength(1);
  });

  it('does not switch to sideboard for blank lines before any mainboard card', () => {
    const text = '\n\n4 Lightning Bolt';
    const { mainboard, sideboard } = parseMtgaText(text);
    expect(mainboard).toEqual([{ quantity: 4, name: 'Lightning Bolt' }]);
    expect(sideboard).toHaveLength(0);
  });
});

// ── parseMtgaText — (f) '//' comment lines are skipped ───────────────────────

describe('parseMtgaText — comment lines', () => {
  it('ignores lines starting with //', () => {
    const text = '// My Deck\n4 Lightning Bolt\n// sideboard below\n\n2 Smash to Smithereens';
    const { mainboard, sideboard } = parseMtgaText(text);
    expect(mainboard).toEqual([{ quantity: 4, name: 'Lightning Bolt' }]);
    expect(sideboard).toEqual([{ quantity: 2, name: 'Smash to Smithereens' }]);
  });

  it('a deck consisting only of comment lines produces empty arrays', () => {
    const { mainboard, sideboard } = parseMtgaText('// nothing here\n// nope');
    expect(mainboard).toHaveLength(0);
    expect(sideboard).toHaveLength(0);
  });
});

// ── parseMtgaText — (g) quantity ≤ 0 lines are skipped ───────────────────────

describe('parseMtgaText — invalid quantities', () => {
  it('skips cards with quantity of 0', () => {
    const { mainboard } = parseMtgaText('0 Lightning Bolt\n4 Mountain');
    expect(mainboard).toEqual([{ quantity: 4, name: 'Mountain' }]);
  });

  it('skips cards with negative quantity', () => {
    const { mainboard } = parseMtgaText('-1 Lightning Bolt\n4 Mountain');
    expect(mainboard).toEqual([{ quantity: 4, name: 'Mountain' }]);
  });
});

// ── parseMtgaText — (i) multi-printing deduplication ─────────────────────────

describe('parseMtgaText — multi-printing deduplication', () => {
  it('merges two printings of the same mainboard card into one entry', () => {
    const text = '1 Wind-Scarred Crag (FDN) 271\n3 Wind-Scarred Crag (M21) 259';
    const { mainboard } = parseMtgaText(text);
    expect(mainboard).toHaveLength(1);
    // set_code/collector_number come from the first occurrence
    expect(mainboard[0]).toEqual({ quantity: 4, name: 'Wind-Scarred Crag', set_code: 'FDN', collector_number: '271' });
  });

  it('merges two printings of the same sideboard card into one entry', () => {
    const text = '4 Lightning Bolt\n\n1 Smash to Smithereens (FDN) 1\n2 Smash to Smithereens (M21) 2';
    const { sideboard } = parseMtgaText(text);
    expect(sideboard).toHaveLength(1);
    expect(sideboard[0]).toEqual({ quantity: 3, name: 'Smash to Smithereens', set_code: 'FDN', collector_number: '1' });
  });

  it('sums quantities correctly across more than two printings', () => {
    const text = '2 Mountain (FDN) 279\n3 Mountain (M21) 100\n1 Mountain (ZNR) 280';
    const { mainboard } = parseMtgaText(text);
    expect(mainboard).toHaveLength(1);
    expect(mainboard[0]).toEqual({ quantity: 6, name: 'Mountain', set_code: 'FDN', collector_number: '279' });
  });
});

// ── parseMtgaText — (j) CRLF line endings ────────────────────────────────────

describe('parseMtgaText — line endings', () => {
  it('handles Windows CRLF line endings', () => {
    const text = '4 Lightning Bolt\r\n\r\n2 Smash to Smithereens';
    const { mainboard, sideboard } = parseMtgaText(text);
    expect(mainboard).toEqual([{ quantity: 4, name: 'Lightning Bolt' }]);
    expect(sideboard).toEqual([{ quantity: 2, name: 'Smash to Smithereens' }]);
  });

  it('handles Unix LF line endings', () => {
    const text = '4 Lightning Bolt\n\n2 Smash to Smithereens';
    const { mainboard, sideboard } = parseMtgaText(text);
    expect(mainboard).toHaveLength(1);
    expect(sideboard).toHaveLength(1);
  });

  it('handles lone CR line endings', () => {
    const text = '4 Lightning Bolt\r2 Mountain';
    const { mainboard } = parseMtgaText(text);
    expect(mainboard).toHaveLength(2);
  });
});

// ── Full 23-entry sample deck ─────────────────────────────────────────────────
//
// The sample deck in Task 2.01 has 23 distinct card entries (lines), totalling
// 61 cards by quantity. The original requirements description stated "24-card"
// in error — the actual sample contains exactly 23 card lines and no sideboard.
// Acceptance criteria have been formally updated to "23-entry" in TASKS.md.

describe('parseMtgaText — 23-entry MTGA Arena sample deck', () => {
  const SAMPLE = [
    'Deck',
    '8 Mountain (FDN) 279',
    '2 Dawnwing Marshal (FDN) 570',
    '2 Resolute Reinforcements (FDN) 145',
    '2 Valorous Stance (FDN) 583',
    '3 Crusader of Odric (FDN) 569',
    '2 Dauntless Veteran (FDN) 8',
    '1 Aurelia, the Warleader (FDN) 651',
    '2 Boros Guildgate (FDN) 684',
    '2 Burst Lightning (FDN) 192',
    '9 Plains (FDN) 273',
    '4 Dragon Fodder (FDN) 535',
    '2 Krenko, Mob Boss (FDN) 204',
    '2 Frenzied Goblin (FDN) 199',
    '4 Wind-Scarred Crag (FDN) 271',
    '1 Temple of Triumph (FDN) 705',
    '1 Searslicer Goblin (FDN) 93',
    '3 Fanatical Firebrand (FDN) 195',
    '2 Serra Angel (FDN) 147',
    '2 Release the Dogs (FDN) 580',
    '2 Goblin Surprise (FDN) 200',
    '1 Great Train Heist (OTJ) 125',
    '2 Impact Tremors (FDN) 717',
    "2 Warleader's Call (MKM) 242",
  ].join('\n');

  it('produces exactly 23 mainboard entries and 0 sideboard entries', () => {
    const { mainboard, sideboard } = parseMtgaText(SAMPLE);
    expect(mainboard).toHaveLength(23);
    expect(sideboard).toHaveLength(0);
  });

  it('total card quantity is 61', () => {
    const { mainboard } = parseMtgaText(SAMPLE);
    const total = mainboard.reduce((sum, c) => sum + c.quantity, 0);
    expect(total).toBe(61);
  });

  it('spot-checks clean card names', () => {
    const { mainboard } = parseMtgaText(SAMPLE);
    expect(mainboard.find((c) => c.name === 'Mountain')).toBeDefined();
    expect(mainboard.find((c) => c.name === 'Aurelia, the Warleader')).toBeDefined();
    expect(mainboard.find((c) => c.name === "Warleader's Call")).toBeDefined();
    expect(mainboard.find((c) => c.name === 'Great Train Heist')).toBeDefined();
  });

  it('no entry retains a set/collector suffix', () => {
    const { mainboard } = parseMtgaText(SAMPLE);
    for (const card of mainboard) {
      expect(card.name).not.toMatch(/\([A-Z0-9]+\)\s+[\w★]+/);
    }
  });
});

// ── Round-trip ────────────────────────────────────────────────────────────────

describe('Round-trip: exportDeck → parseMtgaText', () => {
  it('preserves mainboard card counts', () => {
    const deck = {
      cards: [
        { quantity: 4, name: 'Lightning Bolt', scryfall_id: 'a', section: 'mainboard' },
        { quantity: 2, name: 'Mountain', scryfall_id: 'b', section: 'mainboard' },
      ],
      sideboard: [],
    };
    const { mainboard } = parseMtgaText(exportDeck(deck));
    expect(mainboard.reduce((s, c) => s + c.quantity, 0)).toBe(6);
  });

  it('preserves sideboard card counts', () => {
    const deck = {
      cards: [{ quantity: 4, name: 'Lightning Bolt', scryfall_id: 'a', section: 'mainboard' }],
      sideboard: [
        { quantity: 2, name: 'Smash to Smithereens', scryfall_id: 'b', section: 'sideboard' },
        { quantity: 3, name: 'Relic of Progenitus', scryfall_id: 'c', section: 'sideboard' },
      ],
    };
    const { mainboard, sideboard } = parseMtgaText(exportDeck(deck));
    expect(mainboard.reduce((s, c) => s + c.quantity, 0)).toBe(4);
    expect(sideboard.reduce((s, c) => s + c.quantity, 0)).toBe(5);
  });

  it('preserves card names', () => {
    const deck = {
      cards: [
        { quantity: 4, name: 'Lightning Bolt', scryfall_id: 'a', section: 'mainboard' },
        { quantity: 2, name: "Teferi's Protection", scryfall_id: 'b', section: 'mainboard' },
      ],
      sideboard: [{ quantity: 1, name: 'Rest in Peace', scryfall_id: 'c', section: 'sideboard' }],
    };
    const { mainboard, sideboard } = parseMtgaText(exportDeck(deck));
    expect(mainboard.map((c) => c.name)).toEqual(deck.cards.map((c) => c.name));
    expect(sideboard.map((c) => c.name)).toEqual(deck.sideboard.map((c) => c.name));
  });
});