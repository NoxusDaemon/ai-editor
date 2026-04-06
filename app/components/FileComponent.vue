<template>
  <UModal v-model:open="open" title="File Selector" description="File Selector">
    <template #content>
      <UInput v-model="password" :type="showPassword ? 'text' : 'password'" class="m-2" placeholder="password"
        :ui="{ trailing: 'pe-1' }">
        <template #trailing>
          <UButton color="neutral" variant="link" size="sm" :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            :aria-label="showPassword ? 'Hide password' : 'Show password'" :aria-pressed="showPassword"
            aria-controls="password" @click="showPassword = !showPassword" />
        </template>
      </UInput>
      <div class="grid grid-cols-12">
        <UButton label="submit" class="mx-2 mb-2 col-span-2 col-end-13" @click="submit" />
      </div>
    </template>
  </UModal>
</template>


<script setup lang="ts">
const showPassword = ref(false)
const password = ref('')
const props = defineProps<{ droppedFile: string, func: string }>()
const overlayResult = useState<{ [id: string]: { path: string, password?: string } }>('overlayResult', () => ({}))

const open = ref(false)

async function submit() {
  const canWrite = await useFileHandler().canWrite(props.droppedFile, password.value)

  if (canWrite) {
    overlayResult.value[props.func] = {
      path: props.droppedFile,
      password: password.value,
    }
    console.log({ overlayResult });
    emit('close', false)
  }
}

const emit = defineEmits<{ close: [boolean] }>()
</script>