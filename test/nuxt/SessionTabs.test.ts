import { beforeEach, describe, expect, it } from 'vitest'
import SessionTabs from '~/components/SessionTabs.vue'
import { useWorkspaceStore } from '~/stores/workspace'
import { mountInApp } from './mount'

describe('SessionTabs', () => {
  beforeEach(() => {
    useWorkspaceStore().replaceAll([])
  })

  it('adds, selects and closes sessions', async () => {
    const workspace = useWorkspaceStore()
    const wrapper = await mountInApp(SessionTabs)
    const tabs = () => wrapper.findAll('[data-testid=session-tab]')

    await wrapper.get('[data-testid=add-session]').trigger('click')
    expect(tabs().map(t => t.text())).toEqual(['Session 1', 'Session 2'])
    expect(tabs()[1]!.attributes('aria-selected')).toBe('true')

    await tabs()[0]!.trigger('click')
    expect(workspace.activeSession.title).toBe('Session 1')

    // Untouched sessions close without asking.
    await tabs()[0]!.get('button').trigger('click')
    expect(tabs().map(t => t.text())).toEqual(['Session 2'])
  })

  it('supports keyboard navigation and renaming', async () => {
    const workspace = useWorkspaceStore()
    workspace.addSession()
    workspace.select(workspace.sessions[0]!.id)
    const wrapper = await mountInApp(SessionTabs)
    const tabs = () => wrapper.findAll('[data-testid=session-tab]')

    await tabs()[0]!.trigger('keydown', { key: 'ArrowRight' })
    expect(workspace.activeSession.title).toBe('Session 2')

    await tabs()[1]!.trigger('keydown', { key: 'F2' })
    const input = wrapper.get('input[aria-label="Session name"]')
    await input.setValue('Research')
    await input.trigger('keydown', { key: 'Enter' })

    expect(tabs()[1]!.text()).toBe('Research')
  })
})
