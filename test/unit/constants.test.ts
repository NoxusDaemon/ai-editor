import { describe, it, expect } from 'vitest'
import { defaultTab } from '~/constants/constants'

describe('defaultTab', () => {
  it('has the correct label', () => {
    expect(defaultTab.label).toBe('1')
  })

  it('has a selectedModel defined', () => {
    expect(defaultTab.selectedModel).toBe('liquid/lfm2.5-1.2b')
  })

  it('has a promptsList with 4 items', () => {
    expect(defaultTab.promptsList).toHaveLength(4)
  })

  it('has prompts with correct keys in order', () => {
    const keys = defaultTab.promptsList.map(p => p.key)
    expect(keys).toEqual(['Cache', 'System', 'User', 'Assistant'])
  })

  it('has Cache with type Segments and empty array content', () => {
    const cache = defaultTab.promptsList.find(p => p.key === 'Cache')
    expect(cache).toBeDefined()
    expect(cache!.type).toBe('Segments')
    expect(cache!.content).toEqual([])
  })

  it('has System with type Editor and empty string content', () => {
    const system = defaultTab.promptsList.find(p => p.key === 'System')
    expect(system).toBeDefined()
    expect(system!.type).toBe('Editor')
    expect(system!.content).toBe('')
  })

  it('has User with type Editor and empty string content', () => {
    const user = defaultTab.promptsList.find(p => p.key === 'User')
    expect(user).toBeDefined()
    expect(user!.type).toBe('Editor')
    expect(user!.content).toBe('')
  })

  it('has Assistant with type Editor and empty string content', () => {
    const assistant = defaultTab.promptsList.find(p => p.key === 'Assistant')
    expect(assistant).toBeDefined()
    expect(assistant!.type).toBe('Editor')
    expect(assistant!.content).toBe('')
  })

  it('has stopController as undefined', () => {
    expect(defaultTab.stopController).toBeUndefined()
  })
})
