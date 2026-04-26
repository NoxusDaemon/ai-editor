import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue(), vueJsx()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    alias: {
      '~': resolve(__dirname, 'app'),
      '~/': resolve(__dirname, 'app/')
    },
    setupFiles: ['test/setup.ts'],
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/'
      }
    }
  }
})
