<template>


  <div ref="el">
    <div v-for="(editorProp, index) in item.promptsList" :key="editorProp.key + '-Draggable-Index-' + index"
      class="m-1 rounded-xl border-2 border-dotted">
      <div class="m-2">
        <div class="flex justify-between">
          <span class="dragEditorsHandle -m-1.5 ml-5">{{ editorProp.key }}</span>
          <UButton icon="i-lucide-x" size="md" color="error" variant="ghost" class="block-inline" @click.stop="deleteSegment(index)"/>
        </div>
        <EditorComponent v-if="editorProp.type === 'Editor'" v-model="editorProp.content" @mouseup="" />
        <SegmentsComponent v-else-if="editorProp.type === 'Segments'" v-model="editorProp.content" />
      </div>
    </div>
  </div>
  <div class="flex justify-between sticky bottom-2">
    <div class="flex">
      <USelect v-model="promptOption" :items="promptOptions" />
      <UButton label="Add Segment" @click="addSegment()" />
    </div>
    <div class="flex justify-between">
      <div class="flex">
        <USelect v-model="item.selectedModel" :items="modelsList" :loading="modelSelectionStatus === 'pending'"
          @update:open="onModelSelectionOpen" />
      </div>
      <UButton v-if="item.stopController" class="inline-block mx-1 flex" color="error" label="Stop"
        @click="item.stopController.cancel()" />

      <UButton v-else class="inline-block mx-1 flex" label="Send" @click="callModel(item)" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { Chat, LMStudioClient } from '@lmstudio/sdk'
import type { TabsItem } from '@nuxt/ui/runtime/components/Tabs.d.vue.js'
import { useSortable } from '@vueuse/integrations/useSortable'
import { defaultTab } from '~/constants/constants'

const promptOption = ref('Cache')
const promptOptions = ref([
  'Cache',
  'User',
  'Assistant',
])

const item = defineModel({ type: Object })
const modelsList = ref([
  {
    label: 'Lfm2.5 1.2B',
    value: 'liquid/lfm2.5-1.2b'
  }
])

function addSegment() {
  const newPrompt = defaultTab.promptsList.find((f) => f.key === promptOption.value)!
  item.value.promptsList.push(newPrompt)
}

function deleteSegment(editorIndex: number){
  item.value.promptsList.splice(editorIndex, 1)
}
const modelSelectionStatus = ref('')
const promptsList = shallowRef(item.value.promptsList)
const el = useTemplateRef<HTMLElement>('el')

const client = new LMStudioClient()

// @ts-ignore
useSortable(el, promptsList, {
  animation: 150,
  handle: '.dragEditorsHandle'
})

watch(promptsList, (newPromptsList) => {
  item.value.promptsList = newPromptsList
})


//  Fill in the middle attempt
//  "system_prompt": "Just fill in the middle. Returning the only the middle",
//  "input": "[FIM_PREFIX]def add(a, b):\n return a + b\n\n# Calculate result\n[FIM_SUFFIX]\nprint(result)[FIM_MIDDLE]",

async function callModel(item: TabsItem) {
  const chatInput = item.promptsList.map((m: { key: String; content: String[] | String }) => ({ role: m.key.toLowerCase(), content: m.content })).filter((m: { role: string }) => m.role !== 'cache')
  console.log({ chatInput });

  const chat = Chat.from(chatInput)
  const model = await client.llm.model(item.selectedModel)

  const responseObj = model.respond(chat)
  item.stopController = responseObj
  const lastAssistentPrompt = item.promptsList.findLast((m: { key: string }) => m.key === "Assistant")

  for await (const fragment of responseObj) {
    lastAssistentPrompt.content += fragment.content.replace('&nbsp;', ' ')
  }

  await responseObj
  item.stopController = undefined
  console.log(responseObj)
  console.log(chat)
}

function onModelSelectionOpen() {
  modelSelectionStatus.value = 'pending'
  client.system.listDownloadedModels().then((modelDatas) => {
    modelsList.value = modelDatas.map(m => ({
      label: m.displayName,
      value: m.modelKey
    }))
    modelSelectionStatus.value = ''
  })
}

</script>

<style></style>
