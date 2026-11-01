<template>
  <UModal
    :title="title"
    :description="description"
    :dismissible="false"
    :ui="{ footer: 'justify-end', description: 'whitespace-pre-wrap' }"
  >
    <template #body>
      <UTextarea
        v-model="answer"
        :rows="3"
        autoresize
        :maxrows="12"
        autofocus
        placeholder="Your answer…"
        class="w-full"
        data-testid="prompt-answer"
        @keydown.enter.exact.prevent="emit('close', answer)"
      />
      <p class="mt-1.5 text-xs text-dimmed">
        Enter to continue, Shift+Enter for a new line.
      </p>
    </template>
    <template #footer>
      <UButton
        label="Stop the run"
        color="neutral"
        variant="ghost"
        data-testid="prompt-cancel"
        @click="emit('close', null)"
      />
      <UButton
        :label="submitLabel"
        data-testid="prompt-submit"
        @click="emit('close', answer)"
      />
    </template>
  </UModal>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  description?: string
  submitLabel?: string
}>(), {
  description: undefined,
  submitLabel: 'Continue'
})

const emit = defineEmits<{ close: [answer: string | null] }>()

const answer = ref('')
</script>
