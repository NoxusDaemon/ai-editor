<template>
  <div class="mx-auto max-w-3xl space-y-6 p-6">
    <FlowSection
      title="Run at the same time"
      icon="i-lucide-git-fork"
      description="Each branch starts from a copy of the conversation and variables, so branches don't see each other's work. Lead every branch to one Join node, where they meet again."
    >
      <URadioGroup
        :model-value="node.mode"
        :items="modes"
        orientation="horizontal"
        variant="card"
        data-testid="parallel-mode"
        @update:model-value="mode => update({ mode: mode as ParallelMode })"
      />

      <template v-if="node.mode === 'branches'">
        <div
          v-for="(branch, i) in node.branches"
          :key="branch.id"
          class="flex items-center gap-2 rounded-lg border border-default bg-default p-3"
          data-testid="parallel-branch"
        >
          <UInput
            :model-value="branch.label"
            :placeholder="`Branch ${i + 1}`"
            size="sm"
            class="min-w-0 flex-1"
            @update:model-value="label => patch(i, { label: String(label) })"
          />
          <code class="shrink-0 text-xs text-dimmed">.{{ names[i] }}</code>
          <UButton
            icon="i-lucide-arrow-up"
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="i === 0"
            aria-label="Move up"
            @click="update({ branches: moveItem(node.branches, i, i - 1) })"
          />
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="xs"
            aria-label="Remove branch"
            @click="update({ branches: node.branches.filter((_, j) => j !== i) })"
          />
        </div>
        <UButton
          label="Add branch"
          icon="i-lucide-plus"
          color="neutral"
          variant="outline"
          size="sm"
          data-testid="add-parallel-branch"
          @click="update({ branches: [...node.branches, { id: createId(), label: `Branch ${node.branches.length + 1}` }] })"
        />
      </template>
      <UFormField
        v-else
        label="Items"
        help="An expression giving a list. The “Each item” path runs once per item, all at the same time; each run sees its item as branch.item."
      >
        <FlowExpressionInput
          :model-value="node.items"
          placeholder="e.g. split(input, &quot;\n\n&quot;)"
          @update:model-value="items => update({ items })"
        />
      </UFormField>

      <UFormField
        label="At most at once"
        help="Branches beyond this wait for a free slot. LM Studio queues requests a model can't take yet, so a lower number mainly keeps memory use down."
      >
        <UInput
          type="number"
          :min="1"
          :model-value="node.concurrency"
          class="w-28"
          data-testid="parallel-concurrency"
          @update:model-value="value => update({ concurrency: Math.max(1, Math.round(Number(value) || 1)) })"
        />
      </UFormField>
    </FlowSection>

    <FlowSection
      title="Inside a branch"
      icon="i-lucide-braces"
    >
      <ul class="space-y-1 text-xs text-muted">
        <li><code v-text="'{{branch.name}}'" /> the branch's name (as above), or its position for each item</li>
        <li><code v-text="'{{branch.item}}'" /> the item (for each item)</li>
        <li><code v-text="'{{branch.index}}'" /> its position, from 0, and <code v-text="'{{branch.total}}'" /> how many branches there are</li>
      </ul>
      <p class="text-xs text-muted">
        After the Join, <code v-text="`{{nodes.${join?.key ?? 'join'}.output}}`" /> holds every branch's last output:
        {{ node.mode === 'map' ? 'a list, in item order.' : 'an object keyed by branch name.' }}
        If branches set the same variable, the last branch in order wins.
      </p>
    </FlowSection>
  </div>
</template>

<script setup lang="ts">
import { createId } from '~/lib/blocks'
import { branchNames, joinOf } from '~/lib/flow/graph'
import type { ParallelBranch, ParallelMode, ParallelNode } from '~/lib/flow/types'
import { moveItem } from '~/lib/workspace'

const props = defineProps<{
  sessionId: string
  node: ParallelNode
}>()

const workspace = useWorkspaceStore()

const update = (patch: Partial<ParallelNode>) => workspace.updateNode(props.sessionId, props.node.id, patch)
const patch = (index: number, change: Partial<ParallelBranch>) =>
  update({ branches: props.node.branches.map((branch, i) => i === index ? { ...branch, ...change } : branch) })

const names = computed(() => branchNames(props.node))
const join = computed(() => {
  const flow = workspace.findFlow(props.sessionId)
  return flow ? joinOf(flow, props.node) : undefined
})

const modes = [
  { label: 'Branches', value: 'branches', description: 'different paths, e.g. several reviewers' },
  { label: 'For each item', value: 'map', description: 'one path per item of a list' }
]
</script>
