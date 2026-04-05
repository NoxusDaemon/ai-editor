<template>
  <div class="mx-2">
    <TabsComponent v-model="totalJson" />

    <div v-if="filePath">
      Loading File {{ filePath }}
    </div>

    <p>totalJson:</p>
    <pre>{{ totalJson }}</pre>

    <br>

    <!-- Error Alert -->
    <UAlert v-if="error" color="error" variant="soft" class="mt-4" :description="error" @close="error = ''" />
  </div>
</template>

<script lang="ts" setup>
import type { TabsItem } from '@nuxt/ui/runtime/components/Tabs.d.vue.js'

const totalJson = reactive<TabsItem[]>([])
const filePath = useState<string>('filePath')
const error = useState<string>('error')
const overlayResult = useState<{ [id: string]: { path: string, password?: string } }>('overlayResult', () => ({}))
const statePassword = useState<string>('password')

watch(overlayResult, async (oResult) => {
  if ('readEncryptedFile' in oResult) {
    console.log('readEncryptedFile')
    const wResults = oResult['readEncryptedFile']
    if (wResults.path && wResults.password) {
      console.log('passed checks')
      try {
        const result = await useCrypto().decryptFile(wResults.path, wResults.password)
        totalJson.splice(0, totalJson.length)
        totalJson.length = 0
        // @ts-ignore
        totalJson.splice(0, 0, ...result)
      } catch (e) {
        console.log(e)
      }
      statePassword.value = wResults.password
    }
  } else if ('writeEncryptedFile' in oResult) {
    console.log('writeEncryptedFile')
    const wResults = oResult['writeEncryptedFile']
    if (wResults.path && wResults.password) {
      console.log('passed checks')
      await useCrypto().encryptFile(wResults.path, wResults.password, totalJson)
      console.log('wrote File');
      statePassword.value = wResults.password
    }
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
