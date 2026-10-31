// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@pinia/nuxt'
  ],

  // Tauri serves a static bundle, so the app is a pure SPA.
  ssr: false,

  devtools: {
    enabled: true
  },

  app: {
    head: {
      title: 'AI Editor',
      htmlAttrs: { lang: 'en' }
    }
  },

  css: ['~/assets/css/main.css'],

  // Avoids "EMFILE: too many open files" from watching the Rust target dir.
  ignore: ['**/src-tauri/**'],

  devServer: {
    // Lets `tauri dev` reach the dev server from a phone/emulator when TAURI_DEV_HOST is set.
    host: process.env.TAURI_DEV_HOST || 'localhost'
  },

  compatibilityDate: '2026-10-01',

  vite: {
    // Keep Tauri CLI output visible.
    clearScreen: false,
    // https://v2.tauri.app/reference/environment-variables/
    envPrefix: ['VITE_', 'TAURI_'],
    server: {
      // Tauri expects the dev server on a fixed port.
      strictPort: true
    },
    optimizeDeps: {
      include: [
        '@lmstudio/sdk',
        '@tauri-apps/api/core',
        '@tauri-apps/api/window',
        '@tauri-apps/plugin-dialog',
        '@tauri-apps/plugin-fs',
        '@vueuse/core',
        '@vueuse/integrations/useSortable',
        'zod'
      ]
    }
  },

  typescript: {
    // test/nuxt is included by Nuxt; type-check the plain unit tests too.
    tsConfig: {
      include: ['../test/unit/**/*']
    }
  },

  telemetry: false,

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  icon: {
    // The desktop app must work offline: bundle every icon we use instead of
    // fetching them from the Iconify API at runtime.
    provider: 'none',
    fallbackToApi: false,
    clientBundle: {
      scan: {
        globInclude: ['app/**/*.{vue,ts}']
      }
    }
  }
})
