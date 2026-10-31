<template>
  <UEditor
    ref="editor"
    v-model="content"
    content-type="markdown"
    :placeholder="placeholder"
    :image="false"
    :mention="false"
    :extensions="[ReserveSendShortcut]"
    class="w-full"
    :ui="{ base: 'min-h-12 px-4 py-3 text-sm/6' }"
  />
</template>

<script lang="ts">
import { Extension } from '@tiptap/core'

/** Mod-Enter sends the prompt (see useAppShortcuts) instead of inserting a hard break. */
const ReserveSendShortcut = Extension.create({
  name: 'reserveSendShortcut',
  addKeyboardShortcuts: () => ({ 'Mod-Enter': () => true })
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
