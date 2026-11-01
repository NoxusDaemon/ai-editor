<template>
  <UModal
    :title="title"
    :description="description"
    :ui="{ footer: 'justify-end' }"
  >
    <template #footer>
      <UButton
        :label="cancelLabel"
        color="neutral"
        variant="ghost"
        @click="emit('close', false)"
      />
      <UButton
        :label="confirmLabel"
        :color="danger ? 'error' : 'primary'"
        autofocus
        data-testid="confirm"
        @click="emit('close', true)"
      />
    </template>
  </UModal>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}>(), {
  description: undefined,
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  danger: false
})

const emit = defineEmits<{ close: [confirmed: boolean] }>()
</script>
