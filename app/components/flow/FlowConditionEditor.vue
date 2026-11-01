<template>
  <div class="mx-auto max-w-3xl space-y-6 p-6">
    <FlowSection
      title="Cases"
      icon="i-lucide-split"
      description="Checked from top to bottom; the run takes the first case that is true, or “Else”. Each case is an output on the canvas to connect onwards."
    >
      <div
        v-for="(branch, i) in node.branches"
        :key="branch.id"
        class="flex items-start gap-2 rounded-lg border border-default bg-default p-3"
        data-testid="condition-branch"
      >
        <span class="mt-1.5 w-12 shrink-0 text-xs font-medium text-dimmed">Case {{ i + 1 }}</span>
        <div class="grid min-w-0 flex-1 gap-2 sm:grid-cols-[10rem_1fr]">
          <UInput
            :model-value="branch.label"
            placeholder="Label"
            size="sm"
            @update:model-value="label => patch(i, { label: String(label) })"
          />
          <FlowExpressionInput
            :model-value="branch.expression"
            placeholder="e.g. nodes.classify.output.category == &quot;billing&quot;"
            @update:model-value="expression => patch(i, { expression })"
          />
        </div>
        <UButton
          icon="i-lucide-arrow-up"
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="i === 0"
          aria-label="Move up"
          @click="move(i, i - 1)"
        />
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          size="xs"
          aria-label="Remove case"
          @click="update(node.branches.filter((_, j) => j !== i))"
        />
      </div>
      <div class="flex items-center gap-3">
        <UButton
          label="Add case"
          icon="i-lucide-plus"
          color="neutral"
          variant="outline"
          size="sm"
          data-testid="add-branch"
          @click="update([...node.branches, { id: createId(), label: '', expression: '' }])"
        />
        <span class="text-xs text-muted">Then: <strong>Else</strong>, when no case is true.</span>
      </div>
    </FlowSection>

    <FlowSection
      title="Examples"
      icon="i-lucide-lightbulb"
    >
      <ul class="space-y-1 font-mono text-xs text-muted">
        <li>nodes.review.output.score &gt;= 8</li>
        <li>contains(lower(last), "yes")</li>
        <li>vars.state == "done" or nodes.draft.visits &gt;= 3</li>
        <li>len(nodes.extract.output.items) == 0</li>
        <li>matches(input, "^\\d+$")</li>
      </ul>
    </FlowSection>
  </div>
</template>

<script setup lang="ts">
import { createId } from '~/lib/blocks'
import { moveItem } from '~/lib/workspace'
import type { ConditionBranch, ConditionNode } from '~/lib/flow/types'

const props = defineProps<{
  sessionId: string
  node: ConditionNode
}>()

const workspace = useWorkspaceStore()

const update = (branches: ConditionBranch[]) => workspace.updateNode(props.sessionId, props.node.id, { branches })
const patch = (index: number, change: Partial<ConditionBranch>) =>
  update(props.node.branches.map((branch, i) => i === index ? { ...branch, ...change } : branch))
const move = (from: number, to: number) => update(moveItem(props.node.branches, from, to))
</script>
