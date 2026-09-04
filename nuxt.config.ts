import tailwindcss from '@tailwindcss/vite'
import { STATION_PAGES } from './shared/stations'

const RYBBIT_SITE_ID = process.env.NUXT_PUBLIC_RYBBIT_SITE_ID ?? ''

const RYBBIT_HOST = (process.env.NUXT_PUBLIC_RYBBIT_HOST || 'https://app.rybbit.io').replace(/\/$/, '')

// Absolute: the social crawlers do not reliably resolve a relative `og:image`.
const SITE_URL = (process.env.NUXT_PUBLIC_SITE_URL || 'https://trainquillou.fr').replace(/\/$/, '')

const CACHED_ASSETS = [
  'rail-network.geojson',
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

const TITLE = 'Trainquillou — destinations TGVmax (MAX JEUNE) sur une carte'
const DESCRIPTION
  = 'Trouvez les destinations TGVmax / MAX JEUNE réservables depuis votre gare, sur une carte '
    + 'interactive. Aller-retour week-end, recherche inverse, itinéraires avec correspondances. '
    + 'Gratuit, sans compte, sans publicité.'

export default defineNuxtConfig({
  modules: ['@nuxt/eslint'],
  compatibilityDate: '2025-07-15',
  features: { inlineStyles: true },
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],

  devServer: { port: 3001 },
  vite: {
    plugins: [tailwindcss()],
  },

  nitro: {
    // Development only: in production the reverse proxy routes /api/* to Django itself.
    devProxy: {
      '/api': `${(process.env.BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')}/api`,
    },

    prerender: {
      routes: ['/', '/a-propos', '/stats', ...STATION_PAGES.map((s) => `/depuis/${s.slug}`)],
      crawlLinks: false,
    },

    // radix3 wildcards match segments, not filename suffixes: a `*.png` rule matches nothing.
    routeRules: {
      ...Object.fromEntries(
        CACHED_ASSETS.map((file) => [
          `/${file}`,
          { headers: { 'cache-control': 'public, max-age=2592000, stale-while-revalidate=86400' } },
        ]),
      ),

      '/fonts/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    },
  },

  runtimeConfig: {
    public: {
      siteUrl: SITE_URL,

      // The multi-stop planner is built and tested but not announced
      planner: false,
    },
  },

  $development: {
    runtimeConfig: { public: { planner: true } },
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
        // Archivo too: the landing h1 is the LCP element, and a late swap shifts it.
        { rel: 'preload', href: '/fonts/inter-latin-var.woff2', as: 'font', type: 'font/woff2', crossorigin: '' },
        { rel: 'preload', href: '/fonts/archivo-latin-var.woff2', as: 'font', type: 'font/woff2', crossorigin: '' },
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      ],
      script: RYBBIT_SITE_ID
        ? [{
            src: `${RYBBIT_HOST}/api/script.js`,
            defer: true,
            'data-site-id': RYBBIT_SITE_ID,
          }]
        : [],
    },
  },
})
