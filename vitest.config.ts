import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

export default defineConfig({
  test: {
    projects: [
      await defineVitestProject({
        name: 'unit',
        root: './test/unit',
        include: ['**/*.{test,spec}.ts'],
        environment: 'node',
      }),
      await defineVitestProject({
        name: 'nuxt',
        root: './test/nuxt',
        include: ['**/*.{test,spec}.ts'],
        environment: 'nuxt',
      }),
    ],
  },
})
