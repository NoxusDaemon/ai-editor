<template>
  <aside
    class="flex h-full w-96 shrink-0 flex-col border-l border-default bg-default xl:w-[28rem]"
    aria-label="Run"
    data-testid="run-panel"
  >
    <header class="flex h-11 shrink-0 items-center gap-2 border-b border-default px-3">
      <UIcon
        :name="statusIcon"
        class="size-4"
        :class="[statusTone, { 'animate-spin': run?.status === 'running' }]"
      />
      <span class="text-sm font-semibold text-highlighted">{{ statusLabel }}</span>
      <span
        v-if="run"
        class="text-xs text-muted tabular-nums"
      >{{ run.steps.length }} step{{ run.steps.length === 1 ? '' : 's' }}{{ duration ? ` · ${duration}` : '' }}</span>
      <UButton
        v-if="run && run.status !== 'running'"
        icon="i-lucide-eraser"
        color="neutral"
        variant="ghost"
        size="xs"
        class="ms-auto"
        aria-label="Clear run"
        @click="flowRun.clear(sessionId)"
      />
      <UButton
        icon="i-lucide-panel-right-close"
        color="neutral"
        variant="ghost"
        size="xs"
        :class="{ 'ms-auto': !run || run.status === 'running' }"
        aria-label="Close run panel"
        @click="view.runPanelOpen = false"
      />
    </header>

    <UEmpty
      v-if="!run"
      icon="i-lucide-workflow"
      title="No run yet"
      description="Press Run to go through the flow from Start. Each step shows here: what was sent, what came back, and which way the run went."
      variant="naked"
      class="py-16"
    />

    <template v-else>
      <p
        v-if="run.error"
        class="mx-3 mt-3 rounded bg-error/10 px-2 py-1.5 text-xs whitespace-pre-wrap text-error"
      >
        {{ run.error }}
      </p>
      <UTabs
        v-model="tab"
        :items="tabs"
        variant="link"
        size="sm"
        class="min-h-0 flex-1"
        :ui="{ list: 'px-3', content: 'min-h-0 flex-1 overflow-y-auto px-3 pb-6' }"
      >
        <template #steps>
          <ol class="space-y-1.5 pt-2">
            <li
              v-for="step in run.steps"
              :key="step.id"
              class="rounded-lg border border-default"
              :class="{ 'border-info': step.status === 'running', 'border-error/60': step.status === 'error' }"
            >
              <button
                type="button"
                class="flex w-full items-center gap-2 px-2.5 py-2 text-left"
                @click="toggle(step.id)"
              >
                <UIcon
                  :name="NODE_META[step.kind].icon"
                  class="size-4 shrink-0"
                  :class="NODE_META[step.kind].tone"
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium text-default">{{ step.title }}<span
                    v-if="step.visit > 1"
                    class="text-dimmed"
                  > ×{{ step.visit }}</span></span>
                  <span
                    v-if="summaryOf(step)"
                    class="block truncate text-xs text-muted"
                  >{{ summaryOf(step) }}</span>
                </span>
                <UIcon
                  v-if="step.status === 'running'"
                  name="i-lucide-loader-circle"
                  class="size-3.5 shrink-0 animate-spin text-info"
                />
                <UIcon
                  v-else-if="step.status === 'error'"
                  name="i-lucide-circle-x"
                  class="size-3.5 shrink-0 text-error"
                />
                <UTooltip text="Show on the canvas">
                  <UButton
                    icon="i-lucide-locate-fixed"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    aria-label="Show on the canvas"
                    @click.stop="view.revealNode(sessionId, step.nodeId)"
                  />
                </UTooltip>
              </button>
              <div
                v-if="open.has(step.id) || step.status === 'running'"
                class="border-t border-default p-2.5"
              >
                <FlowStepDetails :step="step" />
              </div>
            </li>
          </ol>
        </template>

        <template #conversation>
          <div class="space-y-2 pt-2">
            <p
              v-if="!run.state.transcript.length"
              class="text-xs text-dimmed"
            >
              Nothing in the conversation yet. Setup-only segments don't add to it.
            </p>
            <div
              v-for="(message, i) in run.state.transcript"
              :key="i"
              class="rounded-lg border border-default p-2"
            >
              <p class="mb-1 flex items-center gap-1 text-xs font-medium text-dimmed">
                <UIcon
                  :name="BLOCK_META[message.role].icon"
                  class="size-3"
                />
                {{ BLOCK_META[message.role].label }}
                <span class="ms-auto truncate font-normal">{{ titleOf(message.nodeId) }}</span>
              </p>
              <p class="text-sm whitespace-pre-wrap">
                {{ message.content }}
              </p>
            </div>
          </div>
        </template>

        <template #variables>
          <div class="space-y-3 pt-2 text-xs">
            <div>
              <p class="mb-1 font-medium text-dimmed uppercase">
                vars
              </p>
              <pre class="overflow-auto rounded bg-elevated p-2 whitespace-pre-wrap">{{ formatValue(run.state.vars) || '{}' }}</pre>
            </div>
            <div>
              <p class="mb-1 font-medium text-dimmed uppercase">
                nodes
              </p>
              <pre class="overflow-auto rounded bg-elevated p-2 whitespace-pre-wrap">{{ formatValue(nodeOutputs) }}</pre>
            </div>
          </div>
        </template>

        <template #output>
          <div class="pt-2">
            <pre
              v-if="run.status !== 'running'"
              class="overflow-auto rounded bg-elevated p-3 text-sm whitespace-pre-wrap"
              data-testid="run-output"
            >{{ formatValue(run.output) || '(empty)' }}</pre>
            <p
              v-else
              class="text-xs text-dimmed"
            >
              Still running…
            </p>
          </div>
        </template>
      </UTabs>
    </template>
  </aside>
