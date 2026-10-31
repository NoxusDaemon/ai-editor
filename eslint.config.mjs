// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // Build output (Rust target dir, generated Tauri schemas).
  { ignores: ['src-tauri/target/**', 'src-tauri/gen/**'] }
)
