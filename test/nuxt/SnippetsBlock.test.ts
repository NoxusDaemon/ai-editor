import { describe, expect, it } from 'vitest'
import SnippetsBlock from '~/components/SnippetsBlock.vue'
import type { SnippetsBlock as Snippets } from '~/lib/workspace'
import { useWorkspaceStore } from '~/stores/workspace'
import { mountInApp } from './mount'

async function mountSnippets(items: string[]) {
  const workspace = useWorkspaceStore()
  workspace.replaceAll([])
  const session = workspace.activeSession
  const block = session.blocks.find((b): b is Snippets => b.kind === 'snippets')!
  workspace.setSnippets(session.id, block.id, items)
  const wrapper = await mountInApp(SnippetsBlock, { sessionId: session.id, block })
  return { wrapper, block }
}

describe('SnippetsBlock', () => {
  it('adds a snippet through an inline field', async () => {
    const { wrapper, block } = await mountSnippets([])

    await wrapper.get('[data-testid=add-snippet]').trigger('click')
    const input = wrapper.get('[data-testid=snippet-input]')
    await input.setValue('  Answer briefly  ')
    await input.trigger('keydown', { key: 'Enter' })

    expect(block.items).toEqual(['Answer briefly'])
    expect(wrapper.findAll('[data-testid=snippet]').map(s => s.text())).toEqual(['Answer briefly'])
  })

  it('drops an added snippet that was never filled in', async () => {
    const { wrapper, block } = await mountSnippets(['keep'])

    await wrapper.get('[data-testid=add-snippet]').trigger('click')
    await wrapper.get('[data-testid=snippet-input]').trigger('keydown', { key: 'Escape' })

    expect(block.items).toEqual(['keep'])
  })

  it('edits on double-click and deletes when emptied', async () => {
    const { wrapper, block } = await mountSnippets(['first', 'second'])

    await wrapper.findAll('[data-testid=snippet]')[0]!.trigger('dblclick')
    const input = wrapper.get('[data-testid=snippet-input]')
    await input.setValue('')
    await input.trigger('keydown', { key: 'Enter' })

    expect(block.items).toEqual(['second'])
  })

  it('puts the snippet text on the drag payload', async () => {
    const { wrapper } = await mountSnippets(['drag me'])
    const data = new Map<string, string>()
    const dataTransfer = { setData: (type: string, value: string) => data.set(type, value), effectAllowed: '' }

    await wrapper.get('[data-testid=snippet]').trigger('dragstart', { dataTransfer })

    expect(data.get('text/plain')).toBe('drag me')
  })
})