</template>

<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import type { RunStep } from '~/lib/flow/engine'
import { formatValue } from '~/lib/flow/expression'
import { BLOCK_META } from '~/utils/blocks'
import { NODE_META } from '~/utils/nodes'

const props = defineProps<{ sessionId: string }>()

const flowRun = useFlowRunStore()
const workspace = useWorkspaceStore()
const view = useFlowViewStore()

const run = computed(() => flowRun.runs[props.sessionId])
const tab = ref('steps')
const open = ref(new Set<string>())

const tabs: TabsItem[] = [
  { label: 'Steps', value: 'steps', slot: 'steps' },
  { label: 'Conversation', value: 'conversation', slot: 'conversation' },
  { label: 'Variables', value: 'variables', slot: 'variables' },
  { label: 'Output', value: 'output', slot: 'output' }
]

watch(() => run.value?.status, (status, before) => {
  if (status === 'done' && before === 'running') tab.value = 'output'
  if (status === 'running') {
    tab.value = 'steps'
    open.value = new Set()
  }
})

function toggle(id: string) {
  const next = new Set(open.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  open.value = next
}

const titleOf = (nodeId: string) => workspace.findNode(props.sessionId, nodeId)?.title ?? ''

const nodeOutputs = computed(() => Object.fromEntries(Object.entries(run.value?.state.nodes ?? {}).map(([key, result]) => [key, result.output])))

function summaryOf(step: RunStep) {
  if (step.error) return step.error
  if (step.detail) return step.detail
  if (step.status === 'running' && step.text) return step.text.slice(-120)
  const output = formatValue(step.output).replace(/\s+/g, ' ')
  return output.length > 120 ? `${output.slice(0, 119)}…` : output
}

const statusLabel = computed(() => {
  if (!run.value) return 'Run'
  if (run.value.waitingNodeId) return 'Waiting for you'
  return { running: 'Running', done: 'Finished', stopped: 'Stopped', error: 'Failed' }[run.value.status]
})

const statusIcon = computed(() => {
  switch (run.value?.status) {
    case 'running': return 'i-lucide-loader-circle'
    case 'done': return 'i-lucide-circle-check'
    case 'error': return 'i-lucide-circle-x'
    case 'stopped': return 'i-lucide-circle-stop'
    default: return 'i-lucide-workflow'
  }
})

const statusTone = computed(() => ({ running: 'text-info', done: 'text-success', error: 'text-error', stopped: 'text-muted' })[run.value?.status ?? 'stopped'] ?? 'text-muted')

const duration = computed(() => {
  if (!run.value?.finishedAt) return ''
  const ms = run.value.finishedAt - run.value.startedAt
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
})
</script>
