import { describe, it, expect } from 'vitest'
import { cleanString, sameStation } from '~~/shared/normalize'

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
