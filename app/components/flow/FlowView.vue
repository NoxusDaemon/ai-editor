<template>
  <div class="flex min-h-0">
    <div
      ref="stage"
      class="relative min-w-0 flex-1 overflow-hidden"
    >
      <FlowCanvas
        ref="canvas"
        :session="session"
        :inert="focusedNode ? true : undefined"
        @open="open"
      />

      <div
        v-show="!focusedNode"
        class="pointer-events-none absolute inset-x-3 top-3 z-10 flex"
      >
        <FlowToolbar
          :session="session"
          class="pointer-events-auto"
          @open="open"
        />
      </div>
      <FlowPalette
        v-show="!focusedNode"
        class="absolute top-1/2 left-3 z-10 -translate-y-1/2"
        @add="kind => canvas?.addInView(kind)"
      />

      <div
        v-if="focusedNode"
        ref="overlay"
        class="absolute inset-0 z-30 origin-top-left"
      >
        <FlowNodeFocus
          :key="focusedNode.id"
          :session-id="session.id"
          :node="focusedNode"
          @close="close"
          @open="switchTo"
        />
      </div>
    </div>

    <FlowRunPanel
      v-if="view.runPanelOpen"
      :session-id="session.id"
    />
  </div>
</template>

<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import type { ViewportTransform } from '@vue-flow/core'
import type { Session } from '~/lib/workspace'
import { prefersReducedMotion } from '~/utils/flowContext'

const props = defineProps<{ session: Session }>()

const workspace = useWorkspaceStore()
const view = useFlowViewStore()

const stage = useTemplateRef('stage')
const overlay = useTemplateRef('overlay')
const canvas = useTemplateRef('canvas')

const focusedNode = computed(() => {
  const id = view.focusedId(props.session.id)
  return id ? workspace.findNode(props.session.id, id) : undefined
})

// A node removed while open (e.g. by undo) closes its editor.
watch(() => view.focusedId(props.session.id) && !focusedNode.value, (gone) => {
  if (gone) view.unfocus(props.session.id)
})

const ZOOM_MS = 280
const GROW_MS = 260
const EASE = 'cubic-bezier(0.2, 0.7, 0.2, 1)'

/** Where the canvas was before zooming in, to return to. */
let before: ViewportTransform | null = null
let animating = false

/** The node's box on screen, relative to the stage. */
function nodeBox(nodeId: string): DOMRect | null {
  const element = stage.value?.querySelector(`.vue-flow__node[data-id="${CSS.escape(nodeId)}"]`)
  if (!element || !stage.value) return null
  const box = element.getBoundingClientRect()
  const origin = stage.value.getBoundingClientRect()
  return new DOMRect(box.left - origin.left, box.top - origin.top, box.width, box.height)
}

/** A transform that shrinks the full-size overlay onto `box`. */
function onto(box: DOMRect) {
  const { width, height } = stage.value!.getBoundingClientRect()
  return `translate(${box.x}px, ${box.y}px) scale(${box.width / width}, ${box.height / height})`
}

/** Zooms the canvas towards the node, then grows the editor out of it. */
async function open(nodeId: string) {
  if (animating || view.focusedId(props.session.id) === nodeId) return
  const vueFlow = canvas.value?.vueFlow
  const node = vueFlow?.findNode(nodeId)
  if (!vueFlow || !node || prefersReducedMotion()) {
    view.focus(props.session.id, nodeId)
    return
  }
  animating = true
  try {
    before ??= vueFlow.getViewport()
    const { width, height } = node.dimensions
    await vueFlow.setCenter(node.computedPosition.x + width / 2, node.computedPosition.y + height / 2, {
      zoom: Math.min(2.2, Math.max(vueFlow.viewport.value.zoom * 1.6, 1.4)),
      duration: ZOOM_MS
    })
    const box = nodeBox(nodeId)
    view.focus(props.session.id, nodeId)
    await nextTick()
    if (box && overlay.value) {
      await overlay.value.animate([
        { transform: onto(box), opacity: 0.35, borderRadius: '12px' },
        { transform: 'none', opacity: 1, borderRadius: '0' }
      ], { duration: GROW_MS, easing: EASE }).finished
    }
  } finally {
    animating = false
  }
}

/** Shrinks the editor back into its node and zooms the canvas out to where it was. */
async function close() {
  const id = view.focusedId(props.session.id)
  if (!id || animating) return
  const vueFlow = canvas.value?.vueFlow
  animating = true
  try {
    const box = nodeBox(id)
    if (box && overlay.value && !prefersReducedMotion()) {
      await overlay.value.animate([
        { transform: 'none', opacity: 1 },
        { transform: onto(box), opacity: 0, borderRadius: '12px' }
      ], { duration: GROW_MS - 60, easing: EASE, fill: 'forwards' }).finished
    }
    view.unfocus(props.session.id)
    if (vueFlow && before) await vueFlow.setViewport(before, { duration: prefersReducedMotion() ? 0 : ZOOM_MS })
    before = null
  } finally {
    animating = false
  }
}

/** Moves from one open node to another (e.g. a group's member) without zooming out. */
function switchTo(nodeId: string) {
  if (workspace.findNode(props.session.id, nodeId)) view.focus(props.session.id, nodeId)
}

// Escape goes back to the flow, unless it is closing a menu or typing in a field.
useEventListener(document, 'keydown', (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || event.defaultPrevented || !focusedNode.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
  if (document.querySelector('[role="menu"], [data-reka-popper-content-wrapper], [role="alertdialog"], [role="dialog"][data-state="open"]')) return
  event.preventDefault()
  void close()
})

defineExpose({ open, close })
</script>
