import { describe, it, expect } from 'vitest'
import { cleanString, isKnownStation, sameStation } from '~~/shared/normalize'

describe('cleanString', () => {
  it('lowercases, strips accents and punctuation', () => {
    expect(cleanString('Saint-Étienne-Châteaucreux')).toBe('saint etienne chateaucreux')
  })
  it('collapses parentheses and extra spaces', () => {
    expect(cleanString('PARIS (intramuros)')).toBe('paris intramuros')
  })
  it('handles empty input', () => {
    expect(cleanString('')).toBe('')
  })
})

describe('isKnownStation', () => {
  const stations = ['PARIS (intramuros)', 'MARSEILLE ST CHARLES', 'SAINT-ÉTIENNE CHÂTEAUCREUX']

  it('accepts a label of the list, whatever its case and accents', () => {
    expect(isKnownStation('paris intramuros', stations)).toBe(true)
    expect(isKnownStation('Saint-Etienne Chateaucreux', stations)).toBe(true)
  })
  it('rejects a prefix of a station', () => {
    expect(isKnownStation('marie', stations)).toBe(false)
    expect(isKnownStation('MARSEILLE', stations)).toBe(false)
  })
  it('accepts anything while the list is empty or the field blank', () => {
    expect(isKnownStation('marie', [])).toBe(true)
    expect(isKnownStation('  ', stations)).toBe(true)
  })
})

describe('sameStation', () => {
  it('matches identical normalized labels', () => {
    expect(sameStation('PARIS (intramuros)', 'paris intramuros')).toBe(true)
  })
  it('matches by containment', () => {
    expect(sameStation('LYON (intramuros)', 'Lyon')).toBe(true)
  })
  it('rejects unrelated labels', () => {
    expect(sameStation('NANTES', 'RENNES')).toBe(false)
  })
})
