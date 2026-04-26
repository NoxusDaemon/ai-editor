<template>
  <div class="mx-2">
    <TabsComponent v-model="totalJson" />
  </div>
</template>

<script lang="ts" setup>
import type { TabsItem } from '@nuxt/ui/runtime/components/Tabs.d.vue.js'

const totalJson = ref<TabsItem[]>([])
const overlayResult = useState<{ [id: string]: { path: string, password?: string } }>('overlayResult', () => ({}))
const statePassword = useState<string>('password')

watch(overlayResult, async (oResult) => {
  if ('readEncryptedFile' in oResult) {
    const wResults = oResult['readEncryptedFile']
    if (wResults.path && wResults.password) {
      try {
        const result = await useCrypto().decryptFile(wResults.path, wResults.password) as TabsItem[]
        totalJson.value.splice(0, totalJson.value.length)
        if (Array.isArray(result)) {
          totalJson.value.splice(0, 0, ...result)
        }
      } catch (e) {
        console.error('Failed to decrypt file:', e)
      }
      statePassword.value = wResults.password
    }
    // Clean up to prevent re-processing on subsequent mutations
    delete overlayResult.value['readEncryptedFile']
  }
  if ('writeEncryptedFile' in oResult) {
    const wResults = oResult['writeEncryptedFile']
    if (wResults.path && wResults.password) {
      await useCrypto().encryptFile(wResults.path, wResults.password, totalJson)
      statePassword.value = wResults.password
    }
    // Clean up to prevent re-processing on subsequent mutations
    delete overlayResult.value['writeEncryptedFile']
  }
}, { immediate: true, deep: true })
</script>

<style>
pre {
  background: #090909;
  padding: 0.5rem;
  border-radius: 0.375rem;
  overflow-x: auto;
}

button span.truncate {
  width: stretch;
}

/* Hide the password reveal button in Edge */
::-ms-reveal {
  display: none;
}
</style>
