import { useEventListener } from '@vueuse/core'
import { ref } from 'vue'

const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false

/**
 * Window-wide file drop target. Only reacts to drags that carry files, so text
 * drags and block reordering never trigger it. Listens in the capture phase so
 * the prompt editors cannot swallow the drop.
 */
export function useFileDrop(onDrop: (file: File) => void) {
  const isOver = ref(false)
  let depth = 0

  const options = { capture: true }

  useEventListener(window, 'dragenter', (event: DragEvent) => {
    if (!carriesFiles(event)) return
    event.preventDefault()
    depth++
    isOver.value = true
  }, options)

  useEventListener(window, 'dragover', (event: DragEvent) => {
    if (!carriesFiles(event)) return
    event.preventDefault()
    event.dataTransfer!.dropEffect = 'copy'
  }, options)

  useEventListener(window, 'dragleave', (event: DragEvent) => {
    if (!carriesFiles(event)) return
    depth = Math.max(0, depth - 1)
    if (depth === 0) isOver.value = false
  }, options)

  useEventListener(window, 'drop', (event: DragEvent) => {
    if (!carriesFiles(event)) return
    event.preventDefault()
    event.stopPropagation()
    depth = 0
    isOver.value = false
    const file = event.dataTransfer?.files[0]
    if (file) onDrop(file)
  }, options)

  return { isOver }
}
