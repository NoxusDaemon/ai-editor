<template>
  <div
    class="mx-2 relative"
    @dragover.prevent="onDragOver"
  >
    <!-- Drop zone overlay -->
    <div
      v-if="isDragging"
      class="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-lg"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <div class="text-center text-white">
        <div class="text-6xl mb-4">
          📄
        </div>
        <p class="text-2xl font-bold">
          Drop file here
        </p>
        <p class="text-sm mt-2 text-gray-300">
          JSON or encrypted file
        </p>
      </div>
    </div>

    <TabsComponent v-model="totalJson" />
  </div>
</template>

<script lang="ts" setup>
import type { TabsItem } from '@nuxt/ui/runtime/components/Tabs.d.vue.js'
import FileComponent from '~/components/FileComponent.vue'

const totalJson = reactive<TabsItem[]>([])
const overlayResult = useState<{ [id: string]: { path?: string, password?: string, data?: object } }>('overlayResult', () => ({}))
const statePassword = useState<string>('password')
const isDragging = ref(false)
const overlay = useOverlay()
const modal = overlay.create(FileComponent)

watch(overlayResult, async (oResult) => {
  if ('readEncryptedFile' in oResult) {
    console.log('readEncryptedFile')
    const wResults = oResult['readEncryptedFile']
    if (wResults.password)
      if (wResults.path) {
        console.log('passed checks')
        try {
          const result = await useCrypto().decryptFile(wResults.path, wResults.password)
          totalJson.splice(0, totalJson.length)
          totalJson.length = 0
          // @ts-expect-error - result is unknown type from decrypt, but we know it's TabsItem[]
          totalJson.splice(0, 0, ...result)
        } catch (e) {
          console.log(e)
        }
        statePassword.value = wResults.password
      } else if (wResults.data) {
        totalJson.splice(0, totalJson.length)
        totalJson.length = 0
        // @ts-expect-error - result is unknown type from decrypt, but we know it's TabsItem[]
        totalJson.splice(0, 0, ...wResults.data)
      }
  } else if ('writeEncryptedFile' in oResult) {
    console.log('writeEncryptedFile')
    const wResults = oResult['writeEncryptedFile']
    if (wResults.path && wResults.password) {
      console.log('passed checks')
      await useCrypto().encryptFile(wResults.path, wResults.password, totalJson)
      console.log('wrote File')
      statePassword.value = wResults.password
    }
  }
}, { immediate: true, deep: true })

function onDragOver() {
  isDragging.value = true
}

function onDragLeave() {
  isDragging.value = false
}

async function onDrop(event: DragEvent) {
  isDragging.value = false
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return

  const file = files[0]!
  console.log('Dropped file:', file.name)

  try {
    // Read file as ArrayBuffer first
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)

    // Try to parse as JSON first
    try {
      const text = new TextDecoder().decode(uint8Array)
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) {
        // It's a valid JSON array — load it directly
        console.log('Loaded as JSON:', parsed.length, 'tabs')
        totalJson.splice(0, totalJson.length)
        totalJson.length = 0
        // @ts-expect-error - parsed is unknown type from JSON.parse, but we know it's TabsItem[]
        totalJson.splice(0, 0, ...parsed)
        return
      }
    } catch {
      // Not JSON — try to decrypt
    }

    // Not a valid JSON file — assume encrypted, ask for password
    console.log('Not JSON, trying decryption')

    // Store the raw file data for decryption
    const filePath = `dropped:${file.name}`
    // Store the file data in a state variable for the modal to use
    droppedFileData.value = {
      data: uint8Array,
      name: file.name
    }

    // Open password modal
    modal.open({ droppedFile: filePath, func: 'readEncryptedFile' })
  } catch (e) {
    console.error('Failed to process dropped file:', e)
  }
}

// Store dropped file data for decryption
const droppedFileData = useState<{ data: Uint8Array, name: string }>('droppedFileData', () => ({ data: new Uint8Array(), name: '' }))
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
