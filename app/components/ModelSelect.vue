<template>
  <USelectMenu
    :model-value="selected"
    :items="items"
    value-key="value"
    :loading="generation.modelsStatus === 'loading'"
    icon="i-lucide-cpu"
    size="sm"
    class="w-44 sm:w-60"
    :search-input="{ placeholder: 'Search, or type a model key…' }"
    create-item
    aria-label="Model"
    @create="emit('update:modelValue', $event)"
    @update:model-value="value => emit('update:modelValue', value === ANY ? '' : String(value))"
    @update:open="open => open && generation.modelsStatus !== 'ready' && generation.loadModels()"
  >
    <template #empty>
      <span class="text-xs">{{ generation.modelsError ?? 'No models found.' }}</span>
    </template>
    <template #content-bottom>
      <div class="flex items-center justify-between gap-2 border-t border-default px-2 py-1.5 text-xs text-muted">
        <span
          class="truncate"
          :title="generation.modelsError ?? undefined"
        >{{ generation.modelsError ? 'LM Studio unreachable' : `${options.length} ${kind === 'embedding' ? 'embedding ' : ''}models in LM Studio` }}</span>
        <UButton
          icon="i-lucide-refresh-cw"
          label="Refresh"
          color="neutral"
          variant="ghost"
          size="xs"
          :loading="generation.modelsStatus === 'loading'"
          @click="generation.loadModels()"
        />
      </div>
    </template>
  </USelectMenu>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: string
  /** What an empty value means, e.g. "Inherit: qwen3-8b". */
  emptyLabel?: string
  kind?: 'llm' | 'embedding'
}>(), {
  emptyLabel: 'Any loaded model',
  kind: 'llm'
})
const emit = defineEmits<{ 'update:modelValue': [model: string] }>()

const generation = useGenerationStore()

// Empty strings are not valid list values, so "any model" gets a sentinel.
const ANY = '__any__'

const selected = computed(() => props.modelValue || ANY)
const options = computed(() => props.kind === 'embedding' ? generation.embeddingModels : generation.models)

const items = computed(() => {
  const list = [{ label: props.emptyLabel, value: ANY }, ...options.value]
  if (props.modelValue && !options.value.some(m => m.value === props.modelValue)) {
    list.push({ label: props.modelValue, value: props.modelValue })
  }
  return list
})
</script>
