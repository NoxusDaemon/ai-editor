<template>
  <div class="space-y-3">
    <UFormField
      label="Model"
      :help="node.kind === 'group' ? 'Used by every segment inside that doesn’t pick its own.' : 'Pick a different model for this segment, or inherit one.'"
    >
      <ModelSelect
        :model-value="node.model"
        :empty-label="`Inherit · ${inherited.model || 'any loaded model'}`"
        class="w-full"
        data-testid="node-model"
        @update:model-value="model => update({ model })"
      />
    </UFormField>

    <div class="grid grid-cols-2 gap-2">
      <UFormField label="Temperature">
        <UInput
          type="number"
          :step="0.1"
          :min="0"
          :max="2"
          :model-value="node.temperature ?? undefined"
          :placeholder="inherited.temperature === null ? 'Model default' : `Inherit · ${inherited.temperature}`"
          class="w-full"
          @update:model-value="value => update({ temperature: toNumber(value) })"
        />
      </UFormField>
      <UFormField label="Max tokens">
        <UInput
          type="number"
          :step="64"
          :min="1"
          :model-value="node.maxTokens ?? undefined"
          :placeholder="inherited.maxTokens === null ? 'No limit' : `Inherit · ${inherited.maxTokens}`"
          class="w-full"
          @update:model-value="value => update({ maxTokens: toInteger(value) })"
        />
      </UFormField>
    </div>

    <UFormField
      label="Sees"
      help="How much of the conversation so far is sent along."
    >
      <USelect
        :model-value="node.context"
        :items="contextItems"
        class="w-full"
        @update:model-value="context => update({ context: context as ContextSetting })"
      />
    </UFormField>
    <UFormField
      v-if="node.context === 'window'"
      label="Messages kept"
    >
      <UInput
        type="number"
        :min="1"
        :model-value="node.window"
        class="w-full"
        @update:model-value="value => update({ window: Math.max(1, toInteger(value) ?? 1) })"
      />
    </UFormField>

    <UFormField
      label="Setup only"
      help="Runs, but leaves nothing in the conversation. Its output stays available to later steps, e.g. as {{nodes.key.output}}."
    >
      <USelect
        :model-value="node.ephemeral === null ? 'inherit' : node.ephemeral ? 'yes' : 'no'"
        :items="[
          { label: `Inherit · ${inherited.ephemeral ? 'yes' : 'no'}`, value: 'inherit' },
          { label: 'Yes: setup only', value: 'yes' },
          { label: 'No: part of the conversation', value: 'no' }
        ]"
        class="w-full"
        data-testid="node-ephemeral"
        @update:model-value="value => update({ ephemeral: value === 'inherit' ? null : value === 'yes' })"
      />
    </UFormField>
  </div>
</template>

<script setup lang="ts">
import { resolveSettings } from '~/lib/flow/graph'
import { createNode, type ContextSetting, type GroupNode, type InheritableSettings, type SegmentNode } from '~/lib/flow/types'

const props = defineProps<{
  sessionId: string
  node: SegmentNode | GroupNode
}>()

const workspace = useWorkspaceStore()

/** What the node gets if it sets nothing itself: the settings of where it sits. */
const inherited = computed(() => {
  const session = workspace.findSession(props.sessionId)!
  const probe = createNode('segment', { key: '_probe', parentId: props.node.parentId })
  return resolveSettings(session.flow, session.model, probe)
})

const CONTEXT_LABELS = { conversation: 'The whole conversation', window: 'The last few messages', isolated: 'Nothing: only its own messages' }

const contextItems = computed(() => [
  { label: `Inherit · ${CONTEXT_LABELS[inherited.value.context].toLowerCase()}`, value: 'inherit' },
  ...Object.entries(CONTEXT_LABELS).map(([value, label]) => ({ label, value }))
])

function update(patch: Partial<InheritableSettings>) {
  workspace.updateNode(props.sessionId, props.node.id, patch)
}

function toNumber(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function toInteger(value: unknown): number | null {
  const number = toNumber(value)
  return number === null ? null : Math.max(1, Math.round(number))
}
</script>
