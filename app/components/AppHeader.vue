<template>
  <header class="flex h-12 shrink-0 items-center gap-3 border-b border-default px-3">
    <div class="flex items-center gap-2">
      <UIcon
        name="i-lucide-sparkles"
        class="size-5 text-primary"
      />
      <span class="hidden font-semibold text-highlighted sm:inline">AI Editor</span>
    </div>

    <USeparator
      orientation="vertical"
      class="h-5"
    />

    <div
      class="flex min-w-0 flex-1 items-center gap-2 text-sm"
      data-testid="document-status"
    >
      <UIcon
        :name="doc.encrypted ? 'i-lucide-file-lock' : 'i-lucide-file-text'"
        class="size-4 shrink-0"
        :class="doc.encrypted ? 'text-primary' : 'text-muted'"
      />
      <span
        class="truncate font-medium"
        :title="doc.file?.path ?? doc.fileName"
      >{{ doc.fileName }}</span>
      <UBadge
        v-if="doc.encrypted"
        label="Encrypted"
        color="primary"
        variant="subtle"
        size="sm"
        class="hidden md:inline-flex"
      />
      <UTooltip
        :text="statusTooltip"
        :disabled="!statusTooltip"
      >
        <span
          class="flex shrink-0 items-center gap-1.5 text-xs"
          :class="statusClass"
        >
          <UIcon
            v-if="statusIcon"
            :name="statusIcon"
            class="size-3.5"
            :class="{ 'animate-spin': doc.status === 'saving' }"
          />
          <span
            v-else
            class="size-2 rounded-full bg-warning"
          />
          <span class="hidden sm:inline">{{ statusLabel }}</span>
        </span>
      </UTooltip>
    </div>

    <div class="flex items-center gap-1.5">
      <UTooltip :text="doc.canAutosave ? 'Save changes automatically' : 'Save the workspace to a file to enable autosave'">
        <USwitch
          v-model="settings.autosave"
          label="Autosave"
          size="sm"
          :disabled="!doc.canAutosave"
          class="me-2"
        />
      </UTooltip>
      <FileMenu />
      <SettingsPopover />
      <UColorModeButton
        color="neutral"
        variant="ghost"
      />
    </div>
  </header>
</template>

<script setup lang="ts">
const doc = useDocumentStore()
const settings = useSettingsStore()

const statusLabel = computed(() => {
  if (doc.status === 'saving') return 'Saving…'
  if (doc.status === 'error') return 'Save failed'
  if (doc.dirty) return 'Unsaved changes'
  if (!doc.file) return ''
  return doc.canAutosave ? 'Saved' : 'Imported'
})

const statusIcon = computed(() => {
  if (doc.status === 'saving') return 'i-lucide-loader-circle'
  if (doc.status === 'error') return 'i-lucide-circle-alert'
  if (doc.dirty) return undefined
  if (!doc.file) return 'i-lucide-circle-dashed'
  return doc.canAutosave ? 'i-lucide-check' : 'i-lucide-download'
})

const statusClass = computed(() => doc.status === 'error' ? 'text-error' : 'text-muted')

const statusTooltip = computed(() => {
  if (doc.status === 'error') return doc.lastError ?? undefined
  if (doc.lastSavedAt) return `Last saved at ${doc.lastSavedAt.toLocaleTimeString()}`
  if (!doc.file) return 'Not saved to a file yet'
  return doc.canAutosave ? undefined : 'Opened by drag and drop. Saving asks where to store it.'
})
</script>
