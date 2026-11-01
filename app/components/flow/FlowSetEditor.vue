<template>
  <div class="mx-auto max-w-3xl space-y-6 p-6">
    <FlowSection
      title="Variables"
      icon="i-lucide-variable"
      description="Each value is an expression, worked out in order, so later ones can use earlier ones. Read them anywhere as vars.<name> — use them as the state of a state machine, counters, or lists you build up."
    >
      <div
        v-for="(assignment, i) in node.assignments"
        :key="assignment.id"
        class="flex items-start gap-2"
        data-testid="assignment"
      >
        <UInput
          :model-value="assignment.name"
          placeholder="name"
          size="sm"
          class="w-40 shrink-0"
          :color="assignment.name && !KEY_PATTERN.test(assignment.name) ? 'error' : 'neutral'"
          :ui="{ base: 'font-mono text-xs' }"
          @update:model-value="name => patch(i, { name: String(name).trim() })"
        />
        <span class="mt-1.5 text-muted">=</span>
        <FlowExpressionInput
          :model-value="assignment.expression"
          placeholder="e.g. vars.tries + 1"
          class="flex-1"
          @update:model-value="expression => patch(i, { expression })"
        />
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          size="xs"
          aria-label="Remove variable"
          @click="update(node.assignments.filter((_, j) => j !== i))"
        />
      </div>
      <UButton
        label="Add variable"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        size="sm"
        @click="update([...node.assignments, { id: createId(), name: '', expression: '' }])"
      />
    </FlowSection>

    <FlowSection
      title="Examples"
      icon="i-lucide-lightbulb"
    >
      <ul class="space-y-1 font-mono text-xs text-muted">
        <li>state = "review"</li>
        <li>tries = default(vars.tries, 0) + 1</li>
        <li>notes = append(vars.notes, nodes.critique.output.feedback)</li>
        <li>summary = { title: nodes.title.text, words: len(split(last, " ")) }</li>
      </ul>
    </FlowSection>
  </div>
</template>

<script setup lang="ts">
import { createId } from '~/lib/blocks'
import { KEY_PATTERN } from '~/lib/flow/graph'
import type { Assignment, SetNode } from '~/lib/flow/types'

const props = defineProps<{
  sessionId: string
  node: SetNode
}>()

const workspace = useWorkspaceStore()

const update = (assignments: Assignment[]) => workspace.updateNode(props.sessionId, props.node.id, { assignments })
const patch = (index: number, change: Partial<Assignment>) =>
  update(props.node.assignments.map((a, i) => i === index ? { ...a, ...change } : a))
</script>
