import { describe, it, expect } from 'vitest'
import {
  BOOKING_WINDOW_DAYS,
  todayISO,
  lastBookableISO,
  isBookable,
  clampToWindow,
} from '~~/shared/window'

// Instants UTC explicites : construites en heure locale, ces dates feraient dépendre le
// test du fuseau de la machine — celui-là même que le module ne doit plus lire.
const NOON = new Date('2026-08-01T10:00:00Z')
const BEFORE_MIDNIGHT = new Date('2026-09-04T21:30:00Z')
const AFTER_MIDNIGHT = new Date('2026-09-04T22:40:00Z')

describe('fenêtre de réservation', () => {
  it('court sur 30 jours', () => {
    expect(BOOKING_WINDOW_DAYS).toBe(30)
    expect(todayISO(NOON)).toBe('2026-08-01')
    expect(lastBookableISO(NOON)).toBe('2026-08-31')
  })

  it('suit l\'heure de Paris de part et d\'autre de minuit', () => {
    expect(todayISO(BEFORE_MIDNIGHT)).toBe('2026-09-04')
    expect(todayISO(AFTER_MIDNIGHT)).toBe('2026-09-05')
    expect(lastBookableISO(AFTER_MIDNIGHT)).toBe('2026-10-05')
    // À cet instant Greenwich est encore la veille : c'est l'écart qui cassait l'hydratation.
    expect(AFTER_MIDNIGHT.toISOString().slice(0, 10)).toBe('2026-09-04')
  })

  it('ne perd pas de jour aux changements d\'heure', () => {
    // Une addition en millisecondes donnerait 2027-03-29 puis 2026-10-26.
    expect(lastBookableISO(new Date('2027-02-26T22:30:00Z'))).toBe('2027-03-28')
    expect(lastBookableISO(new Date('2026-09-26T22:30:00Z'))).toBe('2026-10-27')
  })

  it('franchit une fin de mois et une fin d\'année', () => {
    expect(lastBookableISO(new Date('2026-12-20T12:00:00Z'))).toBe('2027-01-19')
    expect(todayISO(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01')
    expect(lastBookableISO(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-31')
  })

  it('accepte les bornes et refuse ce qui les dépasse', () => {
    expect(isBookable('2026-08-01', NOON)).toBe(true)
    expect(isBookable('2026-08-31', NOON)).toBe(true)
    expect(isBookable('2026-09-01', NOON)).toBe(false)
    expect(isBookable('2026-07-31', NOON)).toBe(false)
  })

  it('borne une plage au lieu de la refuser', () => {
    expect(clampToWindow('2026-09-30', NOON)).toBe('2026-08-31')
    expect(clampToWindow('2026-01-01', NOON)).toBe('2026-08-01')
    expect(clampToWindow('2026-08-14', NOON)).toBe('2026-08-14')
  })
})
