<template>
  <UPopover :content="{ align: 'end' }">
    <UButton
      icon="i-lucide-braces"
      label="Variables"
      color="neutral"
      variant="ghost"
      size="sm"
      data-testid="variables"
    />
    <template #content>
      <div class="max-h-[70vh] w-96 overflow-y-auto p-3">
        <p class="text-sm font-semibold text-highlighted">
          Placeholders
        </p>
        <p class="mt-1 text-xs text-muted">
          Write <code v-text="'{{ … }}'" /> in any message or template; it is filled in when the flow runs.
          Drag one into a message, or click to copy. Expressions work too, e.g.
          <code v-text="'{{ upper(vars.name) }}'" />.
        </p>
        <div
          v-for="section in sections"
          :key="section.title"
          class="mt-3"
        >
          <p class="mb-1 text-xs font-medium text-dimmed uppercase">
            {{ section.title }}
          </p>
          <div class="flex flex-col gap-0.5">
            <button
              v-for="item in section.items"
              :key="item.ref"
              type="button"
              draggable="true"
              class="flex cursor-grab items-baseline gap-2 rounded px-1.5 py-1 text-left hover:bg-elevated"
              @dragstart="onDragStart($event, item.ref)"
              @click="copy(placeholder(item.ref))"
            >
              <code
                class="shrink-0 text-xs text-primary"
                v-text="placeholder(item.ref)"
              />
              <span class="truncate text-xs text-muted">{{ item.description }}</span>
            </button>
          </div>
        </div>
        <p class="mt-3 text-xs text-dimmed">
          Functions: {{ FUNCTION_NAMES.join(', ') }}.
        </p>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { FUNCTION_NAMES } from '~/lib/flow/expression'
import type { Flow } from '~/lib/flow/types'
import { SNIPPET_MIME } from '~/utils/snippets'

const props = defineProps<{ flow: Flow }>()

const { copy } = useCopyButton()

const sections = computed(() => {
  const vars = new Set<string>()
  for (const node of props.flow.nodes) {
    if ((node.kind === 'segment' || node.kind === 'ask') && node.saveAs.trim()) vars.add(node.saveAs.trim())
    if (node.kind === 'set') node.assignments.forEach(a => a.name.trim() && vars.add(a.name.trim()))
  }
  const steps = props.flow.nodes.filter(node => ['segment', 'condition', 'loop', 'set', 'ask', 'parallel', 'join', 'start'].includes(node.kind))
  const memories = props.flow.nodes.filter(node => node.kind === 'memory')
  const hasLoop = props.flow.nodes.some(node => node.kind === 'loop')
  const hasParallel = props.flow.nodes.some(node => node.kind === 'parallel')
  return [
    {
      title: 'Run',
      items: [
        { ref: 'input', description: 'The run’s input (Start node)' },
        { ref: 'last', description: 'Output of the previous step' },
        { ref: 'error', description: 'The latest error, on an “On error” or “If a branch fails” path' }
      ]
    },
    { title: 'Variables', items: [...vars].map(name => ({ ref: `vars.${name}`, description: 'Set by a step' })) },
    {
      title: 'Steps',
      items: steps.flatMap(node => [
        { ref: `nodes.${node.key}.output`, description: `${node.title} — output (JSON fields with .name)` },
        ...(node.kind === 'segment' ? [{ ref: `nodes.${node.key}.text`, description: `${node.title} — reply text` }] : []),
        { ref: `nodes.${node.key}.visits`, description: `${node.title} — times run` }
      ])
    },
    ...(hasLoop
      ? [{
          title: 'Loop',
          items: [
            { ref: 'loop.index', description: 'Iteration, from 0' },
            { ref: 'loop.iteration', description: 'Iteration, from 1' },
            { ref: 'loop.item', description: 'Current item (for each)' },
            { ref: 'loop.total', description: 'Number of iterations, when known' }
          ]
        }]
      : []),
    ...(hasParallel
      ? [{
          title: 'Parallel branch',
          items: [
            { ref: 'branch.name', description: 'The branch’s name' },
            { ref: 'branch.item', description: 'Its item (for each item)' },
            { ref: 'branch.index', description: 'Its position, from 0' },
            { ref: 'branch.total', description: 'Number of branches' }
          ]
        }]
      : []),
    { title: 'Memory', items: memories.map(node => ({ ref: `memory.${node.key}`, description: `${node.title} — its current text` })) }
  ].filter(section => section.items.length)
})

const placeholder = (ref: string) => `{{${ref}}}`

function onDragStart(event: DragEvent, ref: string) {
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData(SNIPPET_MIME, placeholder(ref))
  event.dataTransfer.setData('text/plain', placeholder(ref))
}
</script>
