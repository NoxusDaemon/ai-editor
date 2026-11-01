import ConfirmModal from '~/components/ConfirmModal.vue'
import PasswordModal from '~/components/PasswordModal.vue'
import { createClipboard } from '~/services/clipboard'
import { provideServices } from '~/services/container'
import { createFileSystem } from '~/services/files'
import { createLmStudioProvider } from '~/services/llm'
import { createIndexedDbRecovery } from '~/services/recovery'

const NOTICE_ICONS = {
  success: 'i-lucide-circle-check',
  error: 'i-lucide-circle-alert',
  warning: 'i-lucide-triangle-alert',
  info: 'i-lucide-info'
} as const

/** Wires the real implementations into the service registry the stores use. */
export default defineNuxtPlugin(() => {
  const toast = useToast()
  const overlay = useOverlay()
  const settings = useSettingsStore()
  const passwordModal = overlay.create(PasswordModal)
  const confirmModal = overlay.create(ConfirmModal)

  provideServices({
    files: createFileSystem(),
    recovery: createIndexedDbRecovery(),
    llm: createLmStudioProvider(() => settings.lmStudioUrl),
    dialogs: {
      askPassword: async request => (await passwordModal.open(request).result) ?? null,
      confirm: async request => (await confirmModal.open(request).result) ?? false,
      notify: ({ color = 'info', ...notice }) => toast.add({ ...notice, color, icon: NOTICE_ICONS[color] })
    },
    clipboard: createClipboard()
  })
})
