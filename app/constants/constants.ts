import type { OngoingPrediction } from '@lmstudio/sdk'
import type { TabsItem } from '@nuxt/ui/runtime/components/Tabs.d.vue.js'

export const defaultTab
  = {
    label: '1',
    selectedModel: 'liquid/lfm2.5-1.2b',
    promptsList: [
      {
        key: 'Cache',
        content: [],
        type: 'Segments'
      },
      {
        key: 'System',
        content: '',
        type: 'Editor'
      },
      {
        key: 'User',
        content: '',
        type: 'Editor'
      },
      {
        key: 'Assistant',
        content: '',
        type: 'Editor'
      }
    ],
    stopController: undefined as OngoingPrediction | undefined
  } satisfies TabsItem
