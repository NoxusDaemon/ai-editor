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
            @click="workspace.addBlock(session.id, type)"
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

        <ModelSelect
          :model-value="session.model"
          @update:model-value="model => workspace.setModel(session.id, model)"
        />

        <UTooltip
          :text="running ? 'Stop generating' : 'Generate a reply'"
          :kbds="['meta', 'enter']"
        >
          <UButton
            v-if="running"
            label="Stop"
            icon="i-lucide-square"
            color="error"
            variant="soft"
            data-testid="stop"
            @click="generation.stop(session.id)"
          />
          <UButton
            v-else
            label="Send"
            icon="i-lucide-send-horizontal"
            data-testid="send"
            @click="generation.send(session.id)"
          />
        </UTooltip>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import type { Session } from '~/lib/workspace'
import { BLOCK_META, BLOCK_TYPES } from '~/utils/blocks'

const props = defineProps<{ session: Session }>()

const workspace = useWorkspaceStore()
const generation = useGenerationStore()

const run = computed(() => generation.runs[props.session.id])
const running = computed(() => run.value?.status === 'running')

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
