import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h, type Component } from 'vue'
import { UApp } from '#components'

/** Mounts inside <UApp>, which provides tooltips, toasts and overlays like the real app. */
export function mountInApp(component: Component, props: Record<string, unknown> = {}) {
  return mountSuspended(defineComponent({
    render: () => h(UApp, null, { default: () => h(component, props) })
  }))
}
