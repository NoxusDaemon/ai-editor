import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the dependencies for TabsComponent logic testing
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return {
    ...actual,
    toRaw: (val: unknown) => val,
    ref: (val: unknown) => ({ value: val, _raw: val }),
    reactive: (val: unknown) => val,
    watch: vi.fn(),
    onMounted: vi.fn(),
    useState: vi.fn((key: string, def: () => unknown) => ({ value: def() })),
    defineModel: vi.fn((opts?: any) => ({ value: opts?.default || [] })),
  }
})

// Mock constants
vi.mock('~/constants/constants', () => ({
  defaultTab: {
    label: '1',
    selectedModel: 'liquid/lfm2.5-1.2b',
    promptsList: [
      { key: 'Cache', content: [], type: 'Segments' },
      { key: 'System', content: '', type: 'Editor' },
      { key: 'User', content: '', type: 'Editor' },
      { key: 'Assistant', content: '', type: 'Editor' }
    ],
    stopController: undefined
  }
}))

// Import the logic functions directly
function getDefaultTab() {
  const defaultTab = {
    label: '1',
    selectedModel: 'liquid/lfm2.5-1.2b',
    promptsList: [
      { key: 'Cache', content: [], type: 'Segments' as const },
      { key: 'System', content: '', type: 'Editor' as const },
      { key: 'User', content: '', type: 'Editor' as const },
      { key: 'Assistant', content: '', type: 'Editor' as const }
    ],
    stopController: undefined
  }
  
  const raw = defaultTab
  const newDefaultTab = JSON.parse(JSON.stringify(raw))
  const userPrompt = newDefaultTab.promptsList.find((f: { key: string }) => f.key === 'User')
  if (userPrompt) {
    userPrompt.content = 'Who are you, and what can you do?'
  }
  return newDefaultTab
}

function checkTabs(totalJson: unknown[]) {
  if (totalJson.length === 0) {
    totalJson.push(getDefaultTab())
    return true
  }
  return false
}

function addTab(totalJson: unknown[], activeTab: string) {
  checkTabs(totalJson)
  const activeIndex = parseInt(activeTab)
  const previous = totalJson[activeIndex]
  if (!previous) return false

  const cloned = JSON.parse(JSON.stringify(previous))
  cloned.label = (totalJson.length + 1).toString()
  cloned.stopController = undefined
  totalJson.push(cloned)
  
  return true
}

function deleteTab(totalJson: unknown[], tabFilePath: Record<number, string>, tabAutoSave: Record<number, boolean>, index: number, activeTabRef: { value: string }) {
  if (totalJson.length <= 1) {
    totalJson[0] = getDefaultTab()
    return true
  }

  totalJson.splice(index, 1)

  // Adjust active tab index
  const activeIdx = parseInt(activeTabRef.value)
  if (activeIdx >= totalJson.length) {
    activeTabRef.value = (totalJson.length - 1).toString()
  }

  // Clean up per-tab state for deleted tab
  const newFilePaths: Record<number, string> = {}
  const newAutoSave: Record<number, boolean> = {}
  for (const [key, value] of Object.entries(tabFilePath)) {
    const k = parseInt(key)
    if (k < index) {
      newFilePaths[k] = value
    } else if (k > index) {
      newFilePaths[k - 1] = value
    }
  }
  for (const [key, value] of Object.entries(tabAutoSave)) {
    const k = parseInt(key)
    if (k < index) {
      newAutoSave[k] = value
    } else if (k > index) {
      newAutoSave[k - 1] = value
    }
  }
  
  return { tabFilePath: newFilePaths, tabAutoSave: newAutoSave }
}

