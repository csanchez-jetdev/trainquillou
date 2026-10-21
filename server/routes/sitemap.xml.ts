import { ROUTE_PAGES, STATION_PAGES } from '~~/shared/stations'

/**
 * The landing page, "À propos", the simulator, the statistics page, the station pages
 * and the liaisons.
 *
 * `/app` is deliberately absent: it is `noindex` (a shell with no server-rendered content),
 * and a sitemap should only list URLs we actually ask to have indexed.
 *
 * No `<priority>` and no `<changefreq>`: Google ignores both. `<lastmod>` is the one field
 * it reads, and only while it stays accurate — hence its absence on "À propos", editorial
 * content that does not move with the daily ingestion.
 */
export default defineEventHandler(async (event) => {
  const { public: { siteUrl } } = useRuntimeConfig(event)
  const base = siteUrl.replace(/\/$/, '')

  // A failed call must not take the sitemap down with it: the URLs matter more than the date.
  const ingested = await backendFetch<{ updatedOn: string | null }>(event, '/updated')
    .then((r) => r.updatedOn)
    .catch(() => null)

  const urls: { loc: string; lastmod?: string | null }[] = [
    { loc: base, lastmod: ingested },
    { loc: `${base}/a-propos` },
    { loc: `${base}/simulateur-tgvmax`, lastmod: ingested },
    { loc: `${base}/stats`, lastmod: ingested },
    { loc: `${base}/liaisons`, lastmod: ingested },
    ...STATION_PAGES.map((s) => ({ loc: `${base}/depuis/${s.slug}`, lastmod: ingested })),
    ...ROUTE_PAGES.map((r) => ({
      loc: `${base}/depuis/${r.from}/vers/${r.to}`,
      lastmod: ingested,
    })),
  ]

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(({ loc, lastmod }) =>
    `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`)
  .join('\n')}
</urlset>
`

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return body
})
