<template>
  <section
    class="group/block overflow-hidden rounded-lg border border-l-4 border-default bg-default shadow-xs"
    :class="BLOCK_META.snippets.accent"
    data-testid="snippets-block"
  >
    <header class="flex items-center gap-1 border-b border-default bg-elevated/40 px-1.5 py-1">
      <UButton
        icon="i-lucide-grip-vertical"
        color="neutral"
        variant="ghost"
        size="xs"
        class="cursor-grab active:cursor-grabbing"
        aria-label="Drag to reorder"
        data-drag-handle
      />
      <UIcon
        :name="BLOCK_META.snippets.icon"
        class="ms-1 size-4 text-muted"
      />
      <span class="ms-1 text-xs font-medium">Snippets</span>
      <span class="ms-2 hidden truncate text-xs text-dimmed md:inline">
        Drag into a prompt or click to copy · double-click to edit · never sent to the model
      </span>
      <UTooltip text="Remove">
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          size="xs"
          class="ms-auto opacity-0 transition-opacity group-hover/block:opacity-100 group-focus-within/block:opacity-100"
          aria-label="Remove snippets"
          data-testid="remove-block"
          @click="emit('remove')"
        />
      </UTooltip>
    </header>

    <ul class="flex flex-wrap items-center gap-1.5 p-3">
      <li
        v-for="(item, index) in block.items"
        :key="index"
        class="max-w-full"
      >
        <input
          v-if="editingIndex === index"
          v-model="draft"
          v-select-on-mount
          class="rounded-md bg-elevated px-2 py-1 text-sm text-highlighted outline-none ring-1 ring-primary"
          :size="Math.max(12, draft.length + 1)"
          aria-label="Snippet text"
          data-testid="snippet-input"
          @keydown.enter.prevent="commit"
          @keydown.esc.prevent="cancel"
          @blur="commit"
        >
        <span
          v-else
          draggable="true"
          :title="item"
          class="group/chip inline-flex max-w-full cursor-grab items-center gap-1 rounded-md border border-default bg-elevated py-1 ps-2 pe-1 text-sm hover:border-accented active:cursor-grabbing"
          data-testid="snippet"
          @dragstart="onDragStart($event, item)"
          @click="copySnippet(index)"
          @dblclick="startEdit(index)"
        >
          <UIcon
            v-if="copiedIndex === index && copied"
            name="i-lucide-check"
            class="size-3.5 shrink-0 text-success"
          />
          <span class="max-w-72 truncate">{{ item }}</span>
          <button
            type="button"
            class="rounded p-0.5 text-dimmed opacity-0 group-hover/chip:opacity-100 hover:text-error focus-visible:opacity-100"
            aria-label="Remove snippet"
            @click.stop="remove(index)"
            @dblclick.stop
          >
            <UIcon
              name="i-lucide-x"
              class="block size-3.5"
            />
          </button>
        </span>
      </li>
      <li>
        <UButton
          icon="i-lucide-plus"
          label="Add snippet"
          color="neutral"
          variant="soft"
          size="xs"
          data-testid="add-snippet"
          @click="add"
        />
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { useClipboard } from '@vueuse/core'
import type { SnippetsBlock } from '~/lib/workspace'
import { BLOCK_META } from '~/utils/blocks'
import { vSelectOnMount } from '~/utils/directives'

const props = defineProps<{
  sessionId: string
  block: SnippetsBlock
}>()

const emit = defineEmits<{ remove: [] }>()

const workspace = useWorkspaceStore()
const { copy, copied } = useClipboard({ legacy: true })

const editingIndex = ref<number | null>(null)
const draft = ref('')
const copiedIndex = ref<number | null>(null)

const update = (items: string[]) => workspace.setSnippets(props.sessionId, props.block.id, items)

function startEdit(index: number) {
  editingIndex.value = index
  draft.value = props.block.items[index] ?? ''
}

function commit() {
  const index = editingIndex.value
  if (index === null) return
  editingIndex.value = null
  const text = draft.value.trim()
  const items = [...props.block.items]
  if (text) items[index] = text
  else items.splice(index, 1)
  update(items)
}

function cancel() {
  const index = editingIndex.value
  editingIndex.value = null
  // A snippet that was just added and never filled in goes away again.
  if (index !== null && props.block.items[index] === '') update(props.block.items.filter((_, i) => i !== index))
}

function add() {
  update([...props.block.items, ''])
  startEdit(props.block.items.length - 1)
}

function remove(index: number) {
  update(props.block.items.filter((_, i) => i !== index))
}

function copySnippet(index: number) {
  copiedIndex.value = index
  void copy(props.block.items[index] ?? '')
}

function onDragStart(event: DragEvent, text: string) {
  event.dataTransfer?.setData('text/plain', text)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}
</script>
