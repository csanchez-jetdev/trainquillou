import { describe, it, expect } from 'vitest'
import { STATION_PAGES, cityName } from '~~/shared/stations'

// Les qualificatifs que le référentiel SNCF accole au nom de ville. Ils désignent un quai,
// pas une destination, et personne ne les tape dans une recherche.
const QUALIFIERS = /\b(Centre|Ville|Rive|Matabiau|Bourbon|Laud|Roch|Perrache|Part|Dieu|St|Saint)\b/

// Testé sur ce qui suit le premier mot : Saint-Brieuc est une ville, Bordeaux St Jean un quai.
const qualifier = (name: string) => QUALIFIERS.test(name.split(' ').slice(1).join(' '))

describe('nom de ville d\'une page gare', () => {
  it('ne garde pas le qualificatif de gare du référentiel', () => {
    for (const { slug } of STATION_PAGES) {
      expect(qualifier(cityName(slug)), `${slug} → ${cityName(slug)}`).toBe(false)
    }
  })

  it('restitue les accents que le référentiel a perdus', () => {
    expect(cityName('nimes')).toBe('Nîmes')
    expect(cityName('beziers')).toBe('Béziers')
    expect(cityName('angouleme')).toBe('Angoulême')
    expect(cityName('sete')).toBe('Sète')
  })

  it('retombe sur le libellé pour une gare sans entrée', () => {
    expect(cityName('brest')).toBe('Brest')
    expect(cityName('gare-inexistante')).toBe('Gare-Inexistante')
  })
})
