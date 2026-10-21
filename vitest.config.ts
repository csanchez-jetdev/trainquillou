import { defineVitestConfig } from '@nuxt/test-utils/config'
import { configDefaults } from 'vitest/config'

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    // UTC, like the CI and the container: a date read from the local clock fails here too.
    env: { TZ: 'UTC' },
    // A git worktree under `.claude/` carries its own copy of `test/`, which would run
    // here too: the suite counted double, and a red worktree failed the repository.
    // Spread rather than replace, or the defaults that skip node_modules go with it.
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
})
