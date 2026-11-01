<template>
  <div class="min-w-0">
    <UInput
      :model-value="modelValue"
      :placeholder="placeholder"
      :color="error ? 'error' : 'neutral'"
      :highlight="!!error"
      class="w-full"
      :ui="{ base: 'font-mono text-xs' }"
      spellcheck="false"
      autocomplete="off"
      @update:model-value="value => emit('update:modelValue', String(value))"
    />
    <p
      v-if="error"
      class="mt-1 text-xs text-error"
    >
      {{ error }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { checkExpression } from '~/lib/flow/expression'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  /** Empty is fine (e.g. an optional field). */
  optional?: boolean
}>(), {
  placeholder: 'e.g. vars.score >= 8',
  optional: false
})
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const error = computed(() => {
  if (!props.modelValue.trim()) return props.optional ? null : 'Write an expression.'
  return checkExpression(props.modelValue)
})
</script>
