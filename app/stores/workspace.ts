import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  createBlock,
  createDefaultSession,
  duplicateSession,
  nextSessionTitle,
  type Block,
  type BlockType,
  type MessageBlock,
  type MessageRole,
  type Session,
  type SnippetsBlock
} from '~/lib/workspace'
import { useSettingsStore } from './settings'

/** The open sessions (tabs) and every edit made to them. */
export const useWorkspaceStore = defineStore('workspace', () => {
  const settings = useSettingsStore()

  const sessions = ref<Session[]>([createDefaultSession('Session 1', settings.defaultModel)])
  const activeId = ref(sessions.value[0]!.id)

  const activeSession = computed(() => sessions.value.find(s => s.id === activeId.value) ?? sessions.value[0]!)

  const findSession = (id: string) => sessions.value.find(s => s.id === id)

  function findBlock<K extends Block['kind']>(sessionId: string, blockId: string, kind: K) {
    const block = findSession(sessionId)?.blocks.find(b => b.id === blockId)
    return block?.kind === kind ? block as Extract<Block, { kind: K }> : undefined
  }

  function select(id: string) {
    if (findSession(id)) activeId.value = id
  }

  function addSession(): Session {
    const session = createDefaultSession(nextSessionTitle(sessions.value), settings.defaultModel)
    sessions.value.push(session)
    activeId.value = session.id
    return session
  }

  function duplicate(id: string): Session | undefined {
    const index = sessions.value.findIndex(s => s.id === id)
    if (index === -1) return
    const copy = duplicateSession(sessions.value[index]!, nextSessionTitle(sessions.value))
    sessions.value.splice(index + 1, 0, copy)
    activeId.value = copy.id
    return copy
  }

  function closeSession(id: string) {
    const index = sessions.value.findIndex(s => s.id === id)
    if (index === -1) return
    if (sessions.value.length === 1) {
      replaceAll([])
      return
    }
    sessions.value.splice(index, 1)
    if (activeId.value === id) {
      activeId.value = sessions.value[Math.min(index, sessions.value.length - 1)]!.id
    }
  }

  function renameSession(id: string, title: string) {
    const session = findSession(id)
    const trimmed = title.trim()
    if (session && trimmed) session.title = trimmed
  }

  function setModel(id: string, model: string) {
    const session = findSession(id)
    if (session) session.model = model
  }

  function addBlock(sessionId: string, type: BlockType): Block | undefined {
    const session = findSession(sessionId)
    if (!session) return
    const block = createBlock(type)
    session.blocks.push(block)
    return session.blocks.at(-1)
  }

  function removeBlock(sessionId: string, blockId: string) {
    const session = findSession(sessionId)
    if (!session) return
    const index = session.blocks.findIndex(b => b.id === blockId)
    if (index !== -1) session.blocks.splice(index, 1)
  }

  function moveBlock(sessionId: string, from: number, to: number) {
    const blocks = findSession(sessionId)?.blocks
    if (!blocks || from === to || from < 0 || to < 0 || from >= blocks.length || to >= blocks.length) return
    const [block] = blocks.splice(from, 1)
    blocks.splice(to, 0, block!)
  }

  function updateMessage(sessionId: string, blockId: string, patch: Partial<Pick<MessageBlock, 'content' | 'role'>>) {
    const block = findBlock(sessionId, blockId, 'message')
    if (block) Object.assign(block, patch)
  }

  function setRole(sessionId: string, blockId: string, role: MessageRole) {
    updateMessage(sessionId, blockId, { role })
  }

  function setSnippets(sessionId: string, blockId: string, items: SnippetsBlock['items']) {
    const block = findBlock(sessionId, blockId, 'snippets')
    if (block) block.items = items
  }

  /** Replaces every session, e.g. after opening a file. Never leaves the workspace empty. */
  function replaceAll(next: Session[]) {
    sessions.value = next.length ? next : [createDefaultSession('Session 1', settings.defaultModel)]
    activeId.value = sessions.value[0]!.id
  }

  return {
    sessions,
    activeId,
    activeSession,
    findSession,
    findBlock,
    select,
    addSession,
    duplicate,
    closeSession,
    renameSession,
    setModel,
    addBlock,
    removeBlock,
    moveBlock,
    updateMessage,
    setRole,
    setSnippets,
    replaceAll
  }
})
