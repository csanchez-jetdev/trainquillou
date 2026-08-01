import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseStation, parseDate } from '~~/server/utils/params'

/** Les 341 libellés réellement présents dans le dataset TGVmax. */
const TGVMAX_LABELS: string[] = JSON.parse(
  readFileSync(resolve(process.cwd(), 'test/fixtures/tgvmax-labels.json'), 'utf8'),
)

const hasC1 = (s: string) => [...s].some((c) => c.charCodeAt(0) >= 0x80 && c.charCodeAt(0) <= 0x9F)

describe('parseStation', () => {
  it('accepte les libellés du dataset, sauf celui dont l\'encodage est cassé', () => {
    const rejected = TGVMAX_LABELS.filter((l) => parseStation(l) === null)
    // Le libellé d'Angoulême porte un caractère de contrôle C1 et double une gare déjà listée ;
    // il est déjà écarté de l'autocomplétion (isMangled, server/utils/sncf.ts).
    expect(rejected).toHaveLength(1)
    expect(hasC1(rejected[0]!)).toBe(true)
  })

  it('refuse ce qui pourrait refermer le littéral ODSQL', () => {
    expect(parseStation('PARIS" or 1=1 --')).toBeNull()
    expect(parseStation('PARIS\\')).toBeNull()
    expect(parseStation('PA\nRIS')).toBeNull()
    expect(parseStation('A'.repeat(65))).toBeNull()
    expect(parseStation('')).toBeNull()
    expect(parseStation(undefined)).toBeNull()
    expect(parseStation(['PARIS'])).toBeNull()
  })

  it('tolère les espaces autour', () => {
    expect(parseStation('  LYON (intramuros) ')).toBe('LYON (intramuros)')
  })
})

describe('parseDate', () => {
  it('accepte une date ISO réelle', () => {
    expect(parseDate('2026-08-01')).toBe('2026-08-01')
    expect(parseDate('2028-02-29')).toBe('2028-02-29')
  })

  it('refuse une date malformée, inexistante ou injectée', () => {
    expect(parseDate('2026-02-31')).toBeNull()
    expect(parseDate('2026-13-01')).toBeNull()
    expect(parseDate('2026-8-1')).toBeNull()
    expect(parseDate('2026-08-01\' or date > date\'2000-01-01')).toBeNull()
    expect(parseDate(undefined)).toBeNull()
  })
})
