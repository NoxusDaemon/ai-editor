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
import { useServices } from '~/services/container'
import { basename } from '~/services/files'

const doc = useDocumentStore()
const settings = useSettingsStore()
const remembersPaths = useServices().files.remembersPaths

const recentItems = computed<DropdownMenuItem[][]>(() => [
  settings.recentFiles.map(path => ({
    label: basename(path),
    description: path,
    icon: path.toLowerCase().endsWith('.aienc') ? 'i-lucide-file-lock' : 'i-lucide-file-json',
    onSelect: () => void doc.openRecent(path)
  })),
  [{ label: 'Clear recent files', icon: 'i-lucide-list-x', onSelect: () => doc.forgetRecent() }]
])

const items = computed<DropdownMenuItem[][]>(() => [
  [
    { label: 'New workspace', icon: 'i-lucide-file-plus', onSelect: () => void doc.newWorkspace() },
    { label: 'Open…', icon: 'i-lucide-folder-open', kbds: ['meta', 'o'], onSelect: () => void doc.open() },
    ...remembersPaths
      ? [{
          label: 'Open recent',
          icon: 'i-lucide-history',
          disabled: settings.recentFiles.length === 0,
          children: recentItems.value
        }]
      : []
  ],
  [
    { label: 'Save', icon: 'i-lucide-save', kbds: ['meta', 's'], onSelect: () => void doc.save() },
    { label: 'Save as JSON…', icon: 'i-lucide-file-json', kbds: ['meta', 'shift', 's'], onSelect: () => void doc.saveAs('json') },
    { label: 'Save encrypted…', icon: 'i-lucide-file-lock', onSelect: () => void doc.saveAs('encrypted') }
  ]
])
</script>
