/**
 * Client-side MTGA text format parser.
 *
 * Mirrors server/services/mtgaService.js parseMtgaText so that the ImportModal
 * can preview a deck parse without a network round-trip.
 *
 * Supports:
 *   Simple format:          "{quantity} {card name}"
 *   Full MTGA Arena format: "{quantity} {card name} ({set}) {collector}"
 *   Section headers:        "Deck" / "Sideboard" / "Commander"
 *   Comments:               lines starting with "//"
 *
 * @module utils/mtgaFormat
 */

import type { ParsedDeck } from '../types'

/** Strips MTGA Arena set/collector suffix: " (FDN) 279", " (PRM) ★", etc. */
const MTGA_SUFFIX_RE = /\s+\([A-Z0-9]+\)\s+[\w★]+$/

/** Section header keywords emitted by the MTGA Arena export tool. */
const SECTION_HEADERS = new Set(['Deck', 'Sideboard', 'Commander'])

/**
 * Parses MTGA-formatted deck text into categorised card lists.
 *
 * Lines that cannot be parsed as valid card entries (not matching
 * "{quantity} {name}", and not comments/headers/blanks) are collected in
 * `unknownLines` and shown as warnings in the import preview. They do not
 * block the import.
 */
export function parseMtgaText(text: string | null | undefined): ParsedDeck {
  const normalised = (text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalised.split('\n')

  const mainboard: Array<{ quantity: number; name: string }> = []
  const sideboard: Array<{ quantity: number; name: string }> = []
  const unknownLines: string[] = []

  let inSideboard = false
  let hasMainboardCards = false

  for (const rawLine of lines) {
    const line = rawLine.trim()

    // Skip comment lines
    if (line.startsWith('//')) continue

    // Handle section header keywords
    if (SECTION_HEADERS.has(line)) {
      if (line !== 'Deck') inSideboard = true
      continue
    }

    // A blank line after at least one mainboard card switches to sideboard
    if (line === '') {
      if (hasMainboardCards && !inSideboard) inSideboard = true
      continue
    }

    // Try to match "{quantity} {card name [optional suffix]}"
    const match = line.match(/^(\d+)\s+(.+)$/)
    if (!match) {
      unknownLines.push(line)
      continue
    }

    const quantity = parseInt(match[1], 10)
    if (quantity <= 0) continue

    const name = match[2].trim().replace(MTGA_SUFFIX_RE, '').trim()
    if (inSideboard) {
      const existing = sideboard.find((c) => c.name === name)
      if (existing) {
        existing.quantity += quantity
      } else {
        sideboard.push({ quantity, name })
      }
    } else {
      const existing = mainboard.find((c) => c.name === name)
      if (existing) {
        existing.quantity += quantity
      } else {
        mainboard.push({ quantity, name })
        hasMainboardCards = true
      }
    }
  }

  return { mainboard, sideboard, unknownLines }
}
