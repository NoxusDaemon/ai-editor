<template>
  <div class="mx-auto max-w-3xl space-y-6 p-6">
    <template v-if="node.kind === 'ask'">
      <FlowSection
        title="Question"
        icon="i-lucide-message-circle-question"
        description="The run pauses here and shows this to whoever is running it. Declining stops the run."
      >
        <FlowTemplateInput
          :model-value="node.prompt"
          placeholder="e.g. Does this draft look right? {{vars.draft}}"
          @update:model-value="prompt => update({ prompt })"
        />
      </FlowSection>
      <FlowSection
        title="Answer"
        icon="i-lucide-variable"
      >
        <UFormField
          label="Save as variable"
          :error="node.saveAs && !KEY_PATTERN.test(node.saveAs) ? 'Use letters, digits and _.' : undefined"
        >
          <UInput
            :model-value="node.saveAs"
            placeholder="answer"
            class="w-60"
            :ui="{ base: 'font-mono text-xs' }"
            @update:model-value="saveAs => update({ saveAs: String(saveAs).trim() })"
          />
        </UFormField>
        <USwitch
          :model-value="node.addToConversation"
          label="Add the answer to the conversation"
          description="As a user message, so the next segments reply to it — the usual chat loop."
          @update:model-value="addToConversation => update({ addToConversation })"
        />
      </FlowSection>
    </template>

    <FlowSection
      v-else-if="node.kind === 'end'"
      title="Result"
      icon="i-lucide-flag"
      description="The run's output. A single placeholder such as {{nodes.extract.output}} keeps its value as it is, e.g. JSON."
    >
      <FlowTemplateInput
        :model-value="node.output"
        placeholder="{{last}}"
        mono
        @update:model-value="output => update({ output })"
      />
    </FlowSection>

    <FlowSection
      v-else-if="node.kind === 'note'"
      title="Note"
      icon="i-lucide-sticky-note"
      description="Documentation for whoever reads the flow. Never sent to the model."
    >
      <UTextarea
        :model-value="node.text"
        :rows="10"
        autoresize
        :maxrows="40"
        class="w-full"
        @update:model-value="text => update({ text: String(text) })"
      />
    </FlowSection>
  </div>
</template>

<script setup lang="ts">
import { KEY_PATTERN } from '~/lib/flow/graph'
import type { AskNode, EndNode, NoteNode } from '~/lib/flow/types'
import type { NodePatch } from '~/stores/workspace'

const props = defineProps<{
  sessionId: string
  node: AskNode | EndNode | NoteNode
}>()

const workspace = useWorkspaceStore()

const update = (patch: NodePatch) => workspace.updateNode(props.sessionId, props.node.id, patch)
</script>
