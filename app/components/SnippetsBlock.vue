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
        {{ arranging ? 'Drag to reorder · double-click to rename' : 'Drag into a prompt · double-click to edit · never sent to the model' }}
      </span>
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
      <UTooltip text="Remove">
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          size="xs"
          class="opacity-0 transition-opacity group-hover/block:opacity-100 group-focus-within/block:opacity-100"
          aria-label="Remove snippets"
          data-testid="remove-block"
          @click="emit('remove')"
        />
      </UTooltip>
    </header>

    <SnippetList
      :items="block.items"
      :arranging="arranging"
      class="p-3"
      @update:items="items => workspace.setSnippets(sessionId, block.id, items)"
    />
  </section>
</template>

<script setup lang="ts">
import type { SnippetsBlock } from '~/lib/workspace'
import { BLOCK_META } from '~/utils/blocks'

defineProps<{
  sessionId: string
  block: SnippetsBlock
}>()

const emit = defineEmits<{ remove: [] }>()

const workspace = useWorkspaceStore()

const arranging = ref(false)
</script>
