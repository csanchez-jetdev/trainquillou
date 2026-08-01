import { describe, it, expect } from 'vitest'
import { tripDurationMin, formatDuration, fastestTrip, departureWindow } from '~/utils/trains'
import type { Train } from '~~/shared/types'

function train(departure: string, arrival: string, trainNumber: string | null = null): Train {
  return { departure, arrival, trainNumber }
}

describe('tripDurationMin', () => {
  it('mesure un trajet ordinaire', () => {
    expect(tripDurationMin(train('14:58', '17:48'))).toBe(170)
  })

  it('rattrape le passage de minuit', () => {
    // Sans rattrapage, 01:15 − 23:40 donnerait une durée négative.
    expect(tripDurationMin(train('23:40', '01:15'))).toBe(95)
  })

  it('accepte un trajet de moins d\'une heure', () => {
    expect(tripDurationMin(train('19:45', '20:34'))).toBe(49)
  })
})

describe('formatDuration', () => {
  it('affiche les minutes seules sous l\'heure', () => {
    expect(formatDuration(49)).toBe('49 min')
  })

  it('zéro-remplit les minutes pour rester alignable en colonne', () => {
    expect(formatDuration(63)).toBe('1h03')
  })

  it('omet les minutes sur une heure pleine', () => {
    expect(formatDuration(120)).toBe('2h')
  })
})

describe('fastestTrip', () => {
  it('retient le trajet le plus court, pas le premier départ', () => {
    const trains = [train('06:12', '12:00'), train('09:44', '11:40'), train('14:58', '18:30')]
    expect(fastestTrip(trains)?.departure).toBe('09:44')
  })

  it('compare correctement un train de nuit à un train de jour', () => {
    const trains = [train('23:40', '01:15'), train('08:00', '12:00')]
    expect(fastestTrip(trains)?.departure).toBe('23:40')
  })

  it('renvoie null sans horaire — le mode plage n\'en fournit aucun', () => {
    expect(fastestTrip([])).toBeNull()
  })
})

describe('departureWindow', () => {
  it('borne l\'amplitude des départs', () => {
    const trains = [train('14:58', '17:48'), train('06:12', '09:02'), train('21:25', '23:59')]
    expect(departureWindow(trains)).toEqual({ first: '06:12', last: '21:25' })
  })

  it('donne les mêmes bornes pour un train unique', () => {
    expect(departureWindow([train('07:46', '12:29')])).toEqual({ first: '07:46', last: '07:46' })
  })

  it('renvoie null sans horaire', () => {
    expect(departureWindow([])).toBeNull()
  })
})
