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
            v-for="block in segment.blocks"
            :key="block.id"
          >
            <MessageBlock
              v-if="block.kind === 'message'"
              :session-id="sessionId"
              :segment-id="segment.id"
              :block="block"
              :streaming="streamingBlockId === block.id"
              :reasoning="run?.blockId === block.id ? run.reasoning : ''"
              @remove="workspace.removeBlock(sessionId, segment.id, block.id)"
            />
            <SnippetsBlock
              v-else
              :session-id="sessionId"
              :segment-id="segment.id"
              :block="block"
              @remove="workspace.removeBlock(sessionId, segment.id, block.id)"
            />
          </template>
        </div>

        <UEmpty
          v-if="!segment.blocks.length"
          icon="i-lucide-message-square-dashed"
          title="No messages"
          :description="segment.generate
            ? 'This segment replies to the conversation so far. Add messages to steer it.'
            : 'Add messages to put into the conversation.'"
          variant="naked"
          class="py-16"
        />
      </div>
    </div>

    <SegmentComposer
      :session-id="sessionId"
      :segment="segment"
    />
  </div>
</template>

<script setup lang="ts">
import { insertNodeAt, removeNode, useSortable } from '@vueuse/integrations/useSortable'
import type { SegmentNode } from '~/lib/flow/types'

const props = defineProps<{
  sessionId: string
  segment: SegmentNode
}>()

const workspace = useWorkspaceStore()
const generation = useGenerationStore()

const list = useTemplateRef('list')
const scroller = useTemplateRef('scroller')

const run = computed(() => generation.runs[props.segment.id])
const streamingBlockId = computed(() => run.value?.status === 'running' ? run.value.blockId : null)

useSortable(list, toRef(() => props.segment.blocks), {
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
    workspace.moveBlock(props.sessionId, props.segment.id, oldIndex!, newIndex!)
  }
})

// Follow a streaming reply, unless the user has scrolled up to read something else.
const streamedLength = computed(() => {
  const block = props.segment.blocks.find(b => b.id === streamingBlockId.value)
  return block?.kind === 'message' ? block.content.length + (run.value?.reasoning.length ?? 0) : 0
})

watch(streamedLength, () => {
  const el = scroller.value
  if (!el || el.scrollHeight - el.scrollTop - el.clientHeight > 120) return
  nextTick(() => el.scrollTo({ top: el.scrollHeight }))
}, { flush: 'pre' })
</script>
