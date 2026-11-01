<template>
  <div
    v-if="node"
    class="group/card relative w-64 rounded-lg border border-t-4 border-default bg-default text-left shadow-sm transition-shadow hover:shadow-md"
    :class="[meta.accent, statusRing, node.kind === 'note' && 'bg-warning/10', selected && 'outline-2 outline-offset-2 outline-primary']"
    :data-kind="node.kind"
    data-testid="flow-node"
  >
    <Handle
      v-if="hasInput"
      id="in"
      type="target"
      :position="Position.Left"
    />
    <Handle
      v-if="takesContext"
      id="ctx"
      type="target"
      :position="Position.Bottom"
      class="context-handle"
      title="Memory and knowledge"
    />

    <header
      class="flex items-center gap-2 px-3"
      :class="compact ? 'py-3' : 'pt-2 pb-1'"
    >
      <UIcon
        :name="meta.icon"
        class="shrink-0"
        :class="[meta.tone, compact ? 'size-7' : 'size-4']"
      />
      <span
        class="min-w-0 flex-1 truncate font-medium text-highlighted"
        :class="compact ? 'text-xl' : 'text-sm'"
      >{{ node.title || meta.label }}</span>
      <UIcon
        v-if="state?.status === 'running'"
        name="i-lucide-loader-circle"
        class="size-4 shrink-0 animate-spin text-info"
      />
      <UTooltip
        v-else-if="problems.length"
        :text="problems.map(p => p.message).join('\n')"
      >
        <UIcon
          :name="problems.some(p => p.severity === 'error') ? 'i-lucide-circle-x' : 'i-lucide-triangle-alert'"
          class="size-4 shrink-0"
          :class="problems.some(p => p.severity === 'error') ? 'text-error' : 'text-warning'"
        />
      </UTooltip>
      <span
        v-if="!compact"
        class="shrink-0 font-mono text-[10px] text-dimmed"
      >{{ node.key }}</span>
    </header>

    <template v-if="!compact">
      <div class="space-y-1 px-3 pb-2 text-xs text-muted">
        <template v-if="node.kind === 'segment'">
          <p
            v-for="line in messageLines"
            :key="line.id"
            class="flex gap-1.5"
          >
            <UIcon
              :name="BLOCK_META[line.role].icon"
              class="mt-0.5 size-3 shrink-0 text-dimmed"
            />
            <span :class="detailed ? 'line-clamp-4' : 'line-clamp-2'">{{ line.text }}</span>
          </p>
          <p
            v-if="!messageLines.length"
            class="italic"
          >
            {{ node.generate ? 'Replies to the conversation so far' : 'Empty' }}
          </p>
        </template>
        <p
          v-else-if="summary"
          :class="node.kind === 'note' ? 'whitespace-pre-line text-default' : detailed ? 'line-clamp-6' : 'line-clamp-3'"
        >
          {{ summary }}
        </p>

        <p
          v-if="liveText"
          class="line-clamp-3 rounded bg-elevated px-2 py-1 text-default italic"
          data-testid="live-text"
        >
          {{ liveText }}
        </p>
        <p
          v-else-if="state?.status === 'error'"
          class="line-clamp-2 text-error"
        >
          {{ state.step.error }}
        </p>
      </div>

      <div
        v-if="badges.length"
        class="flex flex-wrap gap-1 px-3 pb-2"
      >
        <UBadge
          v-for="badge in badges"
          :key="badge.label"
          :label="badge.label"
          :icon="badge.icon"
          :color="badge.color ?? 'neutral'"
          variant="subtle"
          size="sm"
          class="max-w-full truncate"
        />
      </div>
    </template>

    <Handle
      v-if="mainOutput"
      :id="mainOutput.id"
      type="source"
      :position="Position.Right"
    />
    <div
      v-if="labelledOutputs.length"
      class="border-t border-default py-1"
    >
      <div
        v-for="handle in labelledOutputs"
        :key="handle.id"
        class="relative flex items-center justify-end py-0.5 pe-3 ps-6 text-[11px] text-muted"
        :class="handle.id === 'error' && 'text-error/80'"
      >
        <span class="truncate">{{ handle.label }}</span>
        <Handle
          :id="handle.id"
          type="source"
          :position="Position.Right"
          :class="handle.id === 'error' && 'error-handle'"
        />
      </div>
    </div>
    <Handle
      v-if="contextOutput"
      id="ctx"
      type="source"
      :position="Position.Top"
      class="context-handle"
      title="Drag to a segment or group to inject"
    />
  </div>
</template>

<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { acceptsContext, hasFlowInput, outputHandles } from '~/lib/flow/graph'
import { schemaFields } from '~/lib/flow/json-schema'
import type { MessageRole } from '~/lib/blocks'
import type { FlowNode } from '~/lib/flow/types'
import { BLOCK_META } from '~/utils/blocks'
import { NODE_META, previewText } from '~/utils/nodes'
import { FLOW_CONTEXT } from '~/utils/flowContext'

const props = defineProps<{
  id: string
  selected?: boolean
}>()

const flowContext = inject(FLOW_CONTEXT)!
const workspace = useWorkspaceStore()

