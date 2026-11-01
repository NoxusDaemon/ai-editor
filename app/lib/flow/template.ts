/**
 * Templates: text with `{{ expression }}` placeholders, e.g.
 * "Summarise this for {{vars.audience}}: {{nodes.fetch.output}}".
 * Placeholders use the expression language (see expression.ts).
 */
import { checkExpression, evaluate, ExpressionError, formatValue } from './expression'

const TAG = /\{\{([\s\S]*?)\}\}/g
const SINGLE_TAG = /^\s*\{\{([\s\S]*?)\}\}\s*$/
// The Markdown editor escapes punctuation (`my\_var`) and may encode HTML characters; undo both inside tags.
const MARKDOWN_ESCAPE = /\\([!-/:-@[-`{-~])/g
const ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': '\'', '&nbsp;': ' ' }

export class TemplateError extends Error {
  override name = 'TemplateError'
}

function clean(expression: string): string {
  return expression
    .replace(MARKDOWN_ESCAPE, '$1')
    .replace(/&(?:lt|gt|amp|quot|#39|nbsp);/g, entity => ENTITIES[entity]!)
    .replace(/\u00A0/g, ' ')
    .trim()
}

function evaluateTag(expression: string, scope: Record<string, unknown>): unknown {
  const src = clean(expression)
  try {
    return evaluate(src, scope)
  } catch (error) {
    if (error instanceof ExpressionError) throw new TemplateError(`In {{${src}}}: ${error.message}`)
    throw error
  }
}

/** Fills in every placeholder. Throws `TemplateError` for an invalid one. */
export function renderTemplate(text: string, scope: Record<string, unknown>): string {
  if (!text.includes('{{')) return text
  return text.replace(TAG, (_, expression: string) => formatValue(evaluateTag(expression, scope)))
}

/** Like `renderTemplate`, but a template that is a single placeholder keeps its value's type. */
export function renderValue(text: string, scope: Record<string, unknown>): unknown {
  const single = SINGLE_TAG.exec(text)
  if (single && !single[1]!.includes('{{')) return evaluateTag(single[1]!, scope)
  return renderTemplate(text, scope)
}

/** The expressions in a template's placeholders. */
export function templateExpressions(text: string): string[] {
  return [...text.matchAll(TAG)].map(match => clean(match[1]!))
}

/** Problems with a template's placeholders; empty when it is fine. */
export function checkTemplate(text: string): string[] {
  const problems = templateExpressions(text).flatMap((expression) => {
    const error = checkExpression(expression)
    return error ? [`{{${expression}}}: ${error}`] : []
  })
  if (text.replace(TAG, '').includes('{{')) problems.push('A "{{" placeholder is never closed with "}}".')
  return problems
}
