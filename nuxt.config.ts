import tailwindcss from '@tailwindcss/vite'
import { STATION_PAGES } from './shared/stations'

/**
 * Mesure d'audience Rybbit : sans cookie, sans identifiant persistant, et sans
 * stockage des adresses IP d'après sa politique de confidentialité. Celle-ci ne
 * précise en revanche pas la juridiction d'hébergement : ne rien affirmer à ce
 * sujet dans l'interface tant que ce n'est pas confirmé par l'éditeur.
 *
 * Volontairement vide par défaut. Ce dépôt est public et l'auto-hébergement est une
 * fonctionnalité annoncée : coder l'identifiant en dur enverrait le trafic d'une
 * instance tierce vers un compte qu'elle n'a pas choisi. L'instance officielle le
 * fournit par variable d'environnement au moment du build (voir infra/deploy.sh).
 */
const RYBBIT_SITE_ID = process.env.NUXT_PUBLIC_RYBBIT_SITE_ID ?? ''

/**
 * URL publique de l'instance. Lue à la construction, parce que les aperçus de
 * partage l'exigent en absolu : `og:image` relatif n'est pas résolu de façon
 * fiable par les robots de Facebook, LinkedIn, X ou Slack, et l'aperçu tombe.
 * En auto-hébergement, définir NUXT_PUBLIC_SITE_URL avant `pnpm build`.
 */
const SITE_URL = (process.env.NUXT_PUBLIC_SITE_URL || 'https://trainquillou.fr').replace(/\/$/, '')

/**
 * Images de `public/` servies avec un cache long (voir `nitro.routeRules`).
 * Tenir à jour en ajoutant une image : une absence ici ne casse rien, elle
 * fait juste retélécharger le fichier à chaque visite.
 */
const CACHED_IMAGES = [
  'hero.jpg',
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
 * Double nommage TGVmax / MAX JEUNE dans tout le texte destiné aux moteurs.
 *
 * La SNCF a renommé l'abonnement MAX JEUNE en 2023 ; « TGVmax » n'est plus le nom
 * officiel, mais il concentre encore l'essentiel des recherches, et le jeu de
 * données open data porte toujours ce nom. Les deux termes cohabitent donc dans
 * les titres et descriptions : abandonner l'ancien coûterait du trafic
 * aujourd'hui, ignorer le nouveau en coûterait demain.
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

  // 3000 est le port par défaut de trop de choses — dont Langfuse, qui tourne en
  // conteneur sur la machine de développement. Sans port fixe, Nuxt en choisit un
  // libre au hasard et les URL de test changent d'une session à l'autre.
  // Surchargeable par `PORT` ou `pnpm dev --port`. Ne concerne pas la production,
  // dont le port est fixé par infra/compose.yml.
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
      // Une page statique par gare de départ : elles ne dépendent d'aucune donnée
      // temps réel, donc le build ne sollicite pas l'API SNCF.
      routes: ['/', '/a-propos', ...STATION_PAGES.map((s) => `/depuis/${s.slug}`)],
      crawlLinks: false,
    },

    /**
     * Cache navigateur des images de `public/`.
     *
     * Liste explicite plutôt qu'un motif d'extension : les motifs de `routeRules`
     * sont résolus par radix3, qui gère les jokers de segment mais pas les
     * suffixes de nom de fichier. Un motif du genre « toutes les URL finissant
     * par .png » ne matcherait rien, et l'en-tête manquerait sans que rien ne le
     * signale. Ajouter une image demande donc une ligne ici — le coût d'une règle
     * dont on peut vérifier l'effet.
     *
     * 30 jours et pas `immutable` : ces noms ne portent pas de hash de contenu.
     * Un logo remplacé doit finir par atteindre les visiteurs déjà venus, ce
     * qu'`immutable` interdit jusqu'à expiration.
     */
    routeRules: {
      ...Object.fromEntries(
        CACHED_IMAGES.map((file) => [
          `/${file}`,
          { headers: { 'cache-control': 'public, max-age=2592000, stale-while-revalidate=86400' } },
        ]),
      ),
      // Les variantes générées par @nuxt/image portent leurs transformations dans
      // l'URL (`/_ipx/f_avif,w_1024/hero.jpg`) : une image modifiée produit une
      // autre adresse, donc `immutable` un an sans risque de servir du périmé.
      '/_ipx/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    },
  },

  runtimeConfig: {
    public: {
      // URL publique de l'instance, pour les liens canoniques, le sitemap et les
      // aperçus de partage. À définir via NUXT_PUBLIC_SITE_URL en auto-hébergement.
      siteUrl: SITE_URL,
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
