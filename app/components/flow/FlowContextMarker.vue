<template>
  <div
    v-if="sources.length"
    class="flex flex-wrap items-center gap-1.5 text-xs"
    :data-testid="`context-marker-${placement}`"
  >
    <UTooltip :text="placement === 'system' ? 'Added to the system prompt, before this segment’s own system messages' : 'Added as a message here, after the conversation so far and before this segment’s own messages'">
      <span class="flex items-center gap-1 font-medium text-secondary">
        <UIcon
          name="i-lucide-text-cursor"
          class="size-3.5"
        />
        {{ placement === 'system' ? 'System prompt adds' : 'Inserted here' }}
      </span>
    </UTooltip>
    <UPopover
      v-for="source in sources"
      :key="source.node.id"
      :content="{ align: 'start' }"
    >
      <UButton
        :icon="NODE_META[source.node.kind].icon"
        :label="source.node.title || NODE_META[source.node.kind].label"
        :trailing-icon="source.recalled && !source.recalled.text ? undefined : 'i-lucide-chevron-down'"
        color="secondary"
        variant="soft"
        size="xs"
        :class="source.recalled && !source.recalled.text && 'opacity-60'"
        data-testid="context-marker-source"
      />
      <template #content>
        <div class="w-96 max-w-[80vw] space-y-2 p-3 text-xs">
          <p class="flex items-center gap-1.5">
            <UIcon
              :name="NODE_META[source.node.kind].icon"
              class="size-4 shrink-0"
              :class="NODE_META[source.node.kind].tone"
            />
            <span class="min-w-0 flex-1 truncate font-semibold text-highlighted">{{ source.node.title }}</span>
            <UButton
              label="Open"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="view.focus(sessionId, source.node.id)"
            />
          </p>
          <p class="text-muted">
            {{ source.note }}
          </p>
          <pre
            v-if="source.text"
            class="max-h-72 overflow-auto rounded bg-elevated p-2 whitespace-pre-wrap text-default"
            data-testid="context-marker-text"
          >{{ source.text }}</pre>
        </div>
      </template>
    </UPopover>
  </div>
</template>

<script setup lang="ts">
import type { RecalledContext } from '~/lib/flow/engine'
import { contextSources } from '~/lib/flow/graph'
import type { ContextNode, Placement, SegmentNode } from '~/lib/flow/types'
import { NODE_META } from '~/utils/nodes'

const props = defineProps<{
  sessionId: string
  segment: SegmentNode
  placement: Placement
}>()

const workspace = useWorkspaceStore()
const flowRun = useFlowRunStore()
const view = useFlowViewStore()

/** What a source holds now, before a run fills in its placeholders or searches. */
function preview(node: ContextNode): { note: string, text: string } {
  if (node.kind === 'knowledge') {
    const docs = node.documents.length
    return {
      note: `${docs} document${docs === 1 ? '' : 's'}. When the flow runs, the ${node.topK} passages that best match the search are added, numbered for citations.`,
      text: `Search for: ${node.query || '{{input}}'}`
    }
  }
  switch (node.memory) {
    case 'buffer':
      return { note: `The last ${node.window} messages of the conversation, when the flow runs.`, text: '' }
    case 'store': {
      const recent = node.entries.slice(-node.limit)
      return {
        note: node.recall === 'relevant'
          ? `${node.entries.length} saved entries; the ${node.limit} most relevant to “${node.query || '{{input}}'}” are added when the flow runs. The latest ones:`
          : `The latest ${node.limit} of ${node.entries.length} saved entries.`,
        text: recent.map(entry => `- ${entry}`).join('\n')
      }
    }
    default:
      return { note: 'Placeholders are filled in when the flow runs.', text: node.content }
  }
}

const sources = computed(() => {
  const flow = workspace.findFlow(props.sessionId)
  if (!flow) return []
  const lastRun = flowRun.nodeStates(props.sessionId).get(props.segment.id)?.step.recalled
  return contextSources(flow, props.segment)
    .filter(node => node.placement === props.placement)
    .map((node) => {
      const recalled: RecalledContext | undefined = lastRun?.find(item => item.nodeId === node.id)
      if (recalled) {
        return { node, recalled, note: recalled.text ? 'Recalled in the last run:' : 'Nothing to recall in the last run.', text: recalled.text }
      }
      return { node, recalled, ...preview(node) }
    })
})
</script>
