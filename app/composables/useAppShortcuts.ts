/** Global keyboard shortcuts. `meta` is Ctrl on Windows/Linux and ⌘ on macOS. */
export function useAppShortcuts() {
  const doc = useDocumentStore()
  const workspace = useWorkspaceStore()
  const generation = useGenerationStore()
  const flowRun = useFlowRunStore()
  const view = useFlowViewStore()

  /** Inside a zoomed-in segment, Send tries that segment; elsewhere, Run runs the flow. */
  function sendOrRun() {
    const sessionId = workspace.activeId
    const focused = view.focusedId(sessionId)
    if (focused && workspace.findSegment(sessionId, focused)) generation.toggle(sessionId, focused)
    else if (flowRun.isRunning(sessionId)) flowRun.stop(sessionId)
    else {
      view.runPanelOpen = true
      void flowRun.run(sessionId)
    }
  }

  defineShortcuts({
    meta_s: { usingInput: true, handler: () => void doc.save() },
    meta_shift_s: { usingInput: true, handler: () => void doc.saveAs('json') },
    meta_o: { usingInput: true, handler: () => void doc.open() },
    meta_t: { usingInput: true, handler: () => workspace.addSession() },
    meta_enter: { usingInput: true, handler: sendOrRun },
    // Text fields keep their own undo.
    meta_z: () => workspace.undo(workspace.activeId),
    meta_shift_z: () => workspace.redo(workspace.activeId),
    meta_y: () => workspace.redo(workspace.activeId)
  })
}
