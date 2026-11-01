<template>
  <div class="mx-auto max-w-3xl space-y-8 p-6">
    <FlowSection
      title="Kind of memory"
      icon="i-lucide-brain"
      description="Memory is injected into the segments it's connected to, or into every segment of the group it sits in."
    >
      <URadioGroup
        :model-value="node.memory"
        :items="kinds"
        variant="card"
        @update:model-value="memory => update({ memory: memory as MemoryType })"
      />
    </FlowSection>

    <FlowSection
      v-if="node.memory === 'notes'"
      title="Notes"
      icon="i-lucide-sticky-note"
      description="Placeholders work here, e.g. {{vars.name}}."
    >
      <FlowTemplateInput
        :model-value="node.content"
        placeholder="e.g. The user is a nurse working nights. Keep answers short."
        :rows="8"
        @update:model-value="content => update({ content })"
      />
    </FlowSection>

    <FlowSection
      v-else-if="node.memory === 'buffer'"
      title="Recent messages"
      icon="i-lucide-history"
      description="Useful for segments that don't see the conversation themselves (isolated), such as a summariser."
    >
      <UFormField label="Messages">
        <UInput
          type="number"
          :min="1"
          :model-value="node.window"
          class="w-28"
          @update:model-value="value => update({ window: Math.max(1, Math.round(Number(value) || 1)) })"
        />
      </UFormField>
    </FlowSection>

    <FlowSection
      v-else
      title="Saved entries"
      icon="i-lucide-database"
      :description="`Segments with “Write to memory” set to this memory append their output here. ${node.entries.length} saved.`"
    >
      <USwitch
        :model-value="node.persist"
        label="Keep entries between runs"
        description="Saved with the workspace (and encrypted with it). Off: each run starts from the entries below."
        @update:model-value="persist => update({ persist })"
      />
      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField label="Inject">
          <USelect
            :model-value="node.recall"
            :items="[{ label: 'The most recent entries', value: 'recent' }, { label: 'The most relevant entries', value: 'relevant' }]"
            class="w-full"
            @update:model-value="recall => update({ recall: recall as 'recent' | 'relevant' })"
          />
        </UFormField>
        <UFormField label="At most">
          <UInput
            type="number"
            :min="1"
            :model-value="node.limit"
            class="w-28"
            @update:model-value="value => update({ limit: Math.max(1, Math.round(Number(value) || 1)) })"
          />
        </UFormField>
      </div>
      <UFormField
        v-if="node.recall === 'relevant'"
        label="Relevant to"
        help="Entries are ranked by keyword relevance (BM25) to this."
      >
        <FlowTemplateInput
          :model-value="node.query"
          :rows="1"
          mono
          @update:model-value="query => update({ query })"
        />
      </UFormField>
      <ul class="max-h-80 space-y-1 overflow-y-auto">
        <li
          v-for="(entry, i) in node.entries"
          :key="i"
          class="group/entry flex items-start gap-2 rounded border border-default bg-default px-2 py-1.5 text-xs"
        >
          <span class="min-w-0 flex-1 whitespace-pre-wrap">{{ entry }}</span>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            class="opacity-0 group-hover/entry:opacity-100"
            aria-label="Forget this entry"
            @click="update({ entries: node.entries.filter((_, j) => j !== i) })"
          />
        </li>
      </ul>
      <div class="flex gap-2">
        <UInput
          v-model="draft"
          placeholder="Add an entry by hand…"
          size="sm"
          class="flex-1"
          @keydown.enter.prevent="addEntry"
        />
        <UButton
          label="Add"
          size="sm"
          color="neutral"
          variant="outline"
          :disabled="!draft.trim()"
          @click="addEntry"
        />
        <UButton
          v-if="node.entries.length"
          label="Forget all"
          size="sm"
          color="error"
          variant="ghost"
          @click="forgetAll"
        />
      </div>
    </FlowSection>

    <FlowSection
      title="Placement"
      icon="i-lucide-route"
    >
      <USelect
        :model-value="node.placement"
        :items="[
          { label: 'In the system prompt', value: 'system' },
          { label: 'As a message before the segment’s own', value: 'message' }
        ]"
        class="w-full sm:w-80"
        @update:model-value="placement => update({ placement: placement as Placement })"
      />
    </FlowSection>
  </div>
</template>

<script setup lang="ts">
import type { MemoryNode, MemoryType, Placement } from '~/lib/flow/types'
import { useServices } from '~/services/container'

const props = defineProps<{
  sessionId: string
  node: MemoryNode
}>()

const workspace = useWorkspaceStore()
const draft = ref('')

const update = (patch: Partial<MemoryNode>) => workspace.updateNode(props.sessionId, props.node.id, patch)

const kinds = [
  { label: 'Notes', value: 'notes', description: 'Fixed text: facts, a persona, a style guide' },
  { label: 'Recent messages', value: 'buffer', description: 'The last few messages of the conversation' },
  { label: 'Store', value: 'store', description: 'Entries written during runs, e.g. facts to remember' }
]

function addEntry() {
  if (!draft.value.trim()) return
  update({ entries: [...props.node.entries, draft.value.trim()] })
  draft.value = ''
}

async function forgetAll() {
  const confirmed = await useServices().dialogs.confirm({
    title: `Forget everything in ${props.node.title}?`,
    description: `${props.node.entries.length} entries will be removed. You can undo this from the canvas.`,
    confirmLabel: 'Forget all',
    danger: true
  })
  if (confirmed) update({ entries: [] })
}
</script>
