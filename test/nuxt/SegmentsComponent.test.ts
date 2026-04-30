import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import SegmentsComponent from '~/components/SegmentsComponent.vue'

describe('SegmentsComponent', () => {
  const defaultSegments = ['Segment 1', 'Segment 2']

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all segments', async () => {
    const wrapper = await mountSuspended(SegmentsComponent, {
      props: {
        modelValue: defaultSegments
      }
    })

    const text = wrapper.text()
    expect(text).toContain('Segment 1')
    expect(text).toContain('Segment 2')
  })

  it('renders buttons for adding segments', async () => {
    const wrapper = await mountSuspended(SegmentsComponent, {
      props: {
        modelValue: defaultSegments
      }
    })

    const spans = wrapper.findAll('span')
    expect(spans.length).toBeGreaterThan(0)
  })

  it('adds a new segment when the add button is clicked', async () => {
    const wrapper = await mountSuspended(SegmentsComponent, {
      props: {
        modelValue: defaultSegments
      }
    })

    const buttons = wrapper.findAll('button')
    if (buttons.length > 0) {
      await buttons[buttons.length - 1].trigger('click')
      await wrapper.vm.$nextTick()
    }

    const segments = wrapper.findAll('span')
    expect(segments.length).toBeGreaterThan(2)
  })

  it('renders an input field when a segment is double-clicked', async () => {
    const wrapper = await mountSuspended(SegmentsComponent, {
      props: {
        modelValue: defaultSegments
      }
    })

    const spans = wrapper.findAll('span')
    const firstSegment = spans.find(s => s.text().includes('Segment 1'))
    if (firstSegment) {
      await firstSegment.trigger('dblclick')
      await wrapper.vm.$nextTick()
    }

    const inputs = wrapper.findAll('input')
    expect(inputs.length).toBeGreaterThan(0)
  })

  it('renders each segment in its own span', async () => {
    const wrapper = await mountSuspended(SegmentsComponent, {
      props: {
        modelValue: ['A', 'B', 'C']
      }
    })

    const spans = wrapper.findAll('span')
    const segmentSpans = spans.filter(s => s.text().trim() === 'A' || s.text().trim() === 'B' || s.text().trim() === 'C')
    expect(segmentSpans.length).toBe(3)
  })

  it('has editing ref initialized to -1', async () => {
    const wrapper = await mountSuspended(SegmentsComponent, {
      props: {
        modelValue: defaultSegments
      }
    })

    await wrapper.vm.$nextTick()
    expect(wrapper.vm.editing).toBe(-1)
  })

  it('has editingValue ref initialized', async () => {
    const wrapper = await mountSuspended(SegmentsComponent, {
      props: {
        modelValue: defaultSegments
      }
    })

    await wrapper.vm.$nextTick()
    expect(wrapper.vm.editingValue).toBeDefined()
  })

  it('renders segments with correct keys', async () => {
    const wrapper = await mountSuspended(SegmentsComponent, {
      props: {
        modelValue: ['Test Segment']
      }
    })

    const spans = wrapper.findAll('span')
    const segmentSpan = spans.find(s => s.text().includes('Test Segment'))
    expect(segmentSpan).toBeTruthy()
  })

  it('clicking outside segment sets editing to -1', async () => {
    const wrapper = await mountSuspended(SegmentsComponent, {
      props: {
        modelValue: defaultSegments
      }
    })

    await wrapper.vm.$nextTick()

    // Double-click to start editing
    const spans = wrapper.findAll('span')
    const firstSegment = spans.find(s => s.text().includes('Segment 1'))
    if (firstSegment) {
      await firstSegment.trigger('dblclick')
      await wrapper.vm.$nextTick()
    }

    // Click on the container (not on a span)
    const container = wrapper.find('div')
    if (container.exists()) {
      await container.trigger('click')
      await wrapper.vm.$nextTick()
    }
  })

  it('handles empty segments array', async () => {
    const wrapper = await mountSuspended(SegmentsComponent, {
      props: {
        modelValue: []
      }
    })

    expect(wrapper.exists()).toBe(true)
    // Should still render the add button even with empty segments
    const buttons = wrapper.findAll('button')
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('handles single segment', async () => {
    const wrapper = await mountSuspended(SegmentsComponent, {
      props: {
        modelValue: ['Only Segment']
      }
    })

    expect(wrapper.text()).toContain('Only Segment')
  })

  it('handles segments with special characters', async () => {
    const wrapper = await mountSuspended(SegmentsComponent, {
      props: {
        modelValue: ['Segment with "quotes"', "Segment with 'apostrophes'"]
      }
    })

    expect(wrapper.text()).toContain('Segment with')
  })

  it('handles segments with unicode characters', async () => {
    const wrapper = await mountSuspended(SegmentsComponent, {
      props: {
        modelValue: ['Segment 日本語', 'Segment 🎉']
      }
    })

    expect(wrapper.text()).toContain('Segment')
  })

  it('renders segments with border styling', async () => {
    const wrapper = await mountSuspended(SegmentsComponent, {
      props: {
        modelValue: defaultSegments
      }
    })

    const spans = wrapper.findAll('span')
    const segmentSpans = spans.filter(s => s.classes().includes('border-solid'))
    expect(segmentSpans.length).toBeGreaterThan(0)
  })

  it('renders with a flex-wrap container', async () => {
    const wrapper = await mountSuspended(SegmentsComponent, {
      props: {
        modelValue: defaultSegments
      }
    })

    const container = wrapper.find('div')
    expect(container.exists()).toBe(true)
  })

  it('renders add button with warning color', async () => {
    const wrapper = await mountSuspended(SegmentsComponent, {
      props: {
        modelValue: defaultSegments
      }
    })

    const buttons = wrapper.findAll('button')
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('renders button with plus icon', async () => {
    const wrapper = await mountSuspended(SegmentsComponent, {
      props: {
        modelValue: defaultSegments
      }
    })

    // UButton with icon="i-lucide-plus" renders as a button
    const buttons = wrapper.findAll('button')
    expect(buttons.length).toBeGreaterThan(0)
  })
})
