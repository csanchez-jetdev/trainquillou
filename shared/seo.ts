/** Bing rejects a title over 60 characters and a description outside 25 to 160. */
const BRAND = ' — Trainquillou'
const MAX_TITLE = 60
const MAX_DESCRIPTION = 160

export function seoTitle(core: string): string {
  return core.length + BRAND.length <= MAX_TITLE ? core + BRAND : core
}

/** Keeps the sentences that fit, in order: the trailing ones carry the least. */
export function seoDescription(...sentences: string[]): string {
  return sentences.reduce((kept, sentence) => {
    const next = kept ? `${kept} ${sentence}` : sentence
    return next.length <= MAX_DESCRIPTION ? next : kept
  }, '')
}
