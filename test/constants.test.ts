import { describe, it, expect } from 'vitest'
import { defaultTab } from '~/constants/constants'

describe('defaultTab constants', () => {
  it('should have a label property', () => {
    expect(defaultTab.label).toBeDefined()
    expect(typeof defaultTab.label).toBe('string')
  })

  it('should have a selectedModel property', () => {
    expect(defaultTab.selectedModel).toBeDefined()
    expect(typeof defaultTab.selectedModel).toBe('string')
    expect(defaultTab.selectedModel).toContain('/')
  })

  it('should have a promptsList array', () => {
    expect(Array.isArray(defaultTab.promptsList)).toBe(true)
    expect(defaultTab.promptsList.length).toBeGreaterThan(0)
  })

  it('should have exactly 4 default prompts', () => {
    expect(defaultTab.promptsList.length).toBe(4)
  })

  it('should have Cache prompt with Segments type', () => {
    const cachePrompt = defaultTab.promptsList.find((p: { key: string }) => p.key === 'Cache')
    expect(cachePrompt).toBeDefined()
    expect(cachePrompt?.type).toBe('Segments')
    expect(Array.isArray(cachePrompt?.content)).toBe(true)
  })

  it('should have System prompt with Editor type', () => {
    const systemPrompt = defaultTab.promptsList.find((p: { key: string }) => p.key === 'System')
    expect(systemPrompt).toBeDefined()
    expect(systemPrompt?.type).toBe('Editor')
    expect(typeof systemPrompt?.content).toBe('string')
  })

  it('should have User prompt with Editor type', () => {
    const userPrompt = defaultTab.promptsList.find((p: { key: string }) => p.key === 'User')
    expect(userPrompt).toBeDefined()
    expect(userPrompt?.type).toBe('Editor')
    expect(typeof userPrompt?.content).toBe('string')
  })

  it('should have Assistant prompt with Editor type', () => {
    const assistantPrompt = defaultTab.promptsList.find((p: { key: string }) => p.key === 'Assistant')
    expect(assistantPrompt).toBeDefined()
    expect(assistantPrompt?.type).toBe('Editor')
    expect(typeof assistantPrompt?.content).toBe('string')
  })

  it('should have prompts in the correct order', () => {
    const keys = defaultTab.promptsList.map((p: { key: string }) => p.key)
    expect(keys).toEqual(['Cache', 'System', 'User', 'Assistant'])
  })

  it('should have stopController as undefined by default', () => {
    expect(defaultTab.stopController).toBeUndefined()
  })

  it('should have a valid model key format', () => {
    // Model keys should be in the format "org/model-name"
    const modelKey = defaultTab.selectedModel
    expect(modelKey).toMatch(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/)
  })

  it('should be a deep cloneable object', () => {
    const cloned = JSON.parse(JSON.stringify(defaultTab))
    expect(cloned).toEqual(defaultTab)
    expect(cloned).not.toBe(defaultTab)
    expect(cloned.promptsList).not.toBe(defaultTab.promptsList)
  })
})
