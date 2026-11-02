<template>
  <div
    class="flex h-full flex-col bg-default"
    role="dialog"
    :aria-label="`${meta.label}: ${node.title}`"
    data-testid="node-focus"
  >
    <header class="flex h-12 shrink-0 items-center gap-2 border-b border-default px-2">
      <UTooltip
        text="Back to the flow"
        :kbds="['escape']"
      >
        <UButton
          icon="i-lucide-arrow-left"
          label="Flow"
          color="neutral"
          variant="ghost"
          size="sm"
          data-testid="close-focus"
          @click="emit('close')"
        />
      </UTooltip>
      <nav
        v-if="trail.length"
        class="hidden min-w-0 items-center gap-1 text-sm text-muted md:flex"
        aria-label="Groups"
      >
        <template
          v-for="group in trail"
          :key="group.id"
        >
          <UIcon
            name="i-lucide-chevron-right"
            class="size-3.5 shrink-0"
          />
          <button
            type="button"
            class="truncate hover:text-default"
            @click="emit('open', group.id)"
          >
            {{ group.title }}
          </button>
        </template>
      </nav>
      <UIcon
        name="i-lucide-chevron-right"
        class="size-3.5 shrink-0 text-muted"
      />
      <UIcon
        :name="meta.icon"
        class="size-5 shrink-0"
        :class="meta.tone"
      />
      <input
        :value="node.title"
        class="min-w-0 flex-1 truncate rounded bg-transparent px-1 py-0.5 font-semibold text-highlighted outline-none hover:bg-elevated focus:bg-elevated focus:ring-1 focus:ring-primary"
        :placeholder="meta.label"
        aria-label="Title"
        data-testid="node-title"
        @input="event => workspace.updateNode(sessionId, node.id, { title: (event.target as HTMLInputElement).value })"
      >
      <UTooltip :text="`Used in placeholders, e.g. {{nodes.${node.key}.output}}`">
        <UInput
          v-model="keyDraft"
          size="xs"
          class="w-36"
          :color="keyError ? 'error' : 'neutral'"
          :highlight="!!keyError"
          :ui="{ base: 'font-mono' }"
          aria-label="Key"
          data-testid="node-key"
          @blur="commitKey"
          @keydown.enter.prevent="commitKey"
        >
          <template #leading>
            <span class="text-[10px] text-dimmed">key</span>
          </template>
        </UInput>
      </UTooltip>

      <UPopover v-if="problems.length">
        <UButton
          :icon="problems.some(p => p.severity === 'error') ? 'i-lucide-circle-x' : 'i-lucide-triangle-alert'"
          :label="String(problems.length)"
          :color="problems.some(p => p.severity === 'error') ? 'error' : 'warning'"
          variant="soft"
          size="sm"
        />
        <template #content>
          <ul class="max-w-sm space-y-1.5 p-3 text-xs">
            <li
              v-for="problem in problems"
              :key="problem.message"
              :class="problem.severity === 'error' ? 'text-error' : 'text-warning'"
            >
              {{ problem.message }}
            </li>
          </ul>
        </template>
      </UPopover>
      <FlowVariables
        v-if="node.kind !== 'note' && node.kind !== 'group'"
        :flow="flow"
      />
      <UDropdownMenu
        v-if="menu.length"
        :items="menu"
      >
        <UButton
          icon="i-lucide-ellipsis"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="More"
        />
      </UDropdownMenu>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <FlowSegmentEditor
        v-if="node.kind === 'segment'"
        :session-id="sessionId"
        :node="node"
      />
      <FlowConditionEditor
        v-else-if="node.kind === 'condition'"
        :session-id="sessionId"
        :node="node"
      />
      <FlowLoopEditor
        v-else-if="node.kind === 'loop'"
        :session-id="sessionId"
        :node="node"
      />
      <FlowSetEditor
        v-else-if="node.kind === 'set'"
        :session-id="sessionId"
        :node="node"
      />
      <FlowParallelEditor
        v-else-if="node.kind === 'parallel'"
        :session-id="sessionId"
        :node="node"
      />
      <FlowJoinEditor
        v-else-if="node.kind === 'join'"
        :session-id="sessionId"
        :node="node"
      />
      <FlowStartEditor
        v-else-if="node.kind === 'start'"
        :session-id="sessionId"
        :node="node"
      />
      <FlowMemoryEditor
        v-else-if="node.kind === 'memory'"
        :session-id="sessionId"
        :node="node"
      />
      <FlowKnowledgeEditor
        v-else-if="node.kind === 'knowledge'"
        :session-id="sessionId"
        :node="node"
      />
      <FlowGroupEditor
        v-else-if="node.kind === 'group'"
        :session-id="sessionId"
        :node="node"
        @open="id => emit('open', id)"
      />
      <FlowBasicEditor
        v-else
        :session-id="sessionId"
        :node="node"
      />

      <div
        v-if="lastStep && node.kind !== 'segment' && node.kind !== 'note'"
        class="mx-auto max-w-3xl px-6 pb-8"
      >
        <FlowSection
          title="Last run"
          icon="i-lucide-history"
        >
          <FlowStepDetails :step="lastStep" />
        </FlowSection>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { ancestors } from '~/lib/flow/graph'
import type { FlowNode } from '~/lib/flow/types'
import { validateFlow } from '~/lib/flow/validate'
import { NODE_META } from '~/utils/nodes'

const props = defineProps<{
  sessionId: string
  node: FlowNode
}>()
const emit = defineEmits<{
  close: []
  open: [nodeId: string]
}>()

const workspace = useWorkspaceStore()
const flowRun = useFlowRunStore()

const flow = computed(() => workspace.findFlow(props.sessionId)!)
const meta = computed(() => NODE_META[props.node.kind])
const trail = computed(() => ancestors(flow.value, props.node).toReversed())
const problems = computed(() => validateFlow(flow.value).filter(issue => issue.nodeId === props.node.id))
const lastStep = computed(() => flowRun.nodeStates(props.sessionId).get(props.node.id)?.step)

const keyDraft = ref(props.node.key)
const keyError = ref(false)
watch(() => props.node.key, (key) => {
  keyDraft.value = key
  keyError.value = false
})

function commitKey() {
  keyError.value = !workspace.setKey(props.sessionId, props.node.id, keyDraft.value)
  if (keyError.value) {
    useToast().add({
      title: 'Key not changed',
      description: 'Keys use letters, digits and _, start with a letter, and must be unique in the flow.',
      color: 'warning',
      icon: 'i-lucide-triangle-alert'
    })
    keyDraft.value = props.node.key
    keyError.value = false
  }
}

// A flow has exactly one Start: it can't be copied or deleted.
const menu = computed<DropdownMenuItem[][]>(() => props.node.kind === 'start'
  ? []
  : [
      [{
        label: 'Duplicate',
        icon: 'i-lucide-copy',
        onSelect: () => {
          const [copy] = workspace.duplicateNodes(props.sessionId, [props.node.id])
          if (copy) emit('open', copy.id)
        }
      }],
      [{
        label: props.node.kind === 'group' ? 'Delete with contents' : 'Delete',
        icon: 'i-lucide-trash-2',
        color: 'error' as const,
        onSelect: () => {
          emit('close')
          workspace.removeNodes(props.sessionId, [props.node.id])
        }
      }]
    ])
</script>