const node = computed(() => workspace.findNode(flowContext.sessionId, props.id) as FlowNode | undefined)
const meta = computed(() => NODE_META[node.value?.kind ?? 'note'])
const compact = computed(() => flowContext.detail.value === 'compact')
const detailed = computed(() => flowContext.detail.value === 'full')
const state = computed(() => flowContext.runStates.value.get(props.id))
const problems = computed(() => flowContext.issues.value.get(props.id) ?? [])

const hasInput = computed(() => !!node.value && hasFlowInput(node.value))
const takesContext = computed(() => !!node.value && acceptsContext(node.value))
const outputs = computed(() => node.value ? outputHandles(node.value) : [])
const contextOutput = computed(() => outputs.value.some(h => h.id === 'ctx'))
const mainOutput = computed(() => outputs.value.find(h => h.id !== 'ctx' && !h.label))
const labelledOutputs = computed(() => outputs.value.filter(h => h.id !== 'ctx' && h.label))

const statusRing = computed(() => {
  switch (state.value?.status) {
    case 'running': return 'ring-2 ring-info shadow-lg'
    case 'error': return 'ring-2 ring-error'
    case 'done': return 'ring-1 ring-success/60'
    default: return ''
  }
})

const messageLines = computed(() => {
  const current = node.value
  if (current?.kind !== 'segment') return []
  return current.blocks
    .filter(block => block.kind === 'message' && block.content.trim())
    .slice(0, detailed.value ? 6 : 2)
    .map(block => ({ id: block.id, role: (block as { role: MessageRole }).role, text: previewText((block as { content: string }).content, detailed.value ? 400 : 140) }))
})

const liveText = computed(() => {
  const step = state.value?.step
  if (state.value?.status !== 'running' || !step?.text) return ''
  return step.text.length > 200 ? `…${step.text.slice(-200)}` : step.text
})

const summary = computed(() => {
  const current = node.value
  if (!current) return ''
  switch (current.kind) {
    case 'start': return current.input.trim() ? `Input: ${previewText(current.input)}` : 'Runs start here'
    case 'loop':
      if (current.mode === 'count') return `Repeat ${current.count} time${current.count === 1 ? '' : 's'}`
      if (current.mode === 'forEach') return `For each item in ${current.items || '…'}`
      return `While ${current.condition || '…'} (at most ${current.max})`
    case 'set': return current.assignments.filter(a => a.name).map(a => `${a.name} = ${a.expression}`).join('\n') || 'No variables yet'
    case 'ask': return previewText(current.prompt) || 'Asks for input'
    case 'end': return `Result: ${current.output || '{{last}}'}`
    case 'memory':
      if (current.memory === 'buffer') return `The last ${current.window} messages of the conversation`
      if (current.memory === 'store') return `${current.entries.length} saved entr${current.entries.length === 1 ? 'y' : 'ies'} · injects the ${current.recall === 'recent' ? `latest ${current.limit}` : `${current.limit} most relevant`}`
      return previewText(current.content) || 'Empty notes'
    case 'knowledge': {
      const docs = current.documents.length
      return `${docs} document${docs === 1 ? '' : 's'} · ${current.search} search · top ${current.topK}`
    }
    case 'note': return current.text.length > 400 ? `${current.text.slice(0, 400)}…` : current.text || 'Double-click to write…'
    default: return ''
  }
})

interface Badge {
  label: string
  icon?: string
  color?: 'primary' | 'secondary' | 'info' | 'warning' | 'error' | 'success' | 'neutral'
}

const badges = computed<Badge[]>(() => {
  const current = node.value
  const list: Badge[] = []
  if (!current) return list
  if (current.kind === 'segment') {
    if (current.model) list.push({ label: current.model.split('/').pop()!, icon: 'i-lucide-cpu' })
    if (current.temperature !== null) list.push({ label: `t ${current.temperature}`, icon: 'i-lucide-thermometer' })
    if (current.schema.trim()) {
      const fields = schemaFields(current.schema)
      list.push({ label: fields.length ? `JSON: ${fields.slice(0, 3).join(', ')}${fields.length > 3 ? '…' : ''}` : 'JSON', icon: 'i-lucide-braces', color: 'info' })
    }
    if (current.ephemeral) list.push({ label: 'Setup only', icon: 'i-lucide-eye', color: 'warning' })
    if (current.context === 'isolated') list.push({ label: 'Isolated', icon: 'i-lucide-unlink' })
    if (current.context === 'window') list.push({ label: `Last ${current.window}`, icon: 'i-lucide-history' })
    if (!current.generate) list.push({ label: 'No reply', icon: 'i-lucide-circle-pause' })
    if (current.saveAs) list.push({ label: `vars.${current.saveAs}`, icon: 'i-lucide-variable' })
    if (current.memoryWrites.length) list.push({ label: 'Writes memory', icon: 'i-lucide-brain', color: 'secondary' })
  }
  if ((current.kind === 'memory' || current.kind === 'knowledge') && current.placement === 'message') {
    list.push({ label: 'As a message', icon: 'i-lucide-message-square' })
  }
  if (current.kind === 'knowledge' && current.embeddingModel) list.push({ label: current.embeddingModel.split('/').pop()!, icon: 'i-lucide-cpu' })
  if (state.value && state.value.visits > 1) list.push({ label: `Ran ×${state.value.visits}`, icon: 'i-lucide-repeat', color: 'info' })
  return list
})
</script>
