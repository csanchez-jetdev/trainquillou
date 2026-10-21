import { describe, it, expect } from 'vitest'
import { seoTitle, seoDescription } from '../shared/seo'

describe('seoTitle', () => {
  it('signs the title when the brand still fits', () => {
    expect(seoTitle('TGVmax depuis Lyon')).toBe('TGVmax depuis Lyon — Trainquillou')
  })

  it('drops the brand rather than overflow', () => {
    const core = 'TGVmax Valence TGV Auvergne Rhone Alpes → Aix En Provence TGV'
    expect(seoTitle(core)).toBe(core)
  })
})

describe('seoDescription', () => {
  it('joins the sentences that fit and drops the rest', () => {
    const long = `${'A'.repeat(140)}.`
    const kept = seoDescription(long, 'Carte, dates et horaires.', 'Gratuit.')
    expect(kept).toBe(`${long} Gratuit.`)
    expect(kept.length).toBeLessThanOrEqual(160)
  })
})
