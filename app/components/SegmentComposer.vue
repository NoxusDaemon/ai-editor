<template>
  <footer class="shrink-0 border-t border-default bg-default/90 backdrop-blur">
    <div class="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-2 px-4 py-2.5">
      <UFieldGroup size="sm">
        <UTooltip
          v-for="type in BLOCK_TYPES"
          :key="type"
          :text="`Add ${BLOCK_META[type].label.toLowerCase()} block`"
        >
          <UButton
            :icon="BLOCK_META[type].icon"
            color="neutral"
            variant="outline"
            :aria-label="`Add ${BLOCK_META[type].label} block`"
            :data-testid="`add-${type}`"
            @click="workspace.addBlock(sessionId, segment.id, type)"
          >
            <span class="hidden md:inline">{{ BLOCK_META[type].label }}</span>
          </UButton>
        </UTooltip>
      </UFieldGroup>

      <div class="ms-auto flex min-w-0 items-center gap-2">
        <span
          v-if="statusText"
          class="hidden truncate text-xs text-muted tabular-nums lg:inline"
          :class="{ 'text-error': run?.status === 'error' }"
          :title="run?.error"
        >{{ statusText }}</span>

        <UTooltip
          :text="running ? 'Stop generating' : continuing ? 'Carry on the last reply from where it ends. Add an assistant block for a new reply.' : 'Try this segment on its own: streams a reply into its last assistant block, or a new one'"
          :kbds="['meta', 'enter']"
        >
          <UButton
            v-if="running"
            label="Stop"
            icon="i-lucide-square"
            color="error"
            variant="soft"
            data-testid="stop"
            @click="generation.stop(segment.id)"
          />
          <UButton
            v-else
            :label="continuing ? 'Continue' : 'Send'"
            :icon="continuing ? 'i-lucide-text-cursor-input' : 'i-lucide-send-horizontal'"
            variant="soft"
            data-testid="send"
            @click="generation.send(sessionId, segment.id)"
          />
        </UTooltip>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import type { SegmentNode } from '~/lib/flow/types'
import { planGeneration } from '~/lib/workspace'
import { BLOCK_META, BLOCK_TYPES } from '~/utils/blocks'

const props = defineProps<{
  sessionId: string
  segment: SegmentNode
}>()

const workspace = useWorkspaceStore()
const generation = useGenerationStore()

const run = computed(() => generation.runs[props.segment.id])
const running = computed(() => run.value?.status === 'running')
/** Send carries on the reply in the last assistant block. */
const continuing = computed(() => planGeneration(props.segment.blocks).prefill.trim() !== '')

const statusText = computed(() => {
  const current = run.value
  if (!current || current.status === 'running') return current ? 'Generating…' : ''
  if (current.status === 'error') return 'Generation failed'
  const parts = [current.status === 'stopped' ? 'Stopped' : 'Done']
  const stats = current.stats
  if (stats?.predictedTokens) parts.push(`${stats.predictedTokens} tokens`)
  if (stats?.tokensPerSecond) parts.push(`${stats.tokensPerSecond.toFixed(1)} tok/s`)
  return parts.join(' · ')
})
</script>
