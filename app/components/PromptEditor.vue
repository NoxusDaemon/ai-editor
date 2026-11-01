<template>
  <UEditor
    ref="editor"
    v-model="content"
    content-type="markdown"
    :placeholder="placeholder"
    :image="false"
    :mention="false"
    :extensions="[ReserveAppShortcuts, SnippetDrop]"
    class="w-full"
    :ui="{ base: 'min-h-12 px-4 py-3 text-sm/6' }"
  />
</template>

<script lang="ts">
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { padSnippet, SNIPPET_MIME } from '~/utils/snippets'

/**
 * Keys that belong to the app (see useAppShortcuts), so the editor doesn't act on them too:
 * Mod-Enter sends instead of inserting a hard break, and Mod-Shift-S saves as JSON instead
 * of toggling strikethrough (`~~text~~` still works).
 */
export const ReserveAppShortcuts = Extension.create({
  name: 'reserveAppShortcuts',
  addKeyboardShortcuts: () => ({ 'Mod-Enter': () => true, 'Mod-Shift-s': () => true })
})

/** Drops a snippet as a word: spaced from the text around it, with the caret after it. */
const SnippetDrop = Extension.create({
  name: 'snippetDrop',
  addProseMirrorPlugins: () => [new Plugin({
    key: new PluginKey('snippetDrop'),
    props: {
      handleDrop(view, event) {
        const text = event.dataTransfer?.getData(SNIPPET_MIME)
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })
        // Multi-line snippets keep the default drop, which turns lines into paragraphs.
        if (!text || text.includes('\n') || !at) return false
        const { doc } = view.state
        const $at = doc.resolve(at.pos)
        if (!$at.parent.inlineContent) return false

        const before = doc.textBetween($at.start(), at.pos, null, '\n').slice(-1)
        const after = doc.textBetween(at.pos, $at.end(), null, '\n').slice(0, 1)
        const insert = padSnippet(text, before, after)
        const tr = view.state.tr.insertText(insert, at.pos)
        view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at.pos + insert.length)))
        view.focus()
        return true
      }
    }
  })]
})
</script>

<script setup lang="ts">
const content = defineModel<string>({ required: true })

const props = defineProps<{
  placeholder?: string
  /** Locks the editor, e.g. while a reply is streamed into it. */
  readonly?: boolean
}>()

const editor = useTemplateRef('editor')

watch(
  () => [editor.value?.editor, props.readonly] as const,
  ([instance, readonly]) => instance?.setEditable(!readonly),
  { immediate: true }
)
</script>
