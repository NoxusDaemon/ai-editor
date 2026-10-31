import { fileURLToPath } from 'node:url'
import { defineVitestProject } from '@nuxt/test-utils/config'
import { defineConfig } from 'vitest/config'

const app = fileURLToPath(new URL('./app', import.meta.url))

export default defineConfig({
  test: {
    projects: [
      {
        // Pure logic, stores and services: plain Node, no Nuxt boot — runs in milliseconds.
        resolve: { alias: { '~': app } },
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          environment: 'node'
        }
      },
      // Components, rendered inside a real Nuxt app with Nuxt UI.
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['test/nuxt/**/*.test.ts'],
          environment: 'nuxt',
          environmentOptions: {
            nuxt: { domEnvironment: 'happy-dom' }
          }
        }
      })
    ]
  }
})
