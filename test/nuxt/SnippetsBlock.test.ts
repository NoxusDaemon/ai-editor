import { describe, expect, it } from 'vitest'
import SnippetsBlock from '~/components/SnippetsBlock.vue'
import { createSection, createSnippet, type SnippetItem, type SnippetsBlock as Snippets } from '~/lib/workspace'
import { useWorkspaceStore } from '~/stores/workspace'
import { SNIPPET_MIME } from '~/utils/snippets'
import { mountInApp } from './mount'

async function mountSnippets(items: SnippetItem[]) {
  const workspace = useWorkspaceStore()
  workspace.replaceAll([])
  const session = workspace.activeSession
  const block = session.blocks.find((b): b is Snippets => b.kind === 'snippets')!
  workspace.setSnippets(session.id, block.id, items)
  const wrapper = await mountInApp(SnippetsBlock, { sessionId: session.id, block })
  return { wrapper, block }
}

const texts = (items: SnippetItem[]) => items.map(item => item.kind === 'snippet' ? item.text : `# ${item.title}`)

function fakeDataTransfer() {
  const data = new Map<string, string>()
  return { data, dataTransfer: { setData: (type: string, value: string) => data.set(type, value), effectAllowed: '' } }
}

describe('SnippetsBlock', () => {
  it('adds a snippet through an inline field', async () => {
    const { wrapper, block } = await mountSnippets([])

    await wrapper.get('[data-testid=add-snippet]').trigger('click')
    const input = wrapper.get('[data-testid=snippet-input]')
    await input.setValue('  Answer briefly  ')
    await input.trigger('keydown', { key: 'Enter' })

    expect(texts(block.items)).toEqual(['Answer briefly'])
    expect(wrapper.findAll('[data-testid=snippet]').map(s => s.text())).toEqual(['Answer briefly'])
  })

  it('drops an added snippet that was never filled in', async () => {
    const { wrapper, block } = await mountSnippets([createSnippet('keep')])

    await wrapper.get('[data-testid=add-snippet]').trigger('click')
    await wrapper.get('[data-testid=snippet-input]').trigger('keydown', { key: 'Escape' })

    expect(texts(block.items)).toEqual(['keep'])
  })

  it('edits on double-click and deletes when emptied', async () => {
    const { wrapper, block } = await mountSnippets([createSnippet('first'), createSnippet('second')])

    await wrapper.findAll('[data-testid=snippet]')[0]!.trigger('dblclick')
    const input = wrapper.get('[data-testid=snippet-input]')
    await input.setValue('')
    await input.trigger('keydown', { key: 'Enter' })

    expect(texts(block.items)).toEqual(['second'])
  })

  it('does nothing on a single click', async () => {
    const { wrapper, block } = await mountSnippets([createSnippet('stay')])

    await wrapper.get('[data-testid=snippet]').trigger('click')

    expect(wrapper.find('[data-testid=snippet-input]').exists()).toBe(false)
    expect(texts(block.items)).toEqual(['stay'])
  })

  it('marks the drag payload as a snippet, with plain text for other targets', async () => {
    const { wrapper } = await mountSnippets([createSnippet('drag me')])
    const { data, dataTransfer } = fakeDataTransfer()

    await wrapper.get('[data-testid=snippet]').trigger('dragstart', { dataTransfer })

    expect(data.get(SNIPPET_MIME)).toBe('drag me')
    expect(data.get('text/plain')).toBe('drag me')
  })

  it('adds named sections and snippets into them', async () => {
    const { wrapper, block } = await mountSnippets([createSnippet('loose'), createSection('Plot'), createSection('Settings')])

    await wrapper.get('[data-testid=add-section]').trigger('click')
    const input = wrapper.get('[data-testid=snippet-input]')
    await input.setValue('Style')
    await input.trigger('keydown', { key: 'Enter' })

    await wrapper.get('[aria-label="Add a snippet to Plot"]').trigger('click')
    const snippetInput = wrapper.get('[data-testid=snippet-input]')
    await snippetInput.setValue('a twist')
    await snippetInput.trigger('keydown', { key: 'Enter' })

    expect(texts(block.items)).toEqual(['loose', '# Plot', 'a twist', '# Settings', '# Style'])
    expect(wrapper.findAll('[data-testid=snippet-section]').map(s => s.text())).toEqual(['Plot', 'Settings', 'Style'])
  })

  it('removes a section heading but keeps its snippets', async () => {
    const { wrapper, block } = await mountSnippets([createSection('Plot'), createSnippet('a twist')])

    await wrapper.get('[aria-label="Remove section heading"]').trigger('click')

    expect(texts(block.items)).toEqual(['a twist'])
  })

  it('switches dragging from inserting text to reordering in arrange mode', async () => {
    const { wrapper } = await mountSnippets([createSnippet('one')])
    const chip = () => wrapper.get('[data-testid=snippet]')
    expect(chip().attributes('draggable')).toBe('true')

    await wrapper.get('[data-testid=arrange-snippets]').trigger('click')

    expect(chip().attributes('draggable')).toBe('false')
    expect(wrapper.get('[data-testid=arrange-snippets]').attributes('aria-pressed')).toBe('true')
  })
})
