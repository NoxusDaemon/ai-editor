<template>
  <div class="flex h-full min-h-0">
    <SegmentBlocks
      :session-id="sessionId"
      :segment="node"
      class="min-w-0 flex-1"
    />

    <aside class="w-80 shrink-0 space-y-6 overflow-y-auto border-l border-default bg-elevated/30 p-4 xl:w-96">
      <FlowSection
        title="Reply"
        icon="i-lucide-bot"
      >
        <USwitch
          :model-value="node.generate"
          label="Ask the model for a reply"
          description="Off: the messages are only added to the conversation, e.g. few-shot examples or instructions for later segments."
          data-testid="segment-generate"
          @update:model-value="generate => update({ generate })"
        />
        <FlowInheritSettings
          :session-id="sessionId"
          :node="node"
        />
      </FlowSection>

      <FlowSection
        title="Structured output"
        icon="i-lucide-braces"
        description="A JSON Schema the reply must match. The model is constrained to it where supported; replies are checked and, if wrong, the model is asked again with the problems."
      >
        <div class="flex items-center gap-2">
          <UDropdownMenu :items="presetItems">
            <UButton
              label="Start from…"
              icon="i-lucide-layout-template"
              color="neutral"
              variant="outline"
              size="xs"
            />
          </UDropdownMenu>
          <UButton
            v-if="node.schema"
            label="Remove"
            icon="i-lucide-eraser"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="update({ schema: '' })"
          />
        </div>
        <UTextarea
          :model-value="node.schema"
          placeholder="{ &quot;type&quot;: &quot;object&quot;, &quot;properties&quot;: { … } }"
          :rows="4"
          autoresize
          :maxrows="18"
          :color="schemaError ? 'error' : 'neutral'"
          :highlight="!!schemaError"
          class="w-full"
          :ui="{ base: 'font-mono text-xs' }"
          spellcheck="false"
          data-testid="segment-schema"
          @update:model-value="schema => update({ schema: String(schema) })"
        />
        <p
          v-if="schemaError"
          class="text-xs text-error"
        >
          {{ schemaError }}
        </p>
        <p
          v-else-if="fields.length"
          class="text-xs text-muted"
        >
          Use the fields as <code>nodes.{{ node.key }}.output.{{ fields[0] }}</code>, in conditions too.
        </p>
        <UFormField
          v-if="node.schema"
          label="Retries"
          help="Extra attempts when the reply doesn't match."
        >
          <UInput
            type="number"
            :min="0"
            :max="5"
            :model-value="node.retries"
            class="w-24"
            @update:model-value="value => update({ retries: Math.min(5, Math.max(0, Math.round(Number(value) || 0))) })"
          />
        </UFormField>
      </FlowSection>

      <FlowSection
        title="Output"
        icon="i-lucide-variable"
      >
        <UFormField
          label="Save as variable"
          :error="saveAsError"
          :help="`Always available as nodes.${node.key}.output; this also stores it as vars.<name>.`"
        >
          <UInput
            :model-value="node.saveAs"
            placeholder="e.g. draft"
            class="w-full"
            :ui="{ base: 'font-mono text-xs' }"
            @update:model-value="saveAs => update({ saveAs: String(saveAs).trim() })"
          />
        </UFormField>
        <UFormField
          label="Write to memory"
          help="Appends the output to store memories, e.g. facts to remember between runs."
        >
          <USelectMenu
            :model-value="node.memoryWrites"
            :items="storeItems"
            value-key="value"
            multiple
            placeholder="No memories"
            class="w-full"
            @update:model-value="ids => update({ memoryWrites: ids as string[] })"
          >
            <template #empty>
              <span class="text-xs">Add a Memory node of type “Store” first.</span>
            </template>
          </USelectMenu>
        </UFormField>
      </FlowSection>

      <FlowContextSources
        :session-id="sessionId"
        :node="node"
      />

      <FlowSection
        v-if="lastStep"
        title="Last run"
        icon="i-lucide-history"
      >
        <FlowStepDetails :step="lastStep" />
      </FlowSection>
    </aside>
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { KEY_PATTERN } from '~/lib/flow/graph'
import { parseSchema, SCHEMA_PRESETS, schemaFields } from '~/lib/flow/json-schema'
import type { SegmentNode } from '~/lib/flow/types'

const props = defineProps<{
  sessionId: string
  node: SegmentNode
}>()

const workspace = useWorkspaceStore()
const flowRun = useFlowRunStore()

function update(patch: Partial<SegmentNode>) {
  workspace.updateNode(props.sessionId, props.node.id, patch)
}

const schemaError = computed(() => {
  if (!props.node.schema.trim()) return null
  const parsed = parseSchema(props.node.schema)
  return parsed.ok ? null : parsed.error
})

const fields = computed(() => schemaFields(props.node.schema))

const presetItems = computed<DropdownMenuItem[]>(() => SCHEMA_PRESETS.map(preset => ({
  label: preset.label,
  description: preset.description,
  onSelect: () => update({ schema: JSON.stringify(preset.schema, null, 2) })
})))

const saveAsError = computed(() => props.node.saveAs && !KEY_PATTERN.test(props.node.saveAs) ? 'Use letters, digits and _.' : undefined)

const storeItems = computed(() => (workspace.findFlow(props.sessionId)?.nodes ?? [])
  .filter(node => node.kind === 'memory' && node.memory === 'store')
  .map(node => ({ label: node.title, value: node.id })))

const lastStep = computed(() => flowRun.nodeStates(props.sessionId).get(props.node.id)?.step)
</script>
