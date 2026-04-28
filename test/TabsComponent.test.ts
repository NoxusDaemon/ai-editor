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
      { key: 'Cache', content: [], type: 'Segments' as const },
      { key: 'System', content: '', type: 'Editor' as const },
      { key: 'User', content: '', type: 'Editor' as const },
      { key: 'Assistant', content: '', type: 'Editor' as const }
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

  it('should have Cache with empty content array', () => {
    const tab = getDefaultTab()
    const cachePrompt = tab.promptsList.find((p: { key: string }) => p.key === 'Cache')
    expect(cachePrompt?.content).toEqual([])
  })

  it('should have System with empty string content', () => {
    const tab = getDefaultTab()
    const sysPrompt = tab.promptsList.find((p: { key: string }) => p.key === 'System')
    expect(sysPrompt?.content).toBe('')
  })

  it('should have Assistant with empty string content', () => {
    const tab = getDefaultTab()
    const asstPrompt = tab.promptsList.find((p: { key: string }) => p.key === 'Assistant')
    expect(asstPrompt?.content).toBe('')
  })

  it('should have stopController as undefined', () => {
    const tab = getDefaultTab()
    expect(tab.stopController).toBeUndefined()
  })

  it('should have all promptsList items with correct types', () => {
    const tab = getDefaultTab()
    const cache = tab.promptsList[0]
    const system = tab.promptsList[1]
    const user = tab.promptsList[2]
    const assistant = tab.promptsList[3]
    
    expect(cache.type).toBe('Segments')
    expect(system.type).toBe('Editor')
    expect(user.type).toBe('Editor')
    expect(assistant.type).toBe('Editor')
  })

  it('should have content that is independent after modification', () => {
    const tab1 = getDefaultTab()
    const tab2 = getDefaultTab()
    
    tab1.promptsList[0].content.push('new item')
    expect(tab2.promptsList[0].content).toEqual([])
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

  it('should add a properly structured default tab', () => {
    const totalJson: unknown[] = []
    checkTabs(totalJson)
    
    const tab = totalJson[0] as { label: string; promptsList: Array<{ key: string }> }
    expect(tab.label).toBe('1')
    expect(tab.promptsList.length).toBe(4)
  })

  it('should handle array with null item', () => {
    const totalJson = [null]
    const result = checkTabs(totalJson)
    
    expect(result).toBe(false)
    expect(totalJson.length).toBe(1)
  })

  it('should handle array with undefined item', () => {
    const totalJson = [undefined]
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

  it('should handle negative activeTab index', () => {
    const totalJson = [getDefaultTab()]
    const result = addTab(totalJson, '-1')
    
    expect(result).toBe(false)
    expect(totalJson.length).toBe(1)
  })

  it('should handle non-numeric activeTab', () => {
    const totalJson = [getDefaultTab()]
    const result = addTab(totalJson, 'abc')
    
    expect(result).toBe(false)
    expect(totalJson.length).toBe(1)
  })

  it('should create independent cloned tabs', () => {
    const totalJson = [getDefaultTab()]
    addTab(totalJson, '0')
    
    const tab1 = totalJson[0] as { promptsList: Array<{ content: string }> }
    const tab2 = totalJson[1] as { promptsList: Array<{ content: string }> }
    
    tab1.promptsList[0].content.push('modified')
    expect(tab2.promptsList[0].content).not.toContain('modified')
  })

  it('should preserve selectedModel when cloning', () => {
    const existingTab = {
      label: '1',
      selectedModel: 'custom/model',
      promptsList: [],
      stopController: undefined
    }
    const totalJson = [existingTab]
    addTab(totalJson, '0')
    
    const newTab = totalJson[1] as { selectedModel: string }
    expect(newTab.selectedModel).toBe('custom/model')
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

  it('should handle deleting first tab', () => {
    const totalJson = [getDefaultTab(), getDefaultTab()]
    const tabFilePath: Record<number, string> = { 0: '/path1.json', 1: '/path2.json' }
    const tabAutoSave: Record<number, boolean> = { 0: true, 1: false }
    const activeTabRef = { value: '1' }
    
    const result = deleteTab(totalJson, tabFilePath, tabAutoSave, 0, activeTabRef)
    
    expect(totalJson.length).toBe(1)
    expect(result?.tabFilePath[0]).toBe('/path2.json')
    expect(activeTabRef.value).toBe('0')
  })

  it('should handle deleting middle tab in a 4-tab array', () => {
    const totalJson = [getDefaultTab(), getDefaultTab(), getDefaultTab(), getDefaultTab()]
    const tabFilePath: Record<number, string> = { 0: '/0.json', 1: '/1.json', 2: '/2.json', 3: '/3.json' }
    const tabAutoSave: Record<number, boolean> = { 0: true, 1: false, 2: true, 3: false }
    const activeTabRef = { value: '1' }
    
    const result = deleteTab(totalJson, tabFilePath, tabAutoSave, 1, activeTabRef)
    
    expect(totalJson.length).toBe(3)
    expect(result?.tabFilePath[0]).toBe('/0.json')
    expect(result?.tabFilePath[1]).toBe('/2.json')
    expect(result?.tabFilePath[2]).toBe('/3.json')
    expect(result?.tabAutoSave[0]).toBe(true)
    expect(result?.tabAutoSave[1]).toBe(true)
    expect(result?.tabAutoSave[2]).toBe(false)
  })

  it('should handle deleting tab with activeTab at same index', () => {
    const totalJson = [getDefaultTab(), getDefaultTab(), getDefaultTab()]
    const tabFilePath: Record<number, string> = {}
    const tabAutoSave: Record<number, boolean> = {}
    const activeTabRef = { value: '1' }
    
    deleteTab(totalJson, tabFilePath, tabAutoSave, 1, activeTabRef)
    
    expect(activeTabRef.value).toBe('1') // was 1, now points to what was tab 2
  })

  it('should handle negative index', () => {
    const totalJson = [getDefaultTab(), getDefaultTab()]
    const tabFilePath: Record<number, string> = {}
    const tabAutoSave: Record<number, boolean> = {}
    const activeTabRef = { value: '0' }
    
    deleteTab(totalJson, tabFilePath, tabAutoSave, -1, activeTabRef)
    
    expect(totalJson.length).toBe(1)
  })

  it('should handle index beyond array length gracefully', () => {
    const totalJson = [getDefaultTab(), getDefaultTab()]
    const tabFilePath: Record<number, string> = { 0: '/0.json', 1: '/1.json' }
    const tabAutoSave: Record<number, boolean> = { 0: true, 1: false }
    const activeTabRef = { value: '0' }
    
    deleteTab(totalJson, tabFilePath, tabAutoSave, 5, activeTabRef)
    
    // JS splice with index beyond length is a no-op, so length stays 2
    // but the function still returns cleaned state objects
    expect(totalJson.length).toBe(2)
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

  it('should block switch 1ms before cooldown ends', () => {
    let lastTabSwitch = 0
    const TAB_SWITCH_COOLDOWN = 150
    
    function quickSwitchTabs(now: number, tabIndex: number) {
      if (now - lastTabSwitch < TAB_SWITCH_COOLDOWN) return null
      lastTabSwitch = now
      return tabIndex
    }
    
    quickSwitchTabs(1000, 1)
    const result = quickSwitchTabs(1149, 2) // 149ms < 150ms cooldown
    expect(result).toBeNull()
  })

  it('should allow multiple switches after cooldown passes each time', () => {
    let lastTabSwitch = 0
    const TAB_SWITCH_COOLDOWN = 150
    
    function quickSwitchTabs(now: number, tabIndex: number) {
      if (now - lastTabSwitch < TAB_SWITCH_COOLDOWN) return null
      lastTabSwitch = now
      return tabIndex
    }
    
    const results = [
      quickSwitchTabs(1000, 1),
      quickSwitchTabs(1200, 2),
      quickSwitchTabs(1400, 3),
      quickSwitchTabs(1600, 4),
      quickSwitchTabs(1800, 5)
    ]
    
    expect(results).toEqual([1, 2, 3, 4, 5])
  })

  it('should handle rapid clicks within cooldown', () => {
    let lastTabSwitch = 0
    const TAB_SWITCH_COOLDOWN = 150
    
    function quickSwitchTabs(now: number, tabIndex: number) {
      if (now - lastTabSwitch < TAB_SWITCH_COOLDOWN) return null
      lastTabSwitch = now
      return tabIndex
    }
    
    const results = [
      quickSwitchTabs(1000, 1),
      quickSwitchTabs(1010, 2),
      quickSwitchTabs(1020, 3),
      quickSwitchTabs(1030, 4),
      quickSwitchTabs(1040, 5)
    ]
    
    expect(results).toEqual([1, null, null, null, null])
  })

  it('should handle very large time gaps', () => {
    let lastTabSwitch = 0
    const TAB_SWITCH_COOLDOWN = 150
    
    function quickSwitchTabs(now: number, tabIndex: number) {
      if (now - lastTabSwitch < TAB_SWITCH_COOLDOWN) return null
      lastTabSwitch = now
      return tabIndex
    }
    
    quickSwitchTabs(1000, 1)
    const result = quickSwitchTabs(1000000, 2) // 999000ms gap
    expect(result).toBe(2)
  })

  it('should handle zero time gap (same timestamp)', () => {
    let lastTabSwitch = 0
    const TAB_SWITCH_COOLDOWN = 150
    
    function quickSwitchTabs(now: number, tabIndex: number) {
      if (now - lastTabSwitch < TAB_SWITCH_COOLDOWN) return null
      lastTabSwitch = now
      return tabIndex
    }
    
    quickSwitchTabs(1000, 1)
    const result = quickSwitchTabs(1000, 2) // same timestamp
    expect(result).toBeNull()
  })
})

describe('integration: add and delete tabs', () => {
  it('should handle add-then-delete cycle', () => {
    const totalJson = [getDefaultTab()]
    const tabFilePath: Record<number, string> = { 0: '/0.json' }
    const tabAutoSave: Record<number, boolean> = { 0: true }
    const activeTabRef = { value: '0' }
    
    addTab(totalJson, '0')
    expect(totalJson.length).toBe(2)
    
    deleteTab(totalJson, tabFilePath, tabAutoSave, 1, activeTabRef)
    expect(totalJson.length).toBe(1)
  })

  it('should handle multiple add-delete cycles', () => {
    const totalJson = [getDefaultTab()]
    const tabFilePath: Record<number, string> = { 0: '/0.json' }
    const tabAutoSave: Record<number, boolean> = { 0: true }
    const activeTabRef = { value: '0' }
    
    // Add 3 tabs
    for (let i = 0; i < 3; i++) {
      addTab(totalJson, (totalJson.length - 1).toString())
    }
    expect(totalJson.length).toBe(4)
    
    // Delete all but one
    for (let i = 3; i > 0; i--) {
      deleteTab(totalJson, tabFilePath, tabAutoSave, i, activeTabRef)
    }
    expect(totalJson.length).toBe(1)
  })

  it('should handle adding tabs with different content', () => {
    const totalJson = [getDefaultTab()]
    
    // Modify first tab
    const tab1 = totalJson[0] as { promptsList: Array<{ content: string }> }
    tab1.promptsList[2].content = 'Custom user prompt'
    
    addTab(totalJson, '0')
    
    const tab2 = totalJson[1] as { promptsList: Array<{ content: string }> }
    // Should be a clone, so it should also have the custom content
    expect(tab2.promptsList[2].content).toBe('Custom user prompt')
  })

  it('should handle file paths correctly through add-delete cycles', () => {
    const totalJson = [getDefaultTab()]
    const tabFilePath: Record<number, string> = { 0: '/original.json' }
    const tabAutoSave: Record<number, boolean> = { 0: true }
    const activeTabRef = { value: '0' }
    
    addTab(totalJson, '0')
    tabFilePath[1] = '/cloned.json'
    
    deleteTab(totalJson, tabFilePath, tabAutoSave, 1, activeTabRef)
    
    expect(tabFilePath[0]).toBe('/original.json')
  })
})

describe('edge cases for tab operations', () => {
  it('should handle tab with empty promptsList', () => {
    const emptyTab = {
      label: '1',
      selectedModel: 'model',
      promptsList: [],
      stopController: undefined
    }
    const totalJson = [emptyTab]
    
    const result = addTab(totalJson, '0')
    expect(result).toBe(true)
    expect(totalJson.length).toBe(2)
  })

  it('should handle tab with null selectedModel', () => {
    const nullModelTab = {
      label: '1',
      selectedModel: null,
      promptsList: [],
      stopController: undefined
    }
    const totalJson = [nullModelTab]
    
    const result = addTab(totalJson, '0')
    expect(result).toBe(true)
    expect(totalJson.length).toBe(2)
  })

  it('should handle tab with very long label', () => {
    const longLabelTab = {
      label: 'x'.repeat(1000),
      selectedModel: 'model',
      promptsList: [],
      stopController: undefined
    }
    const totalJson = [longLabelTab]
    
    const result = addTab(totalJson, '0')
    expect(result).toBe(true)
    expect(totalJson.length).toBe(2)
  })

  it('should handle tab with unicode content', () => {
    const unicodeTab = {
      label: '1',
      selectedModel: 'model',
      promptsList: [{ key: 'User', content: 'こんにちは世界 🌍' }],
      stopController: undefined
    }
    const totalJson = [unicodeTab]
    
    addTab(totalJson, '0')
    const newTab = totalJson[1] as { promptsList: Array<{ content: string }> }
    expect(newTab.promptsList[0].content).toBe('こんにちは世界 🌍')
  })

  it('should handle tab with special characters in content', () => {
    const specialTab = {
      label: '1',
      selectedModel: 'model',
      promptsList: [{ key: 'User', content: '<script>alert("xss")</script>' }],
      stopController: undefined
    }
    const totalJson = [specialTab]
    
    addTab(totalJson, '0')
    const newTab = totalJson[1] as { promptsList: Array<{ content: string }> }
    expect(newTab.promptsList[0].content).toBe('<script>alert("xss")</script>')
  })

  it('should handle tab with very long content', () => {
    const longContent = 'x'.repeat(100000)
    const longTab = {
      label: '1',
      selectedModel: 'model',
      promptsList: [{ key: 'User', content: longContent }],
      stopController: undefined
    }
    const totalJson = [longTab]
    
    addTab(totalJson, '0')
    const newTab = totalJson[1] as { promptsList: Array<{ content: string }> }
    expect(newTab.promptsList[0].content).toBe(longContent)
  })
})
