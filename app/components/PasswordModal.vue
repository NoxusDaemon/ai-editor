<template>
  <UModal
    :title="title"
    :description="description"
    :dismissible="!pending"
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <form
        :id="formId"
        class="space-y-4"
        @submit.prevent="submit"
      >
        <UFormField
          label="Password"
          :help="confirm ? 'Use at least 8 characters. Lost passwords cannot be recovered.' : undefined"
        >
          <UInput
            ref="passwordInput"
            v-model="password"
            :type="visible ? 'text' : 'password'"
            :autocomplete="confirm ? 'new-password' : 'current-password'"
            :disabled="pending"
            autofocus
            class="w-full"
            :ui="{ trailing: 'pe-1' }"
            data-testid="password"
          >
            <template #trailing>
              <UButton
                color="neutral"
                variant="link"
                size="sm"
                :icon="visible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                :aria-label="visible ? 'Hide password' : 'Show password'"
                :aria-pressed="visible"
                @click="visible = !visible"
              />
            </template>
          </UInput>
        </UFormField>

        <UFormField
          v-if="confirm"
          label="Confirm password"
          :error="mismatch"
        >
          <UInput
            v-model="repeat"
            :type="visible ? 'text' : 'password'"
            autocomplete="new-password"
            :disabled="pending"
            class="w-full"
            data-testid="password-repeat"
          />
        </UFormField>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="error"
          data-testid="password-error"
        />
      </form>
    </template>

    <template #footer>
      <UButton
        label="Cancel"
        color="neutral"
        variant="ghost"
        :disabled="pending"
        @click="emit('close', null)"
      />
      <UButton
        type="submit"
        :form="formId"
        :label="submitLabel"
        :loading="pending"
        :disabled="!canSubmit"
        data-testid="password-submit"
      />
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  title: string
  description?: string
  submitLabel?: string
  /** Ask twice and require a match (when choosing a new password). */
  confirm?: boolean
  /** Return `false` to report a wrong password and keep the dialog open. */
  verify?: (password: string) => Promise<boolean>
}>(), {
  description: undefined,
  submitLabel: 'Continue',
  confirm: false,
  verify: undefined
})

const emit = defineEmits<{ close: [password: string | null] }>()

const formId = useId()
const passwordInput = useTemplateRef('passwordInput')
const password = ref('')
const repeat = ref('')
const visible = ref(false)
const pending = ref(false)
const error = ref<string | null>(null)

const mismatch = computed(() =>
  props.confirm && repeat.value !== '' && repeat.value !== password.value ? 'Passwords do not match' : undefined)

const canSubmit = computed(() =>
  password.value !== '' && !pending.value && (!props.confirm || repeat.value === password.value))

watch(password, () => {
  error.value = null
})

async function submit() {
  if (!canSubmit.value) return
  if (props.verify) {
    pending.value = true
    error.value = null
    try {
      if (!await props.verify(password.value)) {
        error.value = 'Incorrect password. Try again.'
        // Ready for another attempt without clearing the field by hand.
        nextTick(() => passwordInput.value?.inputRef?.select())
        return
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return
    } finally {
      pending.value = false
    }
  }
  emit('close', password.value)
}
</script>
