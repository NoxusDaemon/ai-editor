import { getCurrentWindow } from '@tauri-apps/api/window'
import { useServices } from '~/services/container'

/**
 * Keeps the window title in sync, stops the window closing with unsaved changes,
 * and clears text copied from the app off the clipboard when it closes.
 */
export function useWindowGuard() {
  const doc = useDocumentStore()
  const title = computed(() => `${doc.dirty ? '● ' : ''}${doc.fileName} — AI Editor`)

  useCopyTracking()

  const appWindow = getCurrentWindow()
  watch(title, value => void appWindow.setTitle(value), { immediate: true })

  let unlisten: (() => void) | undefined
  onMounted(async () => {
    unlisten = await appWindow.onCloseRequested(async (event) => {
      const { dialogs, clipboard } = useServices()
      const quit = !doc.dirty || await dialogs.confirm({
        title: 'Quit without saving?',
        description: `${doc.fileName} has changes that have not been saved.`,
        confirmLabel: 'Quit without saving',
        danger: true
      })
      if (!quit) {
        event.preventDefault()
        return
      }
      // Quitting without saving is deliberate, so don't offer the changes back next time.
      if (doc.dirty) await doc.discardRecovery()
      // The window closes once this handler returns.
      await clearCopiedText(clipboard)
    })
  })
  onBeforeUnmount(() => unlisten?.())
}
