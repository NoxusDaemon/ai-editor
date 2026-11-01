<template>
  <div
    class="flex flex-col gap-1 rounded-lg border border-default bg-default/95 p-1 shadow-sm backdrop-blur"
    role="toolbar"
    aria-label="Add a node"
    aria-orientation="vertical"
  >
    <template
      v-for="(section, i) in sections"
      :key="section.title"
    >
      <USeparator
        v-if="i > 0"
        class="my-0.5"
      />
      <UTooltip
        v-for="kind in section.kinds"
        :key="kind"
        :text="`${NODE_META[kind].label}: ${NODE_META[kind].description}`"
        :content="{ side: 'right' }"
      >
        <UButton
          :icon="NODE_META[kind].icon"
          color="neutral"
          variant="ghost"
          size="sm"
          :class="NODE_META[kind].tone"
          :aria-label="`Add ${NODE_META[kind].label}`"
          :data-testid="`palette-${kind}`"
          draggable="true"
          @dragstart="onDragStart($event, kind)"
          @click="emit('add', kind)"
        />
      </UTooltip>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { NodeKind } from '~/lib/flow/types'
import { NODE_META, NODE_MIME, PALETTE_KINDS } from '~/utils/nodes'

const emit = defineEmits<{ add: [kind: NodeKind] }>()

const sections = (['Steps', 'Context', 'Layout'] as const).map(title => ({
  title,
  kinds: PALETTE_KINDS.filter(kind => NODE_META[kind].section === title)
}))

function onDragStart(event: DragEvent, kind: NodeKind) {
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData(NODE_MIME, kind)
}
</script>
