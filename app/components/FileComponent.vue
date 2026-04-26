<template>
  <UModal
    v-model:open="open"
    title="File Selector"
    description="File Selector"
  >
    <template #content>
      <UInput
        v-model="password"
        :type="showPassword ? 'text' : 'password'"
        class="m-2"
        placeholder="password"
        :ui="{ trailing: 'pe-1' }"
      >
        <template #trailing>
          <UButton
            color="neutral"
            variant="link"
            size="sm"
            :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            :aria-label="showPassword ? 'Hide password' : 'Show password'"
            :aria-pressed="showPassword"
            aria-controls="password"
            @click="showPassword = !showPassword"
          />
        </template>
      </UInput>
      <div class="grid grid-cols-12">
        <UButton
          label="submit"
          class="mx-2 mb-2 col-span-2 col-end-13"
          :loading="isLoading"
          :disabled="isLoading || !password"
          @click="submit"
        />
      </div>
      <UAlert
        v-if="errorMessage"
        type="error"
        :description="errorMessage"
        class="m-2"
      />
    </template>
  </UModal>
</template>

<script setup lang="ts">
const showPassword = ref(false)
const password = ref('')
const props = defineProps<{ droppedFile: string, func: 'readEncryptedFile' | 'writeEncryptedFile' }>()
const overlayResult = useState<{ [id: string]: { path: string, password?: string } }>('overlayResult', () => ({}))

const open = ref(false)
const errorMessage = ref('')
const isLoading = ref(false)

async function submit() {
  if (!password.value) {
    errorMessage.value = 'Password is required'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    if (props.func === 'readEncryptedFile') {
      // Verify password by attempting to decrypt the file header
      const canDecryptResult = await useFileHandler().canDecrypt(props.droppedFile, password.value)
      if (!canDecryptResult) {
        errorMessage.value = 'Wrong password or invalid file format'
      } else {
        overlayResult.value[props.func] = {
          path: props.droppedFile,
          password: password.value
        }
        open.value = false
      }
    } else {
      // For write: set the pending action directly — the encryptFile call will fail with wrong password
      overlayResult.value[props.func] = {
        path: props.droppedFile,
        password: password.value
      }
      open.value = false
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'An unexpected error occurred'
  } finally {
    isLoading.value = false
  }
}
</script>
