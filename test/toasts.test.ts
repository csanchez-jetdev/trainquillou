import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useToasts } from '~/composables/useToasts'

describe('useToasts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    const { items, resume } = useToasts()
    // The Nuxt test environment keeps one app across a file: start each case from empty.
    resume()
    items.value = []
  })

  afterEach(() => vi.useRealTimers())

  it('n\'empile pas deux fois le même message', () => {
    const { items, push } = useToasts()
    push('Choisissez une date.', 'error')
    push('Choisissez une date.', 'error')
    push('Choisissez une date.', 'error')
    expect(items.value).toHaveLength(1)
  })

  it('réarme le minuteur du doublon au lieu de le laisser expirer', () => {
    const { items, push } = useToasts()
    push('Choisissez une date.', 'error')
    vi.advanceTimersByTime(5000)
    push('Choisissez une date.', 'error')
    vi.advanceTimersByTime(5000)
    // Sans réarmement, le premier minuteur aurait expiré à 6000.
    expect(items.value).toHaveLength(1)
    vi.advanceTimersByTime(1500)
    expect(items.value).toHaveLength(0)
  })

  it('ne garde que les trois derniers', () => {
    const { items, push } = useToasts()
    for (const m of ['un', 'deux', 'trois', 'quatre']) push(m)
    expect(items.value.map((t) => t.message)).toEqual(['deux', 'trois', 'quatre'])
  })

  it('laisse à une erreur le temps d\'être lue', () => {
    const { items, push } = useToasts()
    push('Boum', 'error')
    vi.advanceTimersByTime(4500)
    expect(items.value).toHaveLength(1)
  })

  it('retient les toasts entre hold et resume', () => {
    const { items, push, hold, resume } = useToasts()
    push('Boum', 'error')
    hold()
    vi.advanceTimersByTime(60_000)
    expect(items.value).toHaveLength(1)
    resume()
    vi.advanceTimersByTime(6500)
    expect(items.value).toHaveLength(0)
  })

  it('n\'arme pas de minuteur pour un toast poussé pendant un hold', () => {
    const { items, push, hold, resume } = useToasts()
    hold()
    push('Boum', 'error')
    vi.advanceTimersByTime(60_000)
    expect(items.value).toHaveLength(1)
    resume()
  })
})