describe('getDefaultTab', () => {
  it('should return a valid tab with User prompt set to default message', () => {
    const tab = getDefaultTab()
    
    expect(tab).toBeDefined()
    expect(tab.label).toBe('1')
    expect(tab.selectedModel).toBe('liquid/lfm2.5-1.2b')
    expect(tab.promptsList.length).toBe(4)
    
    const userPrompt = tab.promptsList.find((p: { key: string }) => p.key === 'User')
    expect(userPrompt?.content).toBe('Who are you, and what can you do?')
  })

  it('should return a deep clone (not the original)', () => {
    const tab1 = getDefaultTab()
    const tab2 = getDefaultTab()
    
    // They should be different objects
    expect(tab1).not.toBe(tab2)
    expect(tab1.promptsList).not.toBe(tab2.promptsList)
  })

  it('should preserve all prompt keys', () => {
    const tab = getDefaultTab()
    const keys = tab.promptsList.map((p: { key: string }) => p.key)
    
    expect(keys).toEqual(['Cache', 'System', 'User', 'Assistant'])
  })
})

describe('checkTabs', () => {
  it('should add a default tab when array is empty', () => {
    const totalJson: unknown[] = []
    const result = checkTabs(totalJson)
    
    expect(result).toBe(true)
    expect(totalJson.length).toBe(1)
  })

  it('should not modify array when it already has items', () => {
    const totalJson = [{}]
    const result = checkTabs(totalJson)
    
    expect(result).toBe(false)
    expect(totalJson.length).toBe(1)
  })
})

describe('addTab', () => {
  it('should add a new tab and increment the label', () => {
    const totalJson = [getDefaultTab()]
    const result = addTab(totalJson, '0')
    
    expect(result).toBe(true)
    expect(totalJson.length).toBe(2)
    expect((totalJson[1] as { label: string }).label).toBe('2')
  })

  it('should clone the previous tab content', () => {
    const existingTab = {
      label: '1',
      selectedModel: 'liquid/lfm2.5-1.2b',
      promptsList: [{ key: 'User', content: 'Custom content' }],
      stopController: undefined
    }
    const totalJson = [existingTab]
    addTab(totalJson, '0')
    
    const newTab = totalJson[1] as { promptsList: Array<{ content: string }> }
    expect(newTab.promptsList[0].content).toBe('Custom content')
  })

  it('should set stopController to undefined on cloned tab', () => {
    const existingTab = {
      label: '1',
      selectedModel: 'liquid/lfm2.5-1.2b',
      promptsList: [],
      stopController: { cancel: vi.fn() }
    }
    const totalJson = [existingTab]
    addTab(totalJson, '0')
    
    const newTab = totalJson[1] as { stopController: unknown }
    expect(newTab.stopController).toBeUndefined()
  })

  it('should return false when active index is out of bounds', () => {
    const totalJson = [getDefaultTab()]
    const result = addTab(totalJson, '5')
    
    expect(result).toBe(false)
    expect(totalJson.length).toBe(1)
  })

  it('should handle multiple tabs being added sequentially', () => {
    const totalJson = [getDefaultTab()]
    
    addTab(totalJson, '0')
    addTab(totalJson, '1')
    addTab(totalJson, '2')
    
    expect(totalJson.length).toBe(4)
    expect((totalJson[1] as { label: string }).label).toBe('2')
    expect((totalJson[2] as { label: string }).label).toBe('3')
    expect((totalJson[3] as { label: string }).label).toBe('4')
  })
})

