import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      title: 'Trainquillou — destinations TGVmax, gratuit et sans compte',
      meta: [
        { name: 'description', content: 'Trouvez les destinations TGVmax réservables depuis votre gare, sur une carte. 100% gratuit, sans paywall, sans compte.' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1' },
      ],
    },
  },
})
