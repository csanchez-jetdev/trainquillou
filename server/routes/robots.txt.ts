/**
 * robots.txt servi par Nitro plutôt que posé dans `public/`, pour que la
 * directive `Sitemap` suive `siteUrl` comme le fait sitemap.xml.
 *
 * Le protocole sitemaps impose une URL absolue ici : un chemin relatif
 * (`Sitemap: /sitemap.xml`) est hors spécification et peut être ignoré.
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
