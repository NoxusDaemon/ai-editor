<template>
  <div class="mx-auto max-w-3xl space-y-8 p-6">
    <FlowSection
      title="System prompt"
      icon="i-lucide-settings-2"
      description="Added to the system prompt of every segment inside, after the flow's and outer groups' and before the segment's own."
    >
      <FlowTemplateInput
        :model-value="node.system"
        placeholder="e.g. You are a meticulous editor. Be specific."
        :rows="4"
        @update:model-value="system => workspace.updateNode(sessionId, node.id, { system })"
      />
    </FlowSection>

    <FlowSection
      title="Settings for everything inside"
      icon="i-lucide-sliders-horizontal"
      description="Segments inside use these unless they set their own. Nested groups can override them again."
    >
      <FlowInheritSettings
        :session-id="sessionId"
        :node="node"
      />
    </FlowSection>

    <FlowContextSources
      :session-id="sessionId"
      :node="node"
    />

    <FlowSection
      title="Inside"
      icon="i-lucide-boxes"
      :description="members.length ? 'Click one to open it.' : 'Drag nodes onto the group on the canvas to put them inside.'"
    >
      <div class="flex flex-wrap gap-1.5">
        <UButton
          v-for="member in members"
          :key="member.id"
          :label="member.title"
          :icon="NODE_META[member.kind].icon"
          color="neutral"
          variant="outline"
          size="xs"
          @click="emit('open', member.id)"
        />
      </div>
    </FlowSection>
  </div>
</template>

<script setup lang="ts">
import { descendants } from '~/lib/flow/graph'
import type { GroupNode } from '~/lib/flow/types'
import { NODE_META } from '~/utils/nodes'

const props = defineProps<{
  sessionId: string
  node: GroupNode
}>()
const emit = defineEmits<{ open: [nodeId: string] }>()

const workspace = useWorkspaceStore()

const members = computed(() => descendants(workspace.findFlow(props.sessionId)!, props.node.id))
</script>
