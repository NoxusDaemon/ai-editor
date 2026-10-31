<template>
  <UApp
    :toaster="{ position: 'bottom-right', ui: { viewport: 'bottom-16' } }"
    :tooltip="{ delayDuration: 400 }"
  >
    <div class="flex h-dvh flex-col overflow-hidden">
      <AppHeader />
      <SessionTabs />
      <SessionView
        :key="workspace.activeSession.id"
        :session="workspace.activeSession"
        class="min-h-0 flex-1"
      />
    </div>
    <FileDropOverlay @drop="file => doc.openDropped(file)" />
  </UApp>
</template>

<script setup lang="ts">
const workspace = useWorkspaceStore()
const doc = useDocumentStore()

useAppShortcuts()
useWindowGuard()
</script>
