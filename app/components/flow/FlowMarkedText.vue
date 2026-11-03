<template>
  <div class="font-mono whitespace-pre-wrap">
    <template
      v-for="(part, i) in parts"
      :key="i"
    >
      <mark
        v-if="part.mark"
        class="rounded-sm bg-secondary/10 text-default ring-1 ring-secondary/40"
        :data-testid="`recalled-${part.mark.nodeId}`"
      ><span class="me-1 inline-flex items-center gap-0.5 rounded-sm bg-secondary px-1 align-text-top font-sans text-[10px] leading-4 text-inverted"><UIcon
        :name="NODE_META[part.mark.kind].icon"
        class="size-3"
      />{{ part.mark.title }}</span>{{ part.text }}</mark>
      <span
        v-else
        v-text="part.text"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { RecalledContext } from '~/lib/flow/engine'
import { NODE_META } from '~/utils/nodes'

const props = defineProps<{
  text: string
  /** Recalled memory and knowledge, highlighted where they appear in the text. */
  marks?: readonly RecalledContext[]
}>()

const parts = computed(() => {
  const found = (props.marks ?? [])
    .filter(mark => mark.text)
    .map(mark => ({ mark, at: props.text.indexOf(mark.text) }))
    .filter(({ at }) => at !== -1)
    .sort((a, b) => a.at - b.at)
  const result: { text: string, mark?: RecalledContext }[] = []
  let position = 0
  for (const { mark, at } of found) {
    if (at < position) continue
    if (at > position) result.push({ text: props.text.slice(position, at) })
    result.push({ text: mark.text, mark })
    position = at + mark.text.length
  }
  if (position < props.text.length) result.push({ text: props.text.slice(position) })
  return result
})
</script>
