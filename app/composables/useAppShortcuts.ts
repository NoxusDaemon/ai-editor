/** Global keyboard shortcuts. `meta` is Ctrl on Windows/Linux and ⌘ on macOS. */
export function useAppShortcuts() {
  const doc = useDocumentStore()
  const workspace = useWorkspaceStore()
  const generation = useGenerationStore()

  defineShortcuts({
    meta_s: { usingInput: true, handler: () => void doc.save() },
    meta_shift_s: { usingInput: true, handler: () => void doc.saveAs('json') },
    meta_o: { usingInput: true, handler: () => void doc.open() },
    meta_t: { usingInput: true, handler: () => workspace.addSession() },
    meta_enter: { usingInput: true, handler: () => generation.toggle(workspace.activeId) }
  })
}
