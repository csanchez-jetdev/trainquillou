import { describe, it, expect } from 'vitest'
import { prettyLabel, STATION_PAGES } from '~~/shared/stations'
import { tripDurationMin, formatDuration, fastestTrip, departureWindow } from '~~/app/utils/trains'

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

const train = (departure: string, arrival: string) => ({ departure, arrival, trainNumber: null })

describe('tripDurationMin', () => {
  it('calcule une durée simple', () => {
    expect(tripDurationMin(train('19:38', '22:17'))).toBe(159)
  })

  it('gère un trajet qui passe minuit', () => {
    // Sans rattrapage, la durée serait négative.
    expect(tripDurationMin(train('23:40', '01:15'))).toBe(95)
  })

  it('gère un trajet de moins d\'une heure', () => {
    expect(tripDurationMin(train('07:00', '07:45'))).toBe(45)
  })
})

describe('formatDuration', () => {
  it('formate heures et minutes', () => {
    expect(formatDuration(159)).toBe('2h39')
    expect(formatDuration(95)).toBe('1h35')
  })

  it('omet les minutes quand elles sont nulles', () => {
    expect(formatDuration(120)).toBe('2h')
  })

  it('formate les durées courtes en minutes', () => {
    expect(formatDuration(45)).toBe('45 min')
  })

  it('complète les minutes à deux chiffres', () => {
    expect(formatDuration(65)).toBe('1h05')
  })
})

describe('fastestTrip', () => {
  it('retient le trajet le plus court', () => {
    const trains = [train('07:00', '11:00'), train('09:00', '11:00'), train('12:00', '17:00')]
    expect(fastestTrip(trains)?.departure).toBe('09:00')
  })

  it('renvoie null sans train', () => {
    expect(fastestTrip([])).toBeNull()
  })
})

describe('departureWindow', () => {
  it('donne le premier et le dernier départ', () => {
    const trains = [train('17:52', '19:00'), train('07:50', '09:00'), train('19:51', '21:00')]
    expect(departureWindow(trains)).toEqual({ first: '07:50', last: '19:51' })
  })

  it('renvoie null sans train', () => {
    expect(departureWindow([])).toBeNull()
  })
})
