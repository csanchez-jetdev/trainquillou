/**
 * Turns a notoriety score (number of Wikipedia editions for the city) into a display tier.
 * Thresholds set on the quartiles of the TGVmax destinations.
 */
export interface PopularityTier {
  tier: 0 | 1 | 2 | 3
  stars: string // '', '★', '★★', '★★★'
  label: string
}

export function popularityTier(score: number | undefined): PopularityTier {
  if (score == null) return { tier: 0, stars: '', label: '' }
  if (score >= 130) return { tier: 3, stars: '★★★', label: 'Incontournable' }
  if (score >= 80) return { tier: 2, stars: '★★', label: 'Populaire' }
  if (score >= 50) return { tier: 1, stars: '★', label: 'Connue' }
  return { tier: 0, stars: '', label: '' }
}
