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
const props = defineProps<{ droppedFile: string, func: string }>()
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
    const canWrite = await useFileHandler().canWrite(props.droppedFile, password.value)

    if (canWrite) {
      overlayResult.value[props.func] = {
        path: props.droppedFile,
        password: password.value
      }
      open.value = false
    } else {
      errorMessage.value = 'Wrong password or invalid file format'
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'An unexpected error occurred'
  } finally {
    isLoading.value = false
  }
}
</script>
