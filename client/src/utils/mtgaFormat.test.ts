import { describe, it, expect } from 'vitest'
import { parseMtgaText } from './mtgaFormat'

describe('parseMtgaText — basic parsing', () => {
  it('parses a mainboard-only deck', () => {
    const { mainboard, sideboard } = parseMtgaText('4 Lightning Bolt\n2 Mountain')
    expect(mainboard).toEqual([
      { quantity: 4, name: 'Lightning Bolt' },
      { quantity: 2, name: 'Mountain' },
    ])
    expect(sideboard).toHaveLength(0)
  })

  it('splits mainboard and sideboard on a blank line', () => {
    const { mainboard, sideboard } = parseMtgaText('4 Lightning Bolt\n\n2 Smash to Smithereens')
    expect(mainboard).toEqual([{ quantity: 4, name: 'Lightning Bolt' }])
    expect(sideboard).toEqual([{ quantity: 2, name: 'Smash to Smithereens' }])
  })

  it('handles null/undefined input gracefully', () => {
    expect(() => parseMtgaText(null)).not.toThrow()
    expect(() => parseMtgaText(undefined)).not.toThrow()
  })

  it('returns empty arrays for empty input', () => {
    const { mainboard, sideboard, unknownLines } = parseMtgaText('')
    expect(mainboard).toHaveLength(0)
    expect(sideboard).toHaveLength(0)
    expect(unknownLines).toHaveLength(0)
  })
})

describe('parseMtgaText — MTGA Arena export format', () => {
  it('strips set/collector suffix from card names', () => {
    const { mainboard } = parseMtgaText('4 Wind-Scarred Crag (FDN) 271')
    expect(mainboard[0].name).toBe('Wind-Scarred Crag')
  })

  it('captures set_code and collector_number', () => {
    const { mainboard } = parseMtgaText('4 Wind-Scarred Crag (FDN) 271')
    expect(mainboard[0].set_code).toBe('FDN')
    expect(mainboard[0].collector_number).toBe('271')
  })

  it('captures alphanumeric collector numbers', () => {
    const { mainboard } = parseMtgaText('2 Island (SLD) 2017F')
    expect(mainboard[0].set_code).toBe('SLD')
    expect(mainboard[0].collector_number).toBe('2017F')
  })

  it('captures promo star collector number', () => {
    const { mainboard } = parseMtgaText('1 Swamp (PRM) ★')
    expect(mainboard[0].name).toBe('Swamp')
    expect(mainboard[0].set_code).toBe('PRM')
    expect(mainboard[0].collector_number).toBe('★')
  })

  it('leaves set_code and collector_number undefined for simple format lines', () => {
    const { mainboard } = parseMtgaText('4 Lightning Bolt')
    expect(mainboard[0].set_code).toBeUndefined()
    expect(mainboard[0].collector_number).toBeUndefined()
  })
})

describe('parseMtgaText — multi-printing deduplication', () => {
  it('merges two printings of the same mainboard card into one entry', () => {
    const text = '1 Wind-Scarred Crag (FDN) 271\n3 Wind-Scarred Crag (M21) 259'
    const { mainboard } = parseMtgaText(text)
    expect(mainboard).toHaveLength(1)
    // set_code/collector_number come from the first occurrence
    expect(mainboard[0]).toEqual({
      quantity: 4,
      name: 'Wind-Scarred Crag',
      set_code: 'FDN',
      collector_number: '271',
    })
  })

  it('merges two printings of the same sideboard card into one entry', () => {
    const text = '4 Lightning Bolt\n\n1 Smash to Smithereens (FDN) 1\n2 Smash to Smithereens (M21) 2'
    const { sideboard } = parseMtgaText(text)
    expect(sideboard).toHaveLength(1)
    expect(sideboard[0]).toEqual({
      quantity: 3,
      name: 'Smash to Smithereens',
      set_code: 'FDN',
      collector_number: '1',
    })
  })

  it('sums quantities correctly across more than two printings', () => {
    const text = '2 Mountain (FDN) 279\n3 Mountain (M21) 100\n1 Mountain (ZNR) 280'
    const { mainboard } = parseMtgaText(text)
    expect(mainboard).toHaveLength(1)
    expect(mainboard[0]).toEqual({
      quantity: 6,
      name: 'Mountain',
      set_code: 'FDN',
      collector_number: '279',
    })
  })

  it('does not merge cards with different names', () => {
    const text = '4 Lightning Bolt (FDN) 1\n2 Mountain (FDN) 2'
    const { mainboard } = parseMtgaText(text)
    expect(mainboard).toHaveLength(2)
  })
})
