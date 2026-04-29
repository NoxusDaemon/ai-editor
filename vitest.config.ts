import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

export default defineConfig({
  test: {
    globals: true, // This makes vi available globally
    setupFiles: ['./test/nuxt/.vitest.setup.ts'],
    projects: [
      await defineVitestProject({
        test: {
          name: 'unit',
          root: './test/unit',
          include: ['**/*.{test,spec}.ts'],
          environment: 'node'
        }
      }),
      await defineVitestProject({
        test: {
          name: 'nuxt',
          root: './test/nuxt',
          include: ['**/*.{test,spec}.ts'],
          environment: 'nuxt'
        }
      })
    ]
  }
})
