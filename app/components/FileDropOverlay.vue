<template>
  <Transition
    enter-from-class="opacity-0"
    leave-to-class="opacity-0"
    enter-active-class="transition-opacity duration-150"
    leave-active-class="transition-opacity duration-150"
  >
    <div
      v-if="isOver"
      class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-default/70 p-6 backdrop-blur-sm"
    >
      <div class="flex size-full max-h-96 max-w-xl flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-default/80 text-center">
        <UIcon
          name="i-lucide-file-down"
          class="size-12 text-primary"
        />
        <p class="text-lg font-semibold text-highlighted">
          Drop to open
        </p>
        <p class="text-sm text-muted">
          AI Editor workspace (.json) or encrypted workspace (.aienc)
        </p>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
const emit = defineEmits<{ drop: [file: File] }>()

const { isOver } = useFileDrop(file => emit('drop', file))
</script>
