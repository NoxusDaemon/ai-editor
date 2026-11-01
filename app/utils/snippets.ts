/** Drag data type that marks the text as a snippet, so prompt editors can space it like a word. */
export const SNIPPET_MIME = 'application/x-ai-editor-snippet'

/**
 * Spaces a snippet dropped between `before` and `after`, the characters either
 * side of the drop point ('' at the start or end of a line), so it reads as a
 * word of its own. It ends with a space unless whitespace or closing punctuation
 * follows, so the next snippet or word can be added straight after it.
 */
export function padSnippet(text: string, before: string, after: string): string {
  const lead = before === '' || /[\s([{]/.test(before) ? '' : ' '
  const trail = /^[\s.,;:!?)\]}]/.test(after) ? '' : ' '
  return `${lead}${text.trim()}${trail}`
}
