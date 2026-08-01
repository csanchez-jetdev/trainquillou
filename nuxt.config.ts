import tailwindcss from '@tailwindcss/vite'
import { STATION_PAGES } from './shared/stations'

/**
 * Mesure d'audience Rybbit : sans cookie, sans identifiant persistant, données
 * hébergées dans l'UE.
 *
 * Volontairement vide par défaut. Ce dépôt est public et l'auto-hébergement est une
 * fonctionnalité annoncée : coder l'identifiant en dur enverrait le trafic d'une
 * instance tierce vers un compte qu'elle n'a pas choisi. L'instance officielle le
 * fournit par variable d'environnement au moment du build (voir infra/deploy.sh).
 */
const RYBBIT_SITE_ID = process.env.NUXT_PUBLIC_RYBBIT_SITE_ID ?? ''

const TITLE = 'Trainquillou — toutes les destinations TGVmax sur une carte'
const DESCRIPTION
  = 'Trouvez les destinations TGVmax réservables depuis votre gare, sur une carte interactive. '
    + 'Aller-retour week-end, recherche inverse, itinéraires avec correspondances. '
    + 'Gratuit, sans compte, sans publicité.'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint'],
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },

  nitro: {
    prerender: {
      // Une page statique par gare de départ : elles ne dépendent d'aucune donnée
      // temps réel, donc le build ne sollicite pas l'API SNCF.
      routes: ['/', ...STATION_PAGES.map((s) => `/depuis/${s.slug}`)],
      crawlLinks: false,
    },
  },

  runtimeConfig: {
    public: {
      // URL publique de l'instance, pour les liens canoniques, le sitemap et les
      // aperçus de partage. À définir via NUXT_PUBLIC_SITE_URL en auto-hébergement.
      siteUrl: 'https://trainquillou.fr',
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      title: TITLE,
      meta: [
        { name: 'description', content: DESCRIPTION },
        // Pas de maximum-scale : bloquer le zoom empêche d'agrandir le texte.
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#0b1f3a' },

        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Trainquillou' },
        { property: 'og:title', content: TITLE },
        { property: 'og:description', content: DESCRIPTION },
        { property: 'og:image', content: '/og-image.jpg' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:locale', content: 'fr_FR' },

        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: TITLE },
        { name: 'twitter:description', content: DESCRIPTION },
        { name: 'twitter:image', content: '/og-image.jpg' },
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
