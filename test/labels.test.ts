import { describe, it, expect } from 'vitest'
import { prettyLabel, STATION_PAGES } from '~~/shared/stations'

describe('prettyLabel', () => {
  it('met en forme un libellé tout en majuscules', () => {
    expect(prettyLabel('MARSEILLE ST CHARLES')).toBe('Marseille St Charles')
  })

  it('conserve les sigles en majuscules', () => {
    expect(prettyLabel('AVIGNON TGV')).toBe('Avignon TGV')
    expect(prettyLabel('MONTELIMAR GARE SNCF')).toBe('Montelimar Gare SNCF')
    expect(prettyLabel('FRANKFURT AM MAIN HBF')).toBe('Frankfurt Am Main HBF')
  })

  it('retire le marqueur intramuros', () => {
    expect(prettyLabel('PARIS (intramuros)')).toBe('Paris')
    expect(prettyLabel('LYON (intramuros)')).toBe('Lyon')
  })

  it('capitalise après un tiret ou une apostrophe', () => {
    expect(prettyLabel("ST PIERRE D'OLERON")).toBe("St Pierre D'Oleron")
    expect(prettyLabel('RANG DU FLIERS VERTON BERCK')).toBe('Rang Du Fliers Verton Berck')
  })

  it('ne produit jamais de libellé vide pour une gare réelle', () => {
    for (const s of STATION_PAGES) {
      expect(prettyLabel(s.label).length, `libellé vide pour ${s.label}`).toBeGreaterThan(0)
    }
  })
})
