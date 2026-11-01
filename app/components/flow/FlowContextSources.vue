<template>
  <FlowSection
    title="Memory and knowledge"
    icon="i-lucide-brain"
    :description="node.kind === 'group'
      ? 'Injected into every segment inside this group: memory and knowledge nodes placed in the group, or connected to it.'
      : 'Injected into this segment’s prompt: from groups it is in, or connected to its top handle.'"
  >
    <ul
      v-if="sources.length"
      class="space-y-1"
    >
      <li
        v-for="source in sources"
        :key="source.node.id"
        class="flex items-center gap-2 rounded border border-default bg-default px-2 py-1.5 text-xs"
      >
        <UIcon
          :name="NODE_META[source.node.kind].icon"
          class="size-4 shrink-0"
          :class="NODE_META[source.node.kind].tone"
        />
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium text-default">{{ source.node.title }}</span>
          <span class="block truncate text-dimmed">{{ source.via }}</span>
        </span>
        <UTooltip
          v-if="source.edgeId"
          text="Disconnect"
        >
          <UButton
            icon="i-lucide-unlink"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Disconnect"
            @click="workspace.removeEdges(sessionId, [source.edgeId])"
          />
        </UTooltip>
      </li>
    </ul>
    <p
      v-else
      class="text-xs text-dimmed"
    >
      None yet.
    </p>
    <UDropdownMenu
      :items="connectItems"
      :disabled="!connectItems.length"
    >
      <UButton
        label="Connect…"
        icon="i-lucide-cable"
        color="neutral"
        variant="outline"
        size="xs"
        :disabled="!connectItems.length"
      />
    </UDropdownMenu>
  </FlowSection>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { ancestors, contextSources, isContextEdge } from '~/lib/flow/graph'
import { createNode, isContextNode, type ContextNode, type GroupNode, type SegmentNode } from '~/lib/flow/types'
import { NODE_META } from '~/utils/nodes'

const props = defineProps<{
  sessionId: string
  node: SegmentNode | GroupNode
}>()

const workspace = useWorkspaceStore()
const flow = computed(() => workspace.findFlow(props.sessionId)!)

interface Source {
  node: ContextNode
  via: string
  /** Set when the connection is to this node itself, so it can be removed here. */
  edgeId?: string
}

const sources = computed<Source[]>(() => {
  // A group's sources are what a segment directly inside it would get.
  const probe = props.node.kind === 'segment' ? props.node : createNode('segment', { key: '_probe', parentId: props.node.id })
  const groups = ancestors(flow.value, probe)
  return contextSources(flow.value, probe).map((source) => {
    const edge = flow.value.edges.find(e => isContextEdge(e) && e.source === source.id && e.target === props.node.id)
    if (edge) return { node: source, via: 'Connected here', edgeId: edge.id }
    const inside = groups.find(group => source.parentId === group.id)
    if (inside) return { node: source, via: `Inside “${inside.title}”` }
    const linked = groups.find(group => flow.value.edges.some(e => isContextEdge(e) && e.source === source.id && e.target === group.id))
    return { node: source, via: linked ? `Connected to “${linked.title}”` : 'Connected' }
  })
})

const connectItems = computed<DropdownMenuItem[]>(() => flow.value.nodes
  .filter(isContextNode)
  .filter(candidate => !sources.value.some(source => source.node.id === candidate.id))
  .map(candidate => ({
    label: candidate.title,
    icon: NODE_META[candidate.kind].icon,
    onSelect: () => void workspace.connect(props.sessionId, { source: candidate.id, sourceHandle: 'ctx', target: props.node.id })
  })))
</script>
