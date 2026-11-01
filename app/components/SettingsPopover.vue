<template>
  <UPopover :content="{ align: 'end' }">
    <UButton
      icon="i-lucide-settings"
      color="neutral"
      variant="ghost"
      aria-label="Settings"
    />

    <template #content>
      <div class="w-80 space-y-4 p-4">
        <p class="font-semibold text-highlighted">
          Settings
        </p>
        <UFormField
          label="LM Studio server"
          help="Enable the local server in LM Studio (with CORS). Leave empty for the default address."
        >
          <UInput
            v-model.trim="settings.lmStudioUrl"
            :placeholder="DEFAULT_LMSTUDIO_URL"
            icon="i-lucide-server"
            class="w-full"
          />
        </UFormField>
        <USwitch
          v-model="settings.reopenLastFile"
          label="Reopen the last file on startup"
        />
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { DEFAULT_LMSTUDIO_URL } from '~/services/llm'

const settings = useSettingsStore()
</script>
