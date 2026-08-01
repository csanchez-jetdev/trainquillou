import { STATION_PAGES } from '~~/shared/stations'

/**
 * Sitemap : la landing et les pages gare.
 *
 * `/app` en est absent volontairement : la page est en `noindex` (coquille sans
 * contenu rendu côté serveur), et un sitemap ne doit lister que des URL qu'on
 * demande réellement à indexer.
 */
export default defineEventHandler((event) => {
  const { public: { siteUrl } } = useRuntimeConfig(event)
  const base = siteUrl.replace(/\/$/, '')

  const urls = [
    { loc: base, priority: '1.0' },
    ...STATION_PAGES.map((s) => ({ loc: `${base}/depuis/${s.slug}`, priority: '0.7' })),
  ]

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><priority>${u.priority}</priority></url>`).join('\n')}
</urlset>
`

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return body
})
