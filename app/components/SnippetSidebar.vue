<template>
  <!-- A slim strip along the window edge; pointing at it slides the panel in. -->
  <div
    v-if="!pinned"
    ref="rail"
    class="group/rail flex w-2 shrink-0 items-center justify-center"
    aria-hidden="true"
    :data-testid="`sidebar-rail-${side}`"
  >
    <span class="h-10 w-1 rounded-full bg-accented opacity-60 transition group-hover/rail:bg-primary group-hover/rail:opacity-100" />
  </div>

  <aside
    ref="panel"
    class="flex w-64 shrink-0 flex-col border-default bg-default"
    :class="panelClass"
    :inert="!pinned && !open"
    :aria-label="`${side === 'left' ? 'Left' : 'Right'} snippets`"
    :data-testid="`sidebar-${side}`"
    @dragstart="onDragStart"
  >
    <header class="flex shrink-0 items-center gap-1 border-b border-default bg-elevated/40 px-2 py-1">
      <UIcon
        :name="BLOCK_META.snippets.icon"
        class="size-4 text-muted"
      />
      <span class="ms-1 text-xs font-medium">Snippets</span>
      <UTooltip
        text="Reorder snippets and sections"
        :disabled="arranging"
      >
        <UButton
          icon="i-lucide-arrow-down-up"
          :label="arranging ? 'Done' : undefined"
          :color="arranging ? 'primary' : 'neutral'"
          :variant="arranging ? 'soft' : 'ghost'"
          size="xs"
          class="ms-auto"
          :aria-pressed="arranging"
          aria-label="Arrange snippets"
          data-testid="arrange-snippets"
          @click="arranging = !arranging"
        />
      </UTooltip>
      <UTooltip :text="pinned ? 'Unpin: show only when the pointer is near the edge' : 'Keep open'">
        <UButton
          :icon="pinned ? 'i-lucide-pin-off' : 'i-lucide-pin'"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-pressed="pinned"
          :aria-label="pinned ? 'Unpin sidebar' : 'Pin sidebar'"
          data-testid="pin-sidebar"
          @click="togglePin"
        />
      </UTooltip>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto p-3">
      <p
        v-if="!items.length"
        class="mb-3 text-xs text-dimmed"
      >
        Shared by every session and saved with the workspace. Drag them into any prompt.
      </p>
      <SnippetList
        v-model:items="items"
        :arranging="arranging"
      />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { useActiveElement, useEventListener } from '@vueuse/core'
import type { SidebarSide } from '~/lib/workspace'
import { BLOCK_META } from '~/utils/blocks'

const props = defineProps<{ side: SidebarSide }>()

/** Passing the edge on the way somewhere else shouldn't open the panel. */
const OPEN_DELAY_MS = 120
/** Grace period for overshooting the panel's edge. */
const CLOSE_DELAY_MS = 300

const workspace = useWorkspaceStore()
const settings = useSettingsStore()

const rail = useTemplateRef('rail')
const panel = useTemplateRef('panel')

const items = computed({
  get: () => workspace.sidebars[props.side],
  set: value => workspace.setSidebar(props.side, value)
})

const pinned = computed(() => settings.pinnedSidebars[props.side])
const arranging = ref(false)
const hovered = ref(false)

// Typing in one of its fields keeps the panel open even if the pointer wanders off.
const activeElement = useActiveElement()
const editing = computed(() => activeElement.value instanceof HTMLInputElement && !!panel.value?.contains(activeElement.value))

const open = computed(() => hovered.value || arranging.value || editing.value)

const panelClass = computed(() => {
  const left = props.side === 'left'
  if (pinned.value) return left ? 'border-e' : 'border-s'
  return [
    'absolute inset-y-0 z-30 transition duration-200 ease-out',
    left ? 'left-0 border-e' : 'right-0 border-s',
    open.value ? 'translate-x-0 shadow-xl' : left ? '-translate-x-full' : 'translate-x-full'
  ]
})

let timer: ReturnType<typeof setTimeout> | undefined

/** Moves `hovered` to `value` after a short delay; changing course in the meantime cancels it. */
function settle(value: boolean) {
  if (value === hovered.value) {
    clearTimeout(timer)
    timer = undefined
    return
  }
  timer ??= setTimeout(() => {
    timer = undefined
    hovered.value = value
  }, value ? OPEN_DELAY_MS : CLOSE_DELAY_MS)
}

useEventListener(document, 'mousemove', (event: MouseEvent) => {
  if (pinned.value) return
  const target = event.target as Node
  const inside = !!rail.value?.contains(target) || !!panel.value?.contains(target)
  // Don't open while a button is held, e.g. when selecting text towards the edge.
  settle(inside && (hovered.value || event.buttons === 0))
}, { passive: true })

useEventListener(document, 'mouseleave', () => settle(false))

onBeforeUnmount(() => clearTimeout(timer))

function onDragStart() {
  if (pinned.value) return
  // Get out of the way so the whole prompt area is a drop target. Deferred because
  // changing the page during dragstart can cancel the drag.
  setTimeout(() => {
    clearTimeout(timer)
    timer = undefined
    hovered.value = false
  })
}

function togglePin() {
  // Stay open after unpinning until the pointer leaves.
  hovered.value = pinned.value
  settings.pinnedSidebars[props.side] = !pinned.value
}
</script>
