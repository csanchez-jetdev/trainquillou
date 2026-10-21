import { describe, it, expect } from 'vitest'
import { horizonDays } from '../app/utils/analytics'

describe('horizonDays', () => {
  it('counts the days between the search and the trip', () => {
    expect(horizonDays('2026-09-05', '2026-09-05')).toBe(0)
    expect(horizonDays('2026-09-12', '2026-09-05')).toBe(7)
    expect(horizonDays('2026-10-05', '2026-09-05')).toBe(30)
  })

  it('crosses a month and a year without drifting', () => {
    expect(horizonDays('2026-11-01', '2026-10-31')).toBe(1)
    expect(horizonDays('2027-01-01', '2026-12-31')).toBe(1)
    // 2028 is a leap year: February holds a 29th.
    expect(horizonDays('2028-03-01', '2028-02-28')).toBe(2)
  })

  it('survives the spring clock change, which shortens a day by an hour', () => {
    // Europe/Paris jumps to summer time on 29 March 2026.
    expect(horizonDays('2026-03-30', '2026-03-28')).toBe(2)
  })

  it('goes negative on a date already gone', () => {
    expect(horizonDays('2026-09-04', '2026-09-05')).toBe(-1)
  })
})
