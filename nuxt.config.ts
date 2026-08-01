import tailwindcss from '@tailwindcss/vite'
import { STATION_PAGES } from './shared/stations'

/**
 * Rybbit analytics: no cookie, no persistent identifier and no IP storage, per its privacy
 * policy. That policy does not state the hosting jurisdiction, so claim nothing about it in
 * the UI until the vendor confirms.
 *
 * Deliberately empty by default. This repo is public and self-hosting is an advertised
 * feature: hardcoding the id would send a third-party instance's traffic to an account it
 * never chose. The official instance supplies it as a build-time env var (see infra/deploy.sh).
 */
const RYBBIT_SITE_ID = process.env.NUXT_PUBLIC_RYBBIT_SITE_ID ?? ''

/**
 * Public URL of the instance. Read at build time, because share previews need it absolute:
 * a relative `og:image` is not reliably resolved by the Facebook, LinkedIn, X or Slack
 * crawlers, and the preview breaks. When self-hosting, set NUXT_PUBLIC_SITE_URL before
 * `pnpm build`.
 */
const SITE_URL = (process.env.NUXT_PUBLIC_SITE_URL || 'https://trainquillou.fr').replace(/\/$/, '')

/**
 * Images from `public/` served with a long cache (see `nitro.routeRules`).
 * Keep in sync when adding an image: a missing entry breaks nothing, it just makes the
 * file download again on every visit.
 */
const CACHED_IMAGES = [
  'hero.jpg',
  'hero-1200.jpg',
  'hero-800.jpg',
  'hero-1672.avif',
  'hero-800.avif',
  'og-image.jpg',
  'logo-mark.png',
  'logo-mark-white.png',
  'favicon.ico',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
]

/**
 * Both names, TGVmax and MAX JEUNE, in every string aimed at search engines.
 *
 * SNCF renamed the subscription MAX JEUNE in 2023; "TGVmax" is no longer the official name
 * but still carries most of the search volume, and the open dataset keeps that name. Dropping
 * the old one would cost traffic today, ignoring the new one would cost traffic tomorrow.
 */
const TITLE = 'Trainquillou — destinations TGVmax (MAX JEUNE) sur une carte'
const DESCRIPTION
  = 'Trouvez les destinations TGVmax / MAX JEUNE réservables depuis votre gare, sur une carte '
    + 'interactive. Aller-retour week-end, recherche inverse, itinéraires avec correspondances. '
    + 'Gratuit, sans compte, sans publicité.'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint'],
  compatibilityDate: '2025-07-15',
  features: { inlineStyles: true },
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],

  // 3000 is the default port of too many things — Langfuse among them, running in a
  // container on the dev machine. Without a fixed port Nuxt picks a free one at random and
  // test URLs change between sessions. Override with `PORT` or `pnpm dev --port`. Production
  // is unaffected: its port comes from infra/compose.yml.
  devServer: { port: 3001 },
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: [
        'maplibre-gl', // CJS
      ],
    },
  },

  nitro: {
    prerender: {
      // One static page per departure station: they depend on no live data, so the build
      // never calls the SNCF API.
      routes: ['/', '/a-propos', ...STATION_PAGES.map((s) => `/depuis/${s.slug}`)],
      crawlLinks: false,
    },

    /**
     * Browser cache for the images in `public/`.
     *
     * An explicit list rather than an extension pattern: `routeRules` patterns are resolved
     * by radix3, which handles segment wildcards but not filename suffixes. A "every URL
     * ending in .png" pattern would match nothing, and the header would go missing silently.
     *
     * 30 days and not `immutable`: these names carry no content hash, so a replaced logo has
     * to reach returning visitors eventually — which `immutable` forbids until expiry.
     */
    routeRules: Object.fromEntries(
      CACHED_IMAGES.map((file) => [
        `/${file}`,
        { headers: { 'cache-control': 'public, max-age=2592000, stale-while-revalidate=86400' } },
      ]),
    ),
  },

  runtimeConfig: {
    public: {
      // Public URL of the instance, for canonical links, the sitemap and share previews.
      // Set it through NUXT_PUBLIC_SITE_URL when self-hosting.
      siteUrl: SITE_URL,
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      title: TITLE,
      meta: [
        { name: 'description', content: DESCRIPTION },
        // No maximum-scale: blocking zoom prevents enlarging the text.
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#0b1f3a' },

        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Trainquillou' },
        { property: 'og:title', content: TITLE },
        { property: 'og:description', content: DESCRIPTION },
        { property: 'og:image', content: `${SITE_URL}/og-image.jpg` },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:locale', content: 'fr_FR' },

        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: TITLE },
        { name: 'twitter:description', content: DESCRIPTION },
        { name: 'twitter:image', content: `${SITE_URL}/og-image.jpg` },
      ],
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      ],
      script: RYBBIT_SITE_ID
        ? [{
            src: 'https://app.rybbit.io/api/script.js',
            defer: true,
            'data-site-id': RYBBIT_SITE_ID,
          }]
        : [],
    },
  },
})
