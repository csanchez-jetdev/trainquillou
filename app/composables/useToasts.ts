export interface Toast {
  id: number
  message: string
  kind: 'error' | 'info'
}

/** A message that vanishes before it can be read breaks WCAG 2.2.1. */
const LIFETIME: Record<Toast['kind'], number> = { error: 6000, info: 4000 }
const MAX_VISIBLE = 3

let nextId = 0
/** Timers are not serialisable, so they live beside the state rather than in it. */
const timers = new Map<number, ReturnType<typeof setTimeout>>()
let held = false

export function useToasts() {
  const items = useState<Toast[]>('toasts', () => [])

  function forget(id: number) {
    clearTimeout(timers.get(id))
    timers.delete(id)
  }

  function dismiss(id: number) {
    forget(id)
    items.value = items.value.filter((t) => t.id !== id)
  }

  function arm(toast: Toast) {
    forget(toast.id)
    if (held) return
    timers.set(toast.id, setTimeout(() => dismiss(toast.id), LIFETIME[toast.kind]))
  }

  function push(message: string, kind: Toast['kind'] = 'info'): number {
    const last = items.value.at(-1)
    if (last?.message === message) {
      arm(last)
      return last.id
    }
    const toast: Toast = { id: ++nextId, message, kind }
    const next = [...items.value, toast]
    next.slice(0, Math.max(0, next.length - MAX_VISIBLE)).forEach((t) => forget(t.id))
    items.value = next.slice(-MAX_VISIBLE)
    arm(toast)
    return toast.id
  }

  function hold() {
    held = true
    items.value.forEach((t) => forget(t.id))
  }

  function resume() {
    held = false
    items.value.forEach((t) => arm(t))
  }

  return { items, push, dismiss, hold, resume }
}
