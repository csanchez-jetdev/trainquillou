// La config de base est générée par @nuxt/eslint dans .nuxt/ : elle connaît
// déjà les auto-imports, les répertoires app/ et server/, et les .vue.
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    ignores: [
      // Sorties de build et données figées : rien à linter.
      '.output',
      '.nuxt',
      '.data',
      'dist',
      'public',
      'server/assets/*.json',
      'test/fixtures',
    ],
  },
  {
    files: ['app/components/Spinner.vue'],
    rules: {
      // La règle prévient les collisions avec les éléments HTML natifs ; « Spinner »
      // n'en est pas un et le renommer n'apporterait rien.
      'vue/multi-word-component-names': 'off',
    },
  },
)