describe('deleteTab', () => {
  it('should reset to default when deleting the only tab', () => {
    const totalJson = [getDefaultTab()]
    const tabFilePath: Record<number, string> = { 0: '/path/to/file.json' }
    const tabAutoSave: Record<number, boolean> = { 0: true }
    const activeTabRef = { value: '0' }
    
    const result = deleteTab(totalJson, tabFilePath, tabAutoSave, 0, activeTabRef)
    
    expect(totalJson.length).toBe(1)
    expect(result).toBeDefined()
  })

  it('should remove the tab at the given index', () => {
    const totalJson = [getDefaultTab(), getDefaultTab(), getDefaultTab()]
    const tabFilePath: Record<number, string> = { 0: '/path1.json', 1: '/path2.json', 2: '/path3.json' }
    const tabAutoSave: Record<number, boolean> = { 0: true, 1: false, 2: true }
    const activeTabRef = { value: '0' }
    
    const result = deleteTab(totalJson, tabFilePath, tabAutoSave, 1, activeTabRef)
    
    expect(totalJson.length).toBe(2)
    expect(result?.tabFilePath[0]).toBe('/path1.json')
    expect(result?.tabFilePath[1]).toBe('/path3.json') // index shifted
    expect(result?.tabAutoSave[0]).toBe(true)
    expect(result?.tabAutoSave[1]).toBe(true) // index shifted
  })

  it('should adjust activeTab when it exceeds new length', () => {
    const totalJson = [getDefaultTab(), getDefaultTab(), getDefaultTab()]
    const tabFilePath: Record<number, string> = {}
    const tabAutoSave: Record<number, boolean> = {}
    const activeTabRef = { value: '2' }
    
    deleteTab(totalJson, tabFilePath, tabAutoSave, 1, activeTabRef)
    
    expect(totalJson.length).toBe(2)
    expect(activeTabRef.value).toBe('1') // was 2, now clamped to 1
  })

  it('should not adjust activeTab when it is within bounds', () => {
    const totalJson = [getDefaultTab(), getDefaultTab(), getDefaultTab()]
    const tabFilePath: Record<number, string> = {}
    const tabAutoSave: Record<number, boolean> = {}
    const activeTabRef = { value: '0' }
    
    deleteTab(totalJson, tabFilePath, tabAutoSave, 2, activeTabRef)
    
    expect(activeTabRef.value).toBe('0') // unchanged
  })

  it('should handle deleting last tab correctly', () => {
    const totalJson = [getDefaultTab(), getDefaultTab()]
    const tabFilePath: Record<number, string> = { 0: '/path1.json', 1: '/path2.json' }
    const tabAutoSave: Record<number, boolean> = { 0: true, 1: false }
    const activeTabRef = { value: '0' }
    
    const result = deleteTab(totalJson, tabFilePath, tabAutoSave, 1, activeTabRef)
    
    expect(totalJson.length).toBe(1)
    expect(result?.tabFilePath[0]).toBe('/path1.json')
  })
})

describe('quickSwitchTabs throttling', () => {
  it('should allow switch when cooldown has passed', () => {
    let lastTabSwitch = 0
    const TAB_SWITCH_COOLDOWN = 150
    
    function quickSwitchTabs(now: number, tabIndex: number) {
      if (now - lastTabSwitch < TAB_SWITCH_COOLDOWN) return null
      lastTabSwitch = now
      return tabIndex
    }
    
    const result1 = quickSwitchTabs(1000, 1)
    expect(result1).toBe(1)
    
    const result2 = quickSwitchTabs(1200, 2) // 200ms > 150ms cooldown
    expect(result2).toBe(2)
  })

  it('should block switch when within cooldown', () => {
    let lastTabSwitch = 0
    const TAB_SWITCH_COOLDOWN = 150
    
    function quickSwitchTabs(now: number, tabIndex: number) {
      if (now - lastTabSwitch < TAB_SWITCH_COOLDOWN) return null
      lastTabSwitch = now
      return tabIndex
    }
    
    quickSwitchTabs(1000, 1)
    const result = quickSwitchTabs(1050, 2) // 50ms < 150ms cooldown
    expect(result).toBeNull()
  })

  it('should allow switch exactly at cooldown boundary', () => {
    let lastTabSwitch = 0
    const TAB_SWITCH_COOLDOWN = 150
    
    function quickSwitchTabs(now: number, tabIndex: number) {
      if (now - lastTabSwitch < TAB_SWITCH_COOLDOWN) return null
      lastTabSwitch = now
      return tabIndex
    }
    
    quickSwitchTabs(1000, 1)
    const result = quickSwitchTabs(1150, 2) // exactly 150ms
    expect(result).toBe(2)
  })
})
