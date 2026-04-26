<template>
  <UTabs
    v-model="activeTab"
    :items="totalJson"
    class="mt-2 w-full"
    :ui="{ list: 'sticky top-2 z-50' }"
  >
    <template #default="{ item, index }">
      <div
        :data-tab-index="index"
        @click.middle.stop.prevent="deleteTab(index)"
        @dragover.stop.prevent="quickSwitchTabs"
        @click.stop
      >
        {{ item.label }}
      </div>
    </template>

    <template #list-trailing>
      <UButton
        icon="i-lucide-plus"
        @click="addTab"
      />
    </template>

    <template #content="{ index }">
      <div class="flex  justify-between">
        <USwitch
          v-model="tabAutoSave[index]"
          :label="`Auto Save`"
          class="m-2"
        />
        <UDropdownMenu :items="dropdownItems">
          <UButton
            label="Open"
            icon="i-lucide-menu"
            color="neutral"
            variant="outline"
          />
          <template #item="{ item: menuItem }">
            <UButton
              color="neutral"
              :icon="menuItem.icon"
              variant="ghost"
              :label="menuItem.label"
              @click.prevent="menuItem.click"
            />
          </template>
        </UDropdownMenu>
      </div>
      <TabComponent v-model="totalJson[index]!" />
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
import type { TabsItem } from '@nuxt/ui/runtime/components/Tabs.d.vue.js'

const activeTab = useState<string>('activeTab', () => '0')
const totalJson = defineModel<TabsItem[]>({ required: true, type: Array as () => TabsItem[] })

// Per-tab auto-save and file path state
const tabAutoSave = ref<Record<number, boolean>>({})
const tabFilePath = ref<Record<number, string>>({})

const statePassword = useState<string>('password')

const dropdownItems = ref<DropdownMenuItem[]>([
  {
    label: 'Open JSON File',
    icon: 'i-lucide-book-open',
    click: openFile
  },
  {
    label: 'Open Encrypted File',
    icon: 'i-lucide-key',
    click: openEncFile
  },
  {
    label: 'Export JSON File',
    icon: 'i-lucide-file-up',
    click: exportFile
  },
  {
    label: 'Save & Enc File',
    icon: 'i-lucide-save',
    click: writeEncryptedFile
  }
])

onMounted(() => checkTabs())

const overlay = useOverlay()
const modal = overlay.create(FileComponent)

async function openFile() {
  try {
    const filePath = await open()
    if (!filePath || typeof filePath !== 'string') return
    const result = await useFileHandler().readFileText(filePath)
    totalJson.value = [...JSON.parse(result)]
    // Set the file path for the active tab
    const idx = parseInt(activeTab.value)
    tabFilePath.value[idx] = filePath
  } catch (error) {
    console.error('Failed to open file:', error)
  }
}

async function openEncFile() {
  try {
    const filePath = await open()
    if (!filePath || typeof filePath !== 'string') return
    modal.open({ droppedFile: filePath, func: 'readEncryptedFile' })
    // Set the file path for the active tab
    const idx = parseInt(activeTab.value)
    tabFilePath.value[idx] = filePath
  } catch (error) {
    console.error('Failed to select file:', error)
  }
}

async function exportFile() {
  try {
    const writPath = await save()
    if (!writPath || typeof writPath !== 'string') return
    await invoke('write_file', { path: writPath, data: new TextEncoder().encode(JSON.stringify(totalJson.value)).buffer })
    // Set the file path for the active tab
    const idx = parseInt(activeTab.value)
    tabFilePath.value[idx] = writPath
  } catch (error) {
    console.error('Failed to export file:', error)
  }
}

async function writeEncryptedFile() {
  try {
    const writPath = await save()
    if (!writPath || typeof writPath !== 'string') return
    modal.open({ droppedFile: writPath, func: 'writeEncryptedFile' })
    // Set the file path for the active tab
    const idx = parseInt(activeTab.value)
    tabFilePath.value[idx] = writPath
  } catch (error) {
    console.error('Failed to select save path:', error)
  }
}

const debouncedFn = useDebounceFn(async (newTotalJson: TabsItem[], tabIndex: number) => {
  if (!tabAutoSave.value[tabIndex]) return

  const filePath = tabFilePath.value[tabIndex]
  if (!filePath) return

  if (statePassword.value) {
    await useCrypto().encryptFile(filePath, statePassword.value, newTotalJson)
    return
  }

  await invoke('write_file', { path: filePath, data: new TextEncoder().encode(JSON.stringify(newTotalJson)).buffer })
}, 1000)

watch(totalJson, (newTotalJson) => {
  debouncedFn(newTotalJson, parseInt(activeTab.value))
}, { immediate: true, deep: true })

// Throttled version of quickSwitchTabs to prevent excessive tab switching on dragover
let lastTabSwitch = 0
const TAB_SWITCH_COOLDOWN = 150 // ms

function quickSwitchTabs(tabEvent: DragEvent) {
  const now = Date.now()
  if (now - lastTabSwitch < TAB_SWITCH_COOLDOWN) return
  lastTabSwitch = now

  const target = tabEvent.target as HTMLElement
  const tabElement = target.closest('[data-tab-index]') as HTMLElement | null
  if (!tabElement) return
  const tabIndex = parseInt(tabElement.dataset.tabIndex || '')
  if (!isNaN(tabIndex)) {
    activeTab.value = tabIndex.toString()
  }
}

const getDefaultTab = () => {
  const raw = toRaw(defaultTab)
  const newDefaultTab = JSON.parse(JSON.stringify(raw)) as TabsItem
  newDefaultTab.promptsList.find((f: { key: string }) => f.key === 'User')!.content = 'Who are you, and what can you do?'
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
  const activeIndex = parseInt(activeTab.value)
  const previous = totalJson.value[activeIndex]
  if (!previous) return

  // Use JSON stringify/parse to avoid structuredClone issues with Vue proxies
  // and non-serializable values like OngoingPrediction in stopController
  const cloned = JSON.parse(JSON.stringify(previous)) as TabsItem
  cloned.label = (totalJson.value.length + 1).toString()
  cloned.stopController = undefined
  totalJson.value.push(cloned)
  activeTab.value = (totalJson.value.length - 1).toString()
}

function deleteTab(index: number) {
  if (totalJson.value.length <= 1) {
    // Reset the single tab to defaults instead of deleting
    totalJson.value[0] = getDefaultTab()
    return
  }

  totalJson.value.splice(index, 1)

  // Adjust active tab index
  const activeIdx = parseInt(activeTab.value)
  if (activeIdx >= totalJson.value.length) {
    activeTab.value = (totalJson.value.length - 1).toString()
  }

  // Clean up per-tab state for deleted tab
  const newFilePaths: Record<number, string> = {}
  const newAutoSave: Record<number, boolean> = {}
  for (const [key, value] of Object.entries(tabFilePath.value)) {
    const k = parseInt(key)
    if (k < index) {
      newFilePaths[k] = value
    } else if (k > index) {
      newFilePaths[k - 1] = value
    }
  }
  for (const [key, value] of Object.entries(tabAutoSave.value)) {
    const k = parseInt(key)
    if (k < index) {
      newAutoSave[k] = value
    } else if (k > index) {
      newAutoSave[k - 1] = value
    }
  }
  tabFilePath.value = newFilePaths
  tabAutoSave.value = newAutoSave
}
</script>
