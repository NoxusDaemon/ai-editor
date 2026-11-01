import { describe, expect, it } from 'vitest'
import { moveItem } from '~/lib/workspace'
import { padSnippet } from '~/utils/snippets'

describe('padSnippet', () => {
  it('leaves a trailing space at the end of a line so snippets chain', () => {
    expect(padSnippet('first', '', '')).toBe('first ')
    expect(padSnippet('second', ' ', '')).toBe('second ')
  })

  it('separates the snippet from words on either side', () => {
    expect(padSnippet('snippet', 'd', 'w')).toBe(' snippet ')
    expect(padSnippet('snippet', 'd', '')).toBe(' snippet ')
  })

  it('adds no space before closing punctuation or after an opening bracket', () => {
    expect(padSnippet('snippet', ' ', '.')).toBe('snippet')
    expect(padSnippet('snippet', '(', ')')).toBe('snippet')
    expect(padSnippet('snippet', ' ', ' ')).toBe('snippet')
  })

  it('trims the snippet itself', () => {
    expect(padSnippet('  spaced  ', '', '')).toBe('spaced ')
  })
})

describe('moveItem', () => {
  it('returns a reordered copy', () => {
    const items = ['a', 'b', 'c', 'd']
    expect(moveItem(items, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(items, 3, 1)).toEqual(['a', 'd', 'b', 'c'])
    expect(items).toEqual(['a', 'b', 'c', 'd'])
  })
})
