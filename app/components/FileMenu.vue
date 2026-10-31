<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'end' }"
    :ui="{ content: 'w-60' }"
  >
    <UButton
      label="File"
      icon="i-lucide-folder"
      trailing-icon="i-lucide-chevron-down"
      color="neutral"
      variant="outline"
      size="sm"
    />
  </UDropdownMenu>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const doc = useDocumentStore()

const items = computed<DropdownMenuItem[][]>(() => [
  [
    { label: 'New workspace', icon: 'i-lucide-file-plus', onSelect: () => void doc.newWorkspace() },
    { label: 'Open…', icon: 'i-lucide-folder-open', kbds: ['meta', 'o'], onSelect: () => void doc.open() }
  ],
  [
    { label: 'Save', icon: 'i-lucide-save', kbds: ['meta', 's'], onSelect: () => void doc.save() },
    { label: 'Save as JSON…', icon: 'i-lucide-file-json', kbds: ['meta', 'shift', 's'], onSelect: () => void doc.saveAs('json') },
    { label: 'Save encrypted…', icon: 'i-lucide-file-lock', onSelect: () => void doc.saveAs('encrypted') }
  ]
])
</script>
