/**
 * Query parameters reaching the upstream SNCF query.
 *
 * A station label is interpolated into an ODSQL string literal (`origine like "…"`) and a date
 * into a `refine` filter. Both are allowlisted here rather than escaped downstream: a label
 * carrying a quote or a backslash could close the literal and rewrite the upstream query.
 *
 * The allowlist covers the 341 labels of the dataset (letters, digits, space and `- ( ) ' . /`,
 * 32 characters at most) — `test/params.test.ts` checks that against the real list.
 */
const STATION_RE = /^[\p{L}\p{N} '()./-]{1,64}$/u
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** A station label in the shape the dataset writes them, or `null`. */
export function parseStation(value: unknown): string | null {
  const label = typeof value === 'string' ? value.trim() : ''
  return STATION_RE.test(label) ? label : null
}

/**
 * A calendar date as `YYYY-MM-DD`, or `null`.
 *
 * The round trip through `Date` is what rejects a well-formed but unreal `2026-02-31`: V8 does
 * not refuse it, it silently rolls it over to March 3rd.
 */
export function parseDate(value: unknown): string | null {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) || !date.toISOString().startsWith(value) ? null : value
}
