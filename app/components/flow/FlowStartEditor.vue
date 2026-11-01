<template>
  <div class="mx-auto max-w-3xl space-y-8 p-6">
    <FlowSection
      title="Input"
      icon="i-lucide-play"
      description="What the run starts with, available everywhere as {{input}}. Also editable from the toolbar."
    >
      <UTextarea
        :model-value="node.input"
        placeholder="e.g. a question, a document to summarise, a topic…"
        :rows="4"
        autoresize
        :maxrows="20"
        class="w-full"
        data-testid="start-input"
        @update:model-value="input => workspace.updateNode(sessionId, node.id, { input: String(input) })"
      />
    </FlowSection>

    <FlowSection
      title="Flow settings"
      icon="i-lucide-settings-2"
      description="Defaults for every segment. Groups and segments can override them."
    >
      <UFormField
        label="Model"
        help="Segments and groups that don't choose a model use this one."
      >
        <ModelSelect
          :model-value="session.model"
          class="w-full"
          @update:model-value="model => workspace.setModel(sessionId, model)"
        />
      </UFormField>
      <UFormField
        label="System prompt"
        help="Comes first in every segment's system prompt, before groups' and the segment's own."
      >
        <FlowTemplateInput
          :model-value="settings.system"
          placeholder="e.g. You are a helpful assistant for…"
          @update:model-value="system => updateSettings({ system })"
        />
      </UFormField>
      <div class="grid grid-cols-2 gap-3">
        <UFormField label="Temperature">
          <UInput
            type="number"
            :step="0.1"
            :min="0"
            :max="2"
            :model-value="settings.temperature ?? undefined"
            placeholder="Model default"
            class="w-full"
            @update:model-value="value => updateSettings({ temperature: optionalNumber(value) })"
          />
        </UFormField>
        <UFormField label="Max tokens">
          <UInput
            type="number"
            :min="1"
            :model-value="settings.maxTokens ?? undefined"
            placeholder="No limit"
            class="w-full"
            @update:model-value="value => updateSettings({ maxTokens: optionalNumber(value, true) })"
          />
        </UFormField>
      </div>
      <UFormField
        label="Segments see"
        help="How much of the conversation so far segments get, unless they or their group say otherwise."
      >
        <USelect
          :model-value="settings.context"
          :items="[
            { label: 'The whole conversation', value: 'conversation' },
            { label: 'The last few messages', value: 'window' },
            { label: 'Nothing: only their own messages', value: 'isolated' }
          ]"
          class="w-full"
          @update:model-value="context => updateSettings({ context: context as ContextMode })"
        />
      </UFormField>
      <UFormField
        v-if="settings.context === 'window'"
        label="Messages kept"
      >
        <UInput
          type="number"
          :min="1"
          :model-value="settings.window"
          class="w-28"
          @update:model-value="value => updateSettings({ window: Math.max(1, Math.round(Number(value) || 1)) })"
        />
      </UFormField>
      <UFormField
        label="Step limit"
        help="A run stops after this many steps, so a loop that never ends can't run forever."
      >
        <UInput
          type="number"
          :min="1"
          :model-value="settings.maxSteps"
          class="w-28"
          @update:model-value="value => updateSettings({ maxSteps: Math.max(1, Math.round(Number(value) || 1)) })"
        />
      </UFormField>
    </FlowSection>
  </div>
</template>

<script setup lang="ts">
import type { ContextMode, FlowSettings, StartNode } from '~/lib/flow/types'

const props = defineProps<{
  sessionId: string
  node: StartNode
}>()

const workspace = useWorkspaceStore()
const session = computed(() => workspace.findSession(props.sessionId)!)
const settings = computed(() => session.value.flow.settings)

const updateSettings = (patch: Partial<FlowSettings>) => workspace.updateFlowSettings(props.sessionId, patch)

/** An emptied number field means "not set". */
function optionalNumber(value: unknown, positiveInteger = false): number | null {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return positiveInteger ? Math.max(1, Math.round(number)) : number
}
</script>
