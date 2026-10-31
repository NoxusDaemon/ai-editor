import type { Directive } from 'vue'

/** Focuses an input and selects its text when it appears (inline rename/edit fields). */
export const vSelectOnMount: Directive<HTMLInputElement> = {
  mounted(el) {
    el.focus()
    el.select()
  }
}
