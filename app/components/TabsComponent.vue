<template>

  <UTabs v-model="activeTab" :items="totalJson" class="mt-2 w-full" :ui="{ list: 'sticky top-2 z-50' }">
    <template #default="{ item, index }">
      <div @click.middle.stop.prevent="deleteTab(index)" @dragover.stop.prevent="quickSwitchTabs" @click.stop >
        {{ item.label }}
      </div>
    </template>

    <template #list-trailing>
      <UButton icon="i-lucide-plus" @click="addTab" />
    </template>

    <template #content="{ index }">
      <div class="flex  justify-between">
        <USwitch v-model="AutoSaveSwitch" label="Auto Save" class="m-2" />
        <UDropdownMenu :items="items">
          <UButton label="Open" icon="i-lucide-menu" color="neutral" variant="outline" />
          <template #item="{ item }">
            <UButton color="neutral" :icon="item.icon" variant="ghost" @click.prevent="item.function"
              :label="item.label" />
          </template>
        </UDropdownMenu>
      </div>
      <TabComponent v-model="totalJson[index]" />
    </template>
  </UTabs>
</template>

<script lang="ts" setup>
import { defaultTab } from '~/constants/constants'
import { open, save } from '@tauri-apps/plugin-dialog'
import FileComponent from '~/components/FileComponent.vue'
import { invoke } from '@tauri-apps/api/core'
import type { DropdownMenuItem } from '@nuxt/ui'
import { useDebounceFn } from '@vueuse/core'

const activeTab = ref('0')
const totalJson = defineModel({ type: Object })
const AutoSaveSwitch = ref(false)
const dropperFile = useState<string>('filePath')
const statePassword = useState<string>('password')
const items = ref<DropdownMenuItem[]>([
  {
    label: 'Open JSON File',
    icon: 'i-lucide-book-open',
    function: openFile
  },
  {
    label: 'Open Encrypted File',
    icon: 'i-lucide-key',
    function: openEncFile
  },
  {
    label: 'Export JSON File',
    icon: 'i-lucide-file-up',
    function: exportFile
  },
  {
    label: 'Save & Enc File',
    icon: 'i-lucide-save',
    function: writeEncryptedFile
  }
])

onMounted(() => checkTabs())

const overlay = useOverlay()
const modal = overlay.create(FileComponent)

async function openFile() {
  const filePath = await open()
  if (!filePath || typeof filePath !== 'string') return
  const result = await useFileHandler().readFileText(filePath)
  totalJson.value = [...JSON.parse(result)]
  dropperFile.value = filePath
}

async function openEncFile() {
  const filePath = await open()
  if (!filePath || typeof filePath !== 'string') return
  modal.open({ droppedFile: filePath, func: 'readEncryptedFile' })
  dropperFile.value = filePath
}

async function exportFile() {
  const writPath = await save()
  if (!writPath || typeof writPath !== 'string') return
  await invoke('write_file', { path: writPath, data: new TextEncoder().encode(JSON.stringify(totalJson.value)).buffer })
  dropperFile.value = writPath
}

async function writeEncryptedFile() {
  const writPath = await save()
  if (!writPath || typeof writPath !== 'string') return
  modal.open({ droppedFile: writPath, func: 'writeEncryptedFile' })
  dropperFile.value = writPath
}

const debouncedFn = useDebounceFn(async (newTotalJson) => {
  console.log('autosave check', AutoSaveSwitch.value);

  if (!AutoSaveSwitch.value) return
  console.log('passed autosave');

  console.log('file path  check', dropperFile.value);
  if (!dropperFile.value) return
  console.log('passed file path check');

  if (statePassword.value) {
    console.log('wrote to encrypted file')
    await useCrypto().encryptFile(dropperFile.value, statePassword.value, newTotalJson)
    return
  }

  console.log('wrote to unencrypted file')
  await invoke('write_file', { path: dropperFile.value, data: new TextEncoder().encode(JSON.stringify(newTotalJson)).buffer })
}, 1000)

watch(totalJson, (newTotalJson) => {
  console.log('detected changes');
  debouncedFn(newTotalJson)
}, { immediate: true, deep: true })

function quickSwitchTabs(tabEvent: DragEvent) {
  const target = tabEvent.target as HTMLElement
  activeTab.value = (parseInt(target.textContent) - 1).toString()
}

const getDefaultTab = () => {
  const newDefaultTab = structuredClone(toRaw(defaultTab))
  newDefaultTab.promptsList.find((f) => f.key === 'User')!.content = 'Who are you, and what can you do?'
  return newDefaultTab
}

function checkTabs() {
  if (totalJson.value.length === 0) {
    totalJson.value.push(getDefaultTab())
    return
  }
}

function addTab() {
  checkTabs()
  const previous = structuredClone(toRaw(totalJson.value[parseInt(activeTab.value)]!))
  previous.label = (totalJson.value.length + 1).toString()
  previous.stopController = undefined
  totalJson.value.push(previous)
  activeTab.value = (totalJson.value.length - 1).toString()
}

function deleteTab(index: number) {
  console.log(index)
  if (totalJson.value.length <= 1) {
    totalJson.value[0] = getDefaultTab()
    return
  }

  totalJson.value.splice(index, 1)
}

</script>