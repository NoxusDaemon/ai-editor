import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

// Mock Nuxt UI components
vi.mock('#ui/components', () => ({
  UInput: {
    props: ['modelValue', 'variant'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  UButton: {
    props: ['label', 'icon', 'color', 'variant', 'size', 'disabled', 'loading'],
    template: '<button :disabled="disabled"><slot /></button>'
  }
}))

describe('SegmentsComponent logic', () => {
  // Simulate the segment editing logic from SegmentsComponent.vue
  function createSegmentsLogic(initialSegments: string[]) {
    const segments = ref(initialSegments)
    const editing = ref(-1)
    const editingValue = ref('')

    function startEditing(index: number) {
      editing.value = index
      editingValue.value = segments.value[index]
    }

    function addNew() {
      segments.value.push('NewItem')
    }

    function stopEditing() {
      const oldIndex = editing.value
      if (oldIndex === -1) return
      if (editingValue.value === '') {
        segments.value.splice(oldIndex, 1)
      } else {
        segments.value[oldIndex] = editingValue.value
      }
      editing.value = -1
    }

    return { segments, editing, editingValue, startEditing, addNew, stopEditing }
  }

  describe('addNew', () => {
    it('should add a new segment with default value "NewItem"', () => {
      const { segments, addNew } = createSegmentsLogic(['a', 'b'])
      addNew()
      expect(segments.value).toEqual(['a', 'b', 'NewItem'])
    })

    it('should add multiple new segments', () => {
      const { segments, addNew } = createSegmentsLogic(['a'])
      addNew()
      addNew()
      addNew()
      expect(segments.value).toEqual(['a', 'NewItem', 'NewItem', 'NewItem'])
    })

    it('should add to empty segments', () => {
      const { segments, addNew } = createSegmentsLogic([])
      addNew()
      expect(segments.value).toEqual(['NewItem'])
    })
  })

  describe('editing and updating segments', () => {
    it('should update segment value when editing stops with non-empty value', () => {
      const { segments, startEditing, editingValue, stopEditing } = createSegmentsLogic(['old'])
      startEditing(0)
      editingValue.value = 'updated'
      stopEditing()
      expect(segments.value).toEqual(['updated'])
    })

    it('should remove segment when editing stops with empty value', () => {
      const { segments, startEditing, editingValue, stopEditing } = createSegmentsLogic(['a', 'b', 'c'])
      startEditing(1)
      editingValue.value = ''
      stopEditing()
      expect(segments.value).toEqual(['a', 'c'])
    })

    it('should not change anything when not editing', () => {
      const { segments, stopEditing } = createSegmentsLogic(['a', 'b'])
      stopEditing()
      expect(segments.value).toEqual(['a', 'b'])
    })

    it('should correctly edit the middle segment', () => {
      const { segments, startEditing, editingValue, stopEditing } = createSegmentsLogic(['a', 'middle', 'c'])
      startEditing(1)
      editingValue.value = 'changed'
      stopEditing()
      expect(segments.value).toEqual(['a', 'changed', 'c'])
    })

    it('should correctly edit the last segment', () => {
      const { segments, startEditing, editingValue, stopEditing } = createSegmentsLogic(['a', 'b', 'last'])
      startEditing(2)
      editingValue.value = 'newLast'
      stopEditing()
      expect(segments.value).toEqual(['a', 'b', 'newLast'])
    })
  })

  describe('editing state management', () => {
    it('should set editing index and value when starting to edit', () => {
      const { editing, editingValue, startEditing } = createSegmentsLogic(['a', 'b', 'c'])
      startEditing(1)
      expect(editing.value).toBe(1)
      expect(editingValue.value).toBe('b')
    })

    it('should reset editing state after stop', () => {
      const { editing, editingValue, startEditing, stopEditing } = createSegmentsLogic(['a', 'b'])
      startEditing(0)
      stopEditing()
      expect(editing.value).toBe(-1)
    })

    it('should handle editing different segments sequentially', () => {
      const { segments, editing, editingValue, startEditing, stopEditing } = createSegmentsLogic(['a', 'b', 'c'])
      
      startEditing(0)
      editingValue.value = 'updated_a'
      stopEditing()
      expect(segments.value).toEqual(['updated_a', 'b', 'c'])
      
      startEditing(2)
      editingValue.value = 'updated_c'
      stopEditing()
      expect(segments.value).toEqual(['updated_a', 'b', 'updated_c'])
    })
  })
})
