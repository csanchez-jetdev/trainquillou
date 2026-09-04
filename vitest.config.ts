import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    // UTC, like the CI and the container: a date read from the local clock fails here too.
    env: { TZ: 'UTC' },
  },
})
