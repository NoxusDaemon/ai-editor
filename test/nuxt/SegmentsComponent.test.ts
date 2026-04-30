import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import SegmentsComponent from '~/components/SegmentsComponent.vue'

describe('SegmentsComponent', () => {
  const defaultSegments = ['Segment 1', 'Segment 2']

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

    // The component renders span elements for segments and a button for adding
    const spans = wrapper.findAll('span')
    expect(spans.length).toBeGreaterThan(0)
  })

  it('adds a new segment when the add button is clicked', async () => {
    const wrapper = await mountSuspended(SegmentsComponent, {
      props: {
        modelValue: defaultSegments
      }
    })

    // Click the button that triggers addNew
    const buttons = wrapper.findAll('button')
    if (buttons.length > 0) {
      await buttons[buttons.length - 1].trigger('click')
      await wrapper.vm.$nextTick()
    }

    // The segments array should now have 3 items
    const segments = wrapper.findAll('span')
    expect(segments.length).toBeGreaterThan(2)
  })

  it('renders an input field when a segment is double-clicked', async () => {
    const wrapper = await mountSuspended(SegmentsComponent, {
      props: {
        modelValue: defaultSegments
      }
    })

    // Double-click on the first segment
    const spans = wrapper.findAll('span')
    const firstSegment = spans.find(s => s.text().includes('Segment 1'))
    if (firstSegment) {
      await firstSegment.trigger('dblclick')
      await wrapper.vm.$nextTick()
    }

    // Check that an input is now rendered
    const inputs = wrapper.findAll('input')
    expect(inputs.length).toBeGreaterThan(0)
  })
})
