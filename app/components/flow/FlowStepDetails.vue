<template>
  <div class="space-y-3 text-xs">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
      <span
        class="flex items-center gap-1 font-medium"
        :class="STATUS[step.status].tone"
      >
        <UIcon
          :name="STATUS[step.status].icon"
          class="size-3.5"
          :class="{ 'animate-spin': step.status === 'running' }"
        />
        {{ STATUS[step.status].label }}
      </span>
      <span v-if="step.visit > 1">Run {{ step.visit }}</span>
      <span v-if="duration">{{ duration }}</span>
      <span v-if="step.model">{{ step.model }}</span>
      <span v-if="step.attempts && step.attempts > 1">{{ step.attempts }} attempts</span>
      <span v-if="step.stats?.tokensPerSecond">{{ step.stats.predictedTokens }} tokens · {{ step.stats.tokensPerSecond.toFixed(1) }} tok/s</span>
    </div>
    <p
      v-if="step.detail"
      class="text-default"
    >
      {{ step.detail }}
    </p>
    <p
      v-if="step.error"
      class="rounded bg-error/10 px-2 py-1.5 whitespace-pre-wrap text-error"
    >
      {{ step.error }}
    </p>

    <section v-if="step.reasoning">
      <UChatReasoning
        :text="step.reasoning"
        :streaming="step.status === 'running'"
      />
    </section>

    <section v-if="hasOutput">
      <p class="mb-1 font-medium text-dimmed uppercase">
        Output
      </p>
      <pre class="max-h-80 overflow-auto rounded bg-elevated p-2 whitespace-pre-wrap text-default">{{ outputText }}</pre>
    </section>

    <section v-if="step.hits?.length">
      <p class="mb-1 font-medium text-dimmed uppercase">
        Retrieved passages
      </p>
      <ol class="space-y-1.5">
        <li
          v-for="(hit, i) in step.hits"
          :key="hit.id"
          class="rounded border border-default p-2"
        >
          <p class="mb-0.5 flex justify-between gap-2 font-medium text-default">
            <span class="truncate">[{{ i + 1 }}] {{ hit.source }}</span>
            <span class="shrink-0 text-dimmed tabular-nums">{{ hit.score.toFixed(2) }}</span>
          </p>
          <p class="line-clamp-4 whitespace-pre-wrap text-muted">
            {{ hit.text }}
          </p>
        </li>
      </ol>
    </section>

    <UCollapsible
      v-if="step.messages?.length"
      class="rounded border border-default"
    >
      <UButton
        :label="`Sent to the model (${step.messages.length} message${step.messages.length === 1 ? '' : 's'})`"
        icon="i-lucide-list-tree"
        trailing-icon="i-lucide-chevron-down"
        color="neutral"
        variant="ghost"
        size="xs"
        block
        class="justify-start"
        :ui="{ trailingIcon: 'ms-auto group-data-[state=open]:rotate-180 transition-transform' }"
      />
      <template #content>
        <div class="space-y-2 border-t border-default p-2">
          <div
            v-for="(message, i) in step.messages"
            :key="i"
          >
            <p class="mb-0.5 flex items-center gap-1 font-medium text-dimmed">
              <UIcon
                :name="BLOCK_META[message.role].icon"
                class="size-3"
              />
              {{ BLOCK_META[message.role].label }}
            </p>
            <pre class="max-h-64 overflow-auto rounded bg-elevated p-2 whitespace-pre-wrap text-default">{{ message.content }}</pre>
          </div>
        </div>
      </template>
    </UCollapsible>
  </div>
</template>

<script setup lang="ts">
import type { RunStep } from '~/lib/flow/engine'
import { formatValue } from '~/lib/flow/expression'
import { BLOCK_META } from '~/utils/blocks'

const props = defineProps<{ step: RunStep }>()

const STATUS = {
  running: { label: 'Running', icon: 'i-lucide-loader-circle', tone: 'text-info' },
  done: { label: 'Done', icon: 'i-lucide-circle-check', tone: 'text-success' },
  error: { label: 'Failed', icon: 'i-lucide-circle-x', tone: 'text-error' },
  stopped: { label: 'Stopped', icon: 'i-lucide-circle-stop', tone: 'text-muted' }
} as const

const hasOutput = computed(() => (props.step.output !== undefined && props.step.output !== null && props.step.output !== '')
  || (props.step.status === 'running' && !!props.step.text))

const outputText = computed(() => props.step.status === 'running' && props.step.text ? props.step.text : formatValue(props.step.output))

const duration = computed(() => {
  const { startedAt, finishedAt } = props.step
  if (!finishedAt) return ''
  const ms = finishedAt - startedAt
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
})
</script>
