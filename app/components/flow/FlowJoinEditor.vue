<template>
  <div class="mx-auto max-w-3xl space-y-6 p-6">
    <FlowSection
      title="Wait for"
      icon="i-lucide-git-merge"
      description="Where the branches of a Parallel node meet again. The run goes on from here once they are done."
    >
      <URadioGroup
        :model-value="node.wait"
        :items="waits"
        orientation="horizontal"
        variant="card"
        data-testid="join-wait"
        @update:model-value="wait => update({ wait: wait as JoinWait })"
      />
      <USwitch
        :model-value="node.keepConversation"
        label="Keep the branches' messages in the conversation"
        description="Added in branch order. Off: only this node's output carries on, as {{last}}."
        data-testid="join-keep-conversation"
        @update:model-value="keepConversation => update({ keepConversation })"
      />
    </FlowSection>

    <FlowSection
      title="Output"
      icon="i-lucide-variable"
    >
      <p
        v-if="parallel"
        class="text-xs text-muted"
      >
        Joins the branches of “{{ parallel.title || parallel.key }}”.
        <template v-if="node.wait === 'first'">
          The output is the first branch's last output.
        </template>
        <template v-else-if="parallel.mode === 'map'">
          The output is a list of each item's last output, in item order.
        </template>
        <template v-else>
          The output is an object with each branch's last output, by name:
          <code>{{ example }}</code>
        </template>
      </p>
      <p
        v-else
        class="text-xs text-warning"
      >
        No Parallel node's branches lead here yet, so this node only passes the run on.
      </p>
      <p class="text-xs text-muted">
        If a branch fails, the others are stopped and the run takes “If a branch fails” with the error in <code v-text="'{{error}}'" />. With nothing connected there, the run fails.
      </p>
    </FlowSection>
  </div>
</template>

<script setup lang="ts">
import { branchNames, joinOf } from '~/lib/flow/graph'
import type { JoinNode, JoinWait, ParallelNode } from '~/lib/flow/types'

const props = defineProps<{
  sessionId: string
  node: JoinNode
}>()

const workspace = useWorkspaceStore()

const update = (patch: Partial<JoinNode>) => workspace.updateNode(props.sessionId, props.node.id, patch)

const parallel = computed(() => {
  const flow = workspace.findFlow(props.sessionId)
  return flow?.nodes.find((node): node is ParallelNode => node.kind === 'parallel' && joinOf(flow, node)?.id === props.node.id)
})

const example = computed(() => {
  const names = parallel.value ? branchNames(parallel.value) : []
  return `{{nodes.${props.node.key}.output.${names[0] ?? 'branch1'}}}`
})

const waits = [
  { label: 'Every branch', value: 'all', description: 'collect all their outputs' },
  { label: 'The first to finish', value: 'first', description: 'and stop the others' }
]
</script>
