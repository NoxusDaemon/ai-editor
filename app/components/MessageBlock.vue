<template>
  <section
    class="group/block overflow-hidden rounded-lg border border-l-4 border-default bg-default shadow-xs transition-shadow focus-within:shadow-md"
    :class="meta.accent"
    :data-role="block.role"
    data-testid="message-block"
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
      <USelect
        :model-value="block.role"
        :items="roleItems"
        :icon="meta.icon"
        variant="ghost"
        size="xs"
        class="w-32 font-medium"
        aria-label="Message role"
        @update:model-value="role => workspace.setRole(sessionId, segmentId, block.id, role)"
      />
      <UBadge
        v-if="streaming"
        label="Generating"
        icon="i-lucide-loader-circle"
        color="info"
        variant="subtle"
        size="sm"
        :ui="{ leadingIcon: 'animate-spin' }"
      />

      <UTooltip text="Rough estimate: 4 characters per token">
        <span class="ms-auto px-1 text-xs text-dimmed tabular-nums">≈ {{ tokens }} tokens</span>
      </UTooltip>
      <div class="flex items-center opacity-0 transition-opacity group-hover/block:opacity-100 group-focus-within/block:opacity-100">
        <UTooltip :text="copied ? 'Copied' : 'Copy'">
          <UButton
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Copy message"
            :disabled="!block.content"
            @click="copy(block.content)"
          />
        </UTooltip>
        <UTooltip text="Remove">
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="xs"
            aria-label="Remove message"
            data-testid="remove-block"
            @click="emit('remove')"
          />
        </UTooltip>
      </div>
    </header>

    <div
      v-if="reasoning"
      class="border-b border-default px-4 py-2"
    >
      <UChatReasoning
        :text="reasoning"
        :streaming="streaming"
      />
    </div>

    <PromptEditor
      :model-value="block.content"
      :placeholder="meta.placeholder"
      :readonly="streaming"
      @update:model-value="content => workspace.updateMessage(sessionId, segmentId, block.id, { content })"
    />
  </section>
</template>

<script setup lang="ts">
import { MESSAGE_ROLES, type MessageBlock } from '~/lib/workspace'
import { BLOCK_META } from '~/utils/blocks'

const props = defineProps<{
  sessionId: string
  segmentId: string
  block: MessageBlock
  streaming?: boolean
  reasoning?: string
}>()

const emit = defineEmits<{ remove: [] }>()

const workspace = useWorkspaceStore()
const { copy, copied } = useCopyButton()

const meta = computed(() => BLOCK_META[props.block.role])
const roleItems = MESSAGE_ROLES.map(role => ({ label: BLOCK_META[role].label, value: role, icon: BLOCK_META[role].icon }))
const tokens = computed(() => Math.ceil(props.block.content.length / 4))
</script>
