<template>
  <div ref="el">
    <div
      v-for="(editorProp, index) in item!.promptsList"
      :key="editorProp.key + '-Draggable-Index-' + index"
      class="m-1 rounded-xl border-2 border-dotted"
    >
      <div class="m-2">
        <div class="flex justify-between">
          <span class="dragEditorsHandle -m-1.5 ml-5">{{ editorProp.key }}</span>
          <UButton
            icon="i-lucide-x"
            size="md"
            color="error"
            variant="ghost"
            class="block-inline"
            @click.stop="deleteSegment(Number(index))"
          />
        </div>
        <EditorComponent
          v-if="editorProp.type === 'Editor'"
          v-model="editorProp.content"
        />
        <SegmentsComponent
          v-else-if="editorProp.type === 'Segments'"
          v-model="editorProp.content"
        />
      </div>
    </div>
  </div>
  <div class="flex justify-between sticky bottom-2">
    <div class="flex">
      <USelect
        v-model="promptOption"
        :items="promptOptions"
      />
      <UButton
        label="Add Segment"
        @click="addSegment"
      />
    </div>
    <div class="flex justify-between">
      <div class="flex">
        <USelect
          v-model="item!.selectedModel"
          :items="modelsList"
          :loading="modelSelectionStatus === 'pending'"
          @update:open="onModelSelectionOpen"
        />
      </div>
      <UButton
        v-if="item!.stopController && typeof item!.stopController.cancel === 'function'"
        class="inline-block mx-1 flex"
        color="error"
        label="Stop"
        @click="item!.stopController.cancel()"
      />

      <UButton
        v-else
        class="inline-block mx-1 flex"
        :label="isStreaming ? 'Sending...' : 'Send'"
        :loading="isStreaming"
        :disabled="isStreaming"
        @click="callModel"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { Chat } from '@lmstudio/sdk'
import type { TabsItem } from '@nuxt/ui/runtime/components/Tabs.d.vue.js'
import { useSortable } from '@vueuse/integrations/useSortable'
import { defaultTab } from '~/constants/constants'
import { useLMStudioClient } from '~/composables/useLMStudioClient'

const promptOption = ref('Cache')
const promptOptions = ref([
  'Cache',
  'User',
  'Assistant'
])

const item = defineModel<TabsItem>({ required: true })
const modelsList = ref([
  {
    label: 'Lfm2.5 1.2B',
    value: 'liquid/lfm2.5-1.2b'
  }
])

function addSegment() {
  const defaultItem = toRaw(defaultTab).promptsList.find(f => f.key === promptOption.value)
  if (!defaultItem) return
  // Clone the default item to avoid mutating the global default
  item.value.promptsList.push(structuredClone(defaultItem))
}

function deleteSegment(editorIndex: number) {
  item.value.promptsList.splice(editorIndex, 1)
}

const modelSelectionStatus = ref('')
const isStreaming = ref(false)
const promptsList = ref(item.value?.promptsList ? structuredClone(item.value.promptsList) : [])
const el = useTemplateRef<HTMLElement>('el')

// Use singleton client instead of creating a new one per instance
const client = useLMStudioClient()

// Initialize sortable after the component is mounted
let sortableInstance: ReturnType<typeof useSortable> | null = null

onMounted(() => {
  if (el.value) {
    sortableInstance = useSortable(
      el.value,
      promptsList as unknown as Parameters<typeof useSortable>[1],
      { handle: '.dragEditorsHandle' } as unknown as Parameters<typeof useSortable>[2]
    )
  }
})

// Clean up sortable on unmount
onBeforeUnmount(() => {
  sortableInstance?.stop?.()
})

watch(promptsList, (newPromptsList) => {
  item.value.promptsList = newPromptsList
})

//  Fill in the middle attempt
//  "system_prompt": "Just fill in the middle. Returning the only the middle",
//  "input": "[FIM_PREFIX]def add(a, b):\n return a + b\n\n# Calculate result\n[FIM_SUFFIX]\nprint(result)[FIM_MIDDLE]",

async function callModel() {
  if (!item.value.selectedModel) {
    console.warn('No model selected')
    return
  }

  const chatInput = item.value.promptsList
    .map((m: { key: string, content: string | string[] }) => ({ role: m.key.toLowerCase(), content: m.content }))
    .filter((m: { role: string }) => m.role !== 'cache')

  if (chatInput.length === 0) {
    console.warn('No chat input after filtering cache')
    return
  }

  const lastAssistantPrompt = item.value.promptsList.findLast((m: { key: string }) => m.key === 'Assistant')
  if (!lastAssistantPrompt) {
    console.warn('No Assistant prompt found to append response to')
    return
  }

  isStreaming.value = true

  console.log({ chatInput })

  let chat: Chat
  try {
    chat = Chat.from(chatInput)
  } catch (error) {
    console.error('Failed to create chat:', error)
    isStreaming.value = false
    return
  }

  let model
  try {
    model = await client.llm.model(item.value.selectedModel)
  } catch (error) {
    console.error('Failed to load model:', error)
    isStreaming.value = false
    return
  }

  const responseObj = model.respond(chat)
  item.value.stopController = responseObj

  try {
    for await (const fragment of responseObj) {
      lastAssistantPrompt.content += fragment.content.replace('&nbsp;', ' ')
    }
  } catch (error) {
    console.error('Error during model response:', error)
  }

  await responseObj
  item.value.stopController = undefined
  isStreaming.value = false
  console.log(responseObj)
  console.log(chat)
}

function onModelSelectionOpen() {
  modelSelectionStatus.value = 'pending'
  client.system.listDownloadedModels()
    .then((modelDatas) => {
      modelsList.value = modelDatas.map(m => ({
        label: m.displayName,
        value: m.modelKey
      }))
      modelSelectionStatus.value = ''
    })
    .catch((error) => {
      console.error('Failed to list models:', error)
      modelSelectionStatus.value = ''
    })
}
</script>

<style></style>
