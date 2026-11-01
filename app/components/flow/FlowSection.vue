<template>
  <section class="space-y-3">
    <header>
      <h3 class="flex items-center gap-1.5 text-sm font-semibold text-highlighted">
        <UIcon
          v-if="icon"
          :name="icon"
          class="size-4 text-muted"
        />
        {{ title }}
      </h3>
      <p
        v-if="description"
        class="mt-0.5 text-xs text-muted"
      >
        {{ description }}
      </p>
    </header>
    <slot />
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  icon?: string
}>()
</script>
