<template>
  <div class="min-w-0">
    <UTextarea
      :model-value="modelValue"
      :placeholder="placeholder"
      :rows="rows"
      autoresize
      :maxrows="16"
      :color="problems.length ? 'error' : 'neutral'"
      :highlight="problems.length > 0"
      class="w-full"
      :ui="{ base: mono ? 'font-mono text-xs' : 'text-sm' }"
      @update:model-value="value => emit('update:modelValue', String(value))"
    />
    <p
      v-for="problem in problems"
      :key="problem"
      class="mt-1 text-xs text-error"
    >
      {{ problem }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { checkTemplate } from '~/lib/flow/template'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  rows?: number
  mono?: boolean
}>(), {
  placeholder: undefined,
  rows: 3,
  mono: false
})
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const problems = computed(() => checkTemplate(props.modelValue))
</script>
