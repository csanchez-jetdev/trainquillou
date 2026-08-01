/**
 * Served by Nitro rather than dropped in `public/`, so the `Sitemap` directive follows
 * `siteUrl` the way sitemap.xml does.
 *
 * The sitemaps protocol requires an absolute URL here: a relative path
 * (`Sitemap: /sitemap.xml`) is out of spec and may be ignored.
 */
export default defineEventHandler((event) => {
  const { public: { siteUrl } } = useRuntimeConfig(event)
  const base = siteUrl.replace(/\/$/, '')

  const body = `User-agent: *
Allow: /

# Les routes d'API renvoient du JSON : rien à indexer, et chaque appel sollicite
# l'open data SNCF.
Disallow: /api/

Sitemap: ${base}/sitemap.xml
`

  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return body
})
