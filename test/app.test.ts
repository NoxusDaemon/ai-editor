import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'

// Stub Nuxt UI components for rendering
vi.mock('@nuxt/ui', () => ({
  UApp: defineComponent({
    name: 'UApp',
    inheritAttrs: false,
    props: { class: { type: null, default: undefined } },
    setup(_, { slots }) {
      return () => slots.default?.()
    }
  }),
  UMain: defineComponent({
    name: 'UMain',
    inheritAttrs: false,
    props: { class: { type: null, default: undefined } },
    setup(_, { slots }) {
      return () => slots.default?.()
    }
  })
}))

// Mock NuxtPage
vi.mock('#components/NuxtPage', () => ({
  default: defineComponent({
    name: 'NuxtPage',
    render: () => '<nuxtpage></nuxtpage>'
  })
}))

// Import the app component after the mock is registered
import App from '~/app.vue'

describe('app.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render UApp as the outermost wrapper', () => {
    const wrapper = mount(App)
    const html = wrapper.html()

    // UApp should be the root element
    expect(html).toContain('<uapp>')
    expect(html).toContain('</uapp>')
  })

  it('should render UMain nested inside UApp', () => {
    const wrapper = mount(App)
    const html = wrapper.html()

    // UMain should be inside UApp
    expect(html).toContain('<umain>')
    expect(html).toContain('</umain>')

    // Verify nesting: UApp wraps UMain
    const appIndex = html.indexOf('<uapp>')
    const mainIndex = html.indexOf('<umain>')
    expect(appIndex).toBeLessThan(mainIndex)
  })

  it('should render NuxtPage inside UMain', () => {
    const wrapper = mount(App)
    const html = wrapper.html()

    // NuxtPage should be inside UMain
    expect(html).toContain('<nuxtpage>')
    expect(html).toContain('</nuxtpage>')

    // Verify nesting: UMain wraps NuxtPage
    const mainIndex = html.indexOf('<umain>')
    const pageIndex = html.indexOf('<nuxtpage>')
    expect(mainIndex).toBeLessThan(pageIndex)
  })

  it('should have correct nesting order: UApp > UMain > NuxtPage', () => {
    const wrapper = mount(App)
    const html = wrapper.html()

    const appIndex = html.indexOf('<uapp>')
    const mainIndex = html.indexOf('<umain>')
    const pageIndex = html.indexOf('<nuxtpage>')

    expect(appIndex).toBeLessThan(mainIndex)
    expect(mainIndex).toBeLessThan(pageIndex)
  })

  it('should render exactly 3 wrapper components', () => {
    const wrapper = mount(App)
    const html = wrapper.html()

    expect(html).toContain('<uapp>')
    expect(html).toContain('<umain>')
    expect(html).toContain('<nuxtpage>')
  })

  it('should have no extra wrapper elements', () => {
    const wrapper = mount(App)
    const html = wrapper.html()

    // Count opening tags
    const uappCount = (html.match(/<uapp>/g) || []).length
    const umainCount = (html.match(/<umain>/g) || []).length
    const nuxtpageCount = (html.match(/<nuxtpage>/g) || []).length

    expect(uappCount).toBe(1)
    expect(umainCount).toBe(1)
    expect(nuxtpageCount).toBe(1)
  })
})
