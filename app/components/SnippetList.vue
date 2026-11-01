<template>
  <ul
    ref="list"
    class="flex flex-wrap items-center gap-1.5"
    data-testid="snippet-list"
  >
    <li
      v-for="item in items"
      :key="item.id"
      :class="item.kind === 'section' ? 'basis-full pt-1.5 first:pt-0' : 'max-w-full'"
      data-snippet-item
    >
      <input
        v-if="editingId === item.id"
        v-model="draft"
        v-select-on-mount
        class="max-w-full rounded-md bg-elevated px-2 py-1 text-sm text-highlighted outline-none ring-1 ring-primary"
        :size="Math.max(12, draft.length + 1)"
        :placeholder="item.kind === 'section' ? 'Section name' : undefined"
        :aria-label="item.kind === 'section' ? 'Section name' : 'Snippet text'"
        data-testid="snippet-input"
        @keydown.enter.prevent="commit"
        @keydown.esc.prevent="cancel"
        @blur="commit"
      >
      <div
        v-else-if="item.kind === 'section'"
        class="group/section flex items-center gap-1.5"
        :class="{ 'cursor-grab active:cursor-grabbing': arranging }"
        data-testid="snippet-section"
        @dblclick="startEdit(item)"
      >
        <UIcon
          v-if="arranging"
          name="i-lucide-grip-vertical"
          class="size-3.5 shrink-0 text-dimmed"
        />
        <span class="truncate text-xs font-semibold tracking-wide text-muted uppercase">{{ item.title }}</span>
        <span class="min-w-4 flex-1 border-t border-default" />
        <div class="flex opacity-0 group-hover/section:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            class="rounded p-0.5 text-dimmed hover:text-highlighted"
            :aria-label="`Add a snippet to ${item.title}`"
            :title="`Add a snippet to ${item.title}`"
            @click="addSnippet(item.id)"
            @dblclick.stop
          >
            <UIcon
              name="i-lucide-plus"
              class="block size-3.5"
            />
          </button>
          <button
            type="button"
            class="rounded p-0.5 text-dimmed hover:text-error"
            aria-label="Remove section heading"
            title="Remove heading (keeps its snippets)"
            @click="remove(item.id)"
            @dblclick.stop
          >
            <UIcon
              name="i-lucide-x"
              class="block size-3.5"
            />
          </button>
        </div>
      </div>
      <span
        v-else
        :draggable="!arranging"
        :title="item.text"
        class="group/chip inline-flex max-w-full cursor-grab items-center gap-1 rounded-md border bg-elevated py-1 ps-2 pe-1 text-sm hover:border-accented active:cursor-grabbing"
        :class="arranging ? 'border-dashed border-accented' : 'border-default'"
        data-testid="snippet"
        @dragstart="onDragStart($event, item.text)"
        @dblclick="startEdit(item)"
      >
        <UIcon
          v-if="arranging"
          name="i-lucide-grip-vertical"
          class="-ms-1 size-3.5 shrink-0 text-dimmed"
        />
        <span class="min-w-0 max-w-72 truncate">{{ item.text }}</span>
        <button
          type="button"
          class="rounded p-0.5 text-dimmed opacity-0 group-hover/chip:opacity-100 hover:text-error focus-visible:opacity-100"
          aria-label="Remove snippet"
          @click.stop="remove(item.id)"
          @dblclick.stop
        >
          <UIcon
            name="i-lucide-x"
            class="block size-3.5"
          />
        </button>
      </span>
    </li>
    <li class="flex flex-wrap items-center gap-1.5">
      <UButton
        icon="i-lucide-plus"
        label="Add snippet"
        color="neutral"
        variant="soft"
        size="xs"
        data-testid="add-snippet"
        @click="addSnippet()"
      />
      <UButton
        icon="i-lucide-separator-horizontal"
        label="Add section"
        color="neutral"
        variant="ghost"
        size="xs"
        data-testid="add-section"
        @click="insert(createSection())"
      />
    </li>
  </ul>
</template>

<script setup lang="ts">
import { insertNodeAt, removeNode, useSortable } from '@vueuse/integrations/useSortable'
import { createSection, createSnippet, moveItem, type SnippetItem } from '~/lib/workspace'
import { vSelectOnMount } from '~/utils/directives'
import { SNIPPET_MIME } from '~/utils/snippets'

const items = defineModel<SnippetItem[]>('items', { required: true })

const props = defineProps<{
  /** Dragging reorders items instead of carrying their text into a prompt. */
  arranging?: boolean
}>()

const list = useTemplateRef('list')
const editingId = ref<string | null>(null)
const draft = ref('')

const textOf = (item: SnippetItem) => item.kind === 'snippet' ? item.text : item.title

function startEdit(item: SnippetItem) {
  editingId.value = item.id
  draft.value = textOf(item)
}

function commit() {
  const id = editingId.value
  if (id === null) return
  editingId.value = null
  const text = draft.value.trim()
  if (!text) remove(id)
  else items.value = items.value.map(item => item.id !== id
    ? item
    : item.kind === 'snippet' ? { ...item, text } : { ...item, title: text })
}

function cancel() {
  const item = items.value.find(i => i.id === editingId.value)
  editingId.value = null
  // An item that was just added and never filled in goes away again.
  if (item && textOf(item) === '') remove(item.id)
}

function remove(id: string) {
  items.value = items.value.filter(item => item.id !== id)
}

function insert(item: SnippetItem, index = items.value.length) {
  items.value = [...items.value.slice(0, index), item, ...items.value.slice(index)]
  startEdit(item)
}

/** Adds a snippet at the end of the given section, or of the whole list. */
function addSnippet(sectionId?: string) {
  const start = items.value.findIndex(item => item.id === sectionId)
  const nextSection = start === -1 ? -1 : items.value.findIndex((item, i) => i > start && item.kind === 'section')
  insert(createSnippet(), nextSection === -1 ? items.value.length : nextSection)
}

function onDragStart(event: DragEvent, text: string) {
  if (!event.dataTransfer) return
  // Prompt editors read the snippet type and space the text; anything else gets it as is.
  event.dataTransfer.setData(SNIPPET_MIME, text)
  event.dataTransfer.setData('text/plain', text)
  event.dataTransfer.effectAllowed = 'copy'
}

const { option } = useSortable(list, items, {
  draggable: '[data-snippet-item]',
  disabled: !props.arranging,
  animation: 150,
  ghostClass: 'opacity-40',
  // Pointer-based, like block reordering, so nothing is dropped into an editor.
  forceFallback: true,
  fallbackClass: 'shadow-lg',
  // The sidebars slide with a transform, which would offset a clone kept inside them.
  fallbackOnBody: true,
  // Keep the remove buttons and the edit field usable.
  filter: 'button, input',
  preventOnFilter: false,
  onUpdate: ({ item, from, oldIndex, newIndex }) => {
    // Put the DOM back and let Vue re-render from the model.
    removeNode(item)
    insertNodeAt(from, item, oldIndex!)
    items.value = moveItem(items.value, oldIndex!, newIndex!)
  }
})

watch(() => props.arranging, arranging => option('disabled', !arranging))
</script>
