<template>
  <div class="flex min-h-0 flex-col">
    <div
      ref="scroller"
      class="min-h-0 flex-1 overflow-y-auto"
    >
      <div class="mx-auto w-full max-w-4xl px-4 py-5">
        <div
          ref="list"
          class="flex flex-col gap-3"
          data-testid="block-list"
        >
          <template
            v-for="block in session.blocks"
            :key="block.id"
          >
            <MessageBlock
              v-if="block.kind === 'message'"
              :session-id="session.id"
              :block="block"
              :streaming="streamingBlockId === block.id"
              :reasoning="run?.blockId === block.id ? run.reasoning : ''"
              @remove="workspace.removeBlock(session.id, block.id)"
            />
            <SnippetsBlock
              v-else
              :session-id="session.id"
              :block="block"
              @remove="workspace.removeBlock(session.id, block.id)"
            />
          </template>
        </div>

        <UEmpty
          v-if="!session.blocks.length"
          icon="i-lucide-message-square-dashed"
          title="This session is empty"
          description="Add a system or user message below to start building a prompt."
          variant="naked"
          class="py-16"
        />
      </div>
    </div>

    <SessionComposer :session="session" />
  </div>
</template>

<script setup lang="ts">
import { insertNodeAt, removeNode, useSortable } from '@vueuse/integrations/useSortable'
import type { Session } from '~/lib/workspace'

const props = defineProps<{ session: Session }>()

const workspace = useWorkspaceStore()
const generation = useGenerationStore()

const list = useTemplateRef('list')
const scroller = useTemplateRef('scroller')

const run = computed(() => generation.runs[props.session.id])
const streamingBlockId = computed(() => run.value?.status === 'running' ? run.value.blockId : null)

useSortable(list, toRef(() => props.session.blocks), {
  handle: '[data-drag-handle]',
  animation: 150,
  ghostClass: 'opacity-40',
  // Pointer-based dragging: native drag-and-drop would carry the block's text,
  // which the editors underneath happily insert.
  forceFallback: true,
  fallbackClass: 'shadow-lg',
  onUpdate: ({ item, from, oldIndex, newIndex }) => {
    // Put the DOM back and let Vue re-render from the store.
    removeNode(item)
    insertNodeAt(from, item, oldIndex!)
    workspace.moveBlock(props.session.id, oldIndex!, newIndex!)
  }
})

// Follow a streaming reply, unless the user has scrolled up to read something else.
const streamedLength = computed(() => {
  const block = props.session.blocks.find(b => b.id === streamingBlockId.value)
  return block?.kind === 'message' ? block.content.length + (run.value?.reasoning.length ?? 0) : 0
})

watch(streamedLength, () => {
  const el = scroller.value
  if (!el || el.scrollHeight - el.scrollTop - el.clientHeight > 120) return
  nextTick(() => el.scrollTo({ top: el.scrollHeight }))
}, { flush: 'pre' })
</script>
