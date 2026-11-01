<template>
  <div
    v-if="group"
    class="relative h-full w-full rounded-xl border-2 border-dashed bg-elevated/30 transition-colors"
    :class="[selected ? 'border-primary bg-primary/5' : 'border-accented', running && 'border-info']"
    data-testid="flow-group"
  >
    <NodeResizer
      :min-width="240"
      :min-height="140"
      :is-visible="selected"
      color="var(--ui-primary)"
      @resize-end="({ params }) => workspace.resizeGroup(flowContext.sessionId, id, params)"
    />
    <Handle
      id="ctx"
      type="target"
      :position="Position.Bottom"
      class="context-handle"
      title="Memory and knowledge for everything inside"
    />

    <header class="flex items-center gap-2 px-3 py-2">
      <UIcon
        name="i-lucide-square-dashed"
        class="size-4 shrink-0 text-muted"
      />
      <span class="truncate text-sm font-semibold text-highlighted">{{ group.title || 'Group' }}</span>
      <div class="flex min-w-0 flex-1 flex-wrap gap-1">
        <UBadge
          v-for="badge in badges"
          :key="badge.label"
          :label="badge.label"
          :icon="badge.icon"
          color="neutral"
          variant="subtle"
          size="sm"
        />
      </div>
      <UTooltip text="Group settings">
        <UButton
          icon="i-lucide-settings-2"
          color="neutral"
          variant="ghost"
          size="xs"
          class="nodrag"
          aria-label="Group settings"
          data-testid="group-settings"
          @click.stop="flowContext.open(id)"
        />
      </UTooltip>
    </header>
  </div>
</template>

<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { NodeResizer } from '@vue-flow/node-resizer'
import { descendants } from '~/lib/flow/graph'
import { FLOW_CONTEXT } from '~/utils/flowContext'

const props = defineProps<{
  id: string
  selected?: boolean
}>()

const flowContext = inject(FLOW_CONTEXT)!
const workspace = useWorkspaceStore()

const group = computed(() => workspace.findNode(flowContext.sessionId, props.id, 'group'))

const running = computed(() => {
  const flow = workspace.findFlow(flowContext.sessionId)
  if (!flow || !group.value) return false
  return descendants(flow, props.id).some(node => flowContext.runStates.value.get(node.id)?.status === 'running')
})

const badges = computed(() => {
  const current = group.value
  if (!current) return []
  const list: { label: string, icon: string }[] = []
  if (current.model) list.push({ label: current.model.split('/').pop()!, icon: 'i-lucide-cpu' })
  if (current.temperature !== null) list.push({ label: `t ${current.temperature}`, icon: 'i-lucide-thermometer' })
  if (current.system.trim()) list.push({ label: 'System prompt', icon: 'i-lucide-settings-2' })
  if (current.ephemeral) list.push({ label: 'Setup only', icon: 'i-lucide-eye' })
  if (current.context === 'isolated') list.push({ label: 'Isolated', icon: 'i-lucide-unlink' })
  if (current.context === 'window') list.push({ label: `Last ${current.window}`, icon: 'i-lucide-history' })
  return list
})
</script>
