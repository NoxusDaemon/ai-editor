<template>
  <div class="mx-auto max-w-3xl space-y-6 p-6">
    <FlowSection
      title="Repeat"
      icon="i-lucide-repeat"
      description="The run goes down “Each time” for every iteration; connect the end of that path back to this loop. When it is done, the run goes down “Done”."
    >
      <URadioGroup
        :model-value="node.mode"
        :items="modes"
        orientation="horizontal"
        variant="card"
        @update:model-value="mode => update({ mode: mode as LoopMode })"
      />

      <UFormField
        v-if="node.mode === 'count'"
        label="Times"
      >
        <UInput
          type="number"
          :min="0"
          :model-value="node.count"
          class="w-28"
          @update:model-value="value => update({ count: Math.max(0, Math.round(Number(value) || 0)) })"
        />
      </UFormField>
      <UFormField
        v-else-if="node.mode === 'while'"
        label="While"
        help="Checked before each iteration, including the first."
      >
        <FlowExpressionInput
          :model-value="node.condition"
          placeholder="e.g. nodes.review.output.score < 8"
          @update:model-value="condition => update({ condition })"
        />
      </UFormField>
      <UFormField
        v-else
        label="Items"
        help="An expression giving a list, worked out when the loop starts. The current item is loop.item."
      >
        <FlowExpressionInput
          :model-value="node.items"
          placeholder="e.g. nodes.extract.output.people"
          @update:model-value="items => update({ items })"
        />
      </UFormField>

      <UFormField
        label="At most"
        help="A safety limit, whatever the mode."
      >
        <UInput
          type="number"
          :min="1"
          :model-value="node.max"
          class="w-28"
          @update:model-value="value => update({ max: Math.max(1, Math.round(Number(value) || 1)) })"
        />
      </UFormField>
    </FlowSection>

    <FlowSection
      title="Inside the loop"
      icon="i-lucide-braces"
    >
      <ul class="space-y-1 text-xs text-muted">
        <li><code v-text="'{{loop.index}}'" /> the iteration, from 0; <code v-text="'{{loop.iteration}}'" /> from 1</li>
        <li><code v-text="'{{loop.item}}'" /> the current item (for each)</li>
        <li><code v-text="'{{loop.total}}'" /> the number of iterations, when known</li>
      </ul>
    </FlowSection>
  </div>
</template>

<script setup lang="ts">
import type { LoopMode, LoopNode } from '~/lib/flow/types'

const props = defineProps<{
  sessionId: string
  node: LoopNode
}>()

const workspace = useWorkspaceStore()

const update = (patch: Partial<LoopNode>) => workspace.updateNode(props.sessionId, props.node.id, patch)

const modes = [
  { label: 'A number of times', value: 'count', description: 'e.g. three drafts' },
  { label: 'For each item', value: 'forEach', description: 'over a list' },
  { label: 'While true', value: 'while', description: 'until a condition fails' }
]
</script>
