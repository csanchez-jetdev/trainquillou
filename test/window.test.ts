import { describe, it, expect } from 'vitest'
import {
  BOOKING_WINDOW_DAYS,
  todayISO,
  lastBookableISO,
  isBookable,
  clampToWindow,
} from '~~/shared/window'

// Un mercredi, en heure d'été française (UTC+2).
const NOW = new Date(2026, 7, 1, 14, 30) // 1er août 2026

describe('fenêtre de réservation', () => {
  it('court sur 30 jours', () => {
    expect(BOOKING_WINDOW_DAYS).toBe(30)
    expect(todayISO(NOW)).toBe('2026-08-01')
    expect(lastBookableISO(NOW)).toBe('2026-08-31')
  })

  it('donne la date locale, pas la date UTC', () => {
    // 00h30 à Paris en août, c'est encore le 31 juillet à Greenwich : `toISOString()`
    // proposerait un jour déjà passé comme premier jour réservable.
    const justAfterMidnight = new Date(2026, 7, 1, 0, 30)
    expect(todayISO(justAfterMidnight)).toBe('2026-08-01')
    expect(justAfterMidnight.toISOString().slice(0, 10)).toBe('2026-07-31')
  })

  it('franchit correctement une fin de mois', () => {
    expect(lastBookableISO(new Date(2026, 11, 20))).toBe('2027-01-19')
  })

  it('accepte les bornes et refuse ce qui les dépasse', () => {
    expect(isBookable('2026-08-01', NOW)).toBe(true)
    expect(isBookable('2026-08-31', NOW)).toBe(true)
    expect(isBookable('2026-09-01', NOW)).toBe(false)
    expect(isBookable('2026-07-31', NOW)).toBe(false)
  })

  it('borne une plage au lieu de la refuser', () => {
    expect(clampToWindow('2026-09-30', NOW)).toBe('2026-08-31')
    expect(clampToWindow('2026-01-01', NOW)).toBe('2026-08-01')
    expect(clampToWindow('2026-08-14', NOW)).toBe('2026-08-14')
  })
})
