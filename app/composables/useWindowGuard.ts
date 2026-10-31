import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEventListener } from '@vueuse/core'
import { useServices } from '~/services/container'

/** Keeps the window title in sync and stops the window closing with unsaved changes. */
export function useWindowGuard() {
  const doc = useDocumentStore()
  const title = computed(() => `${doc.dirty ? '● ' : ''}${doc.fileName} — AI Editor`)

  useHead({ title })

  if (!isTauri()) {
    useEventListener(window, 'beforeunload', (event: BeforeUnloadEvent) => {
      if (doc.dirty) event.preventDefault()
    })
    return
  }

  const appWindow = getCurrentWindow()
  watch(title, value => void appWindow.setTitle(value), { immediate: true })

  let unlisten: (() => void) | undefined
  onMounted(async () => {
    unlisten = await appWindow.onCloseRequested(async (event) => {
      if (!doc.dirty) return
      const quit = await useServices().dialogs.confirm({
        title: 'Quit without saving?',
        description: `${doc.fileName} has changes that have not been saved.`,
        confirmLabel: 'Quit without saving',
        danger: true
      })
      if (!quit) event.preventDefault()
    })
  })
  onBeforeUnmount(() => unlisten?.())
}
