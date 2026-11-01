import { describe, expect, it } from 'vitest'
import { checkExpression, evaluate, ExpressionError, referencedPaths, truthy } from '~/lib/flow/expression'
import { checkTemplate, renderTemplate, renderValue, TemplateError } from '~/lib/flow/template'

const scope = {
  input: 'Hello there',
  vars: { score: 8, items: ['a', 'b'], name: 'Ada', empty: [], count: '3' },
  nodes: { classify: { output: { category: 'billing', tags: ['x'] }, text: '{"category":"billing"}', visits: 2 } },
  last: null
}

describe('expressions', () => {
  it('reads paths and compares values', () => {
    expect(evaluate('nodes.classify.output.category == "billing"', scope)).toBe(true)
    expect(evaluate('vars.score >= 8 && len(vars.items) > 1', scope)).toBe(true)
    expect(evaluate('vars.items[1]', scope)).toBe('b')
    expect(evaluate('vars["name"]', scope)).toBe('Ada')
    expect(evaluate('vars.count == 3', scope)).toBe(true)
    expect(evaluate('vars.count === 3', scope)).toBe(false)
  })

  it('treats missing paths as null instead of failing', () => {
    expect(evaluate('nodes.missing.output.anything', scope)).toBeNull()
    expect(evaluate('nodes.missing.output ?? "fallback"', scope)).toBe('fallback')
    expect(evaluate('default(vars.nope, 5) + 1', scope)).toBe(6)
  })

  it('supports word operators, ternaries, arithmetic and literals', () => {
    expect(evaluate('not (vars.score < 5) and "a" in vars.items', scope)).toBe(true)
    expect(evaluate('vars.score > 9 ? "great" : vars.score > 7 ? "good" : "meh"', scope)).toBe('good')
    expect(evaluate('(vars.score + 2) * 3 % 7', scope)).toBe(2)
    expect(evaluate('"Hi " + vars.name', scope)).toBe('Hi Ada')
    expect(evaluate('[1, 2] + [3]', scope)).toEqual([1, 2, 3])
    expect(evaluate('{ a: 1, "b c": vars.name }', scope)).toEqual({ 'a': 1, 'b c': 'Ada' })
    expect(evaluate('\'it\\\'s\' + "\\n"', scope)).toBe('it\'s\n')
  })

  it('has built-in functions', () => {
    expect(evaluate('lower(trim("  BYE "))', scope)).toBe('bye')
    expect(evaluate('contains(input, "there") and startsWith(input, "Hell")', scope)).toBe(true)
    expect(evaluate('matches(input, "^hello", "i")', scope)).toBe(true)
    expect(evaluate('join(append(vars.items, "c"), "-")', scope)).toBe('a-b-c')
    expect(evaluate('parse(nodes.classify.text).category', scope)).toBe('billing')
    expect(evaluate('range(3)', scope)).toEqual([0, 1, 2])
    expect(evaluate('round(2.345, 2)', scope)).toBe(2.35)
    expect(evaluate('merge({ a: 1 }, { b: 2 })', scope)).toEqual({ a: 1, b: 2 })
    expect(evaluate('type(vars.items)', scope)).toBe('list')
  })

  it('uses forgiving truthiness: empty lists and objects are false', () => {
    expect(truthy([])).toBe(false)
    expect(truthy({})).toBe(false)
    expect(truthy('0')).toBe(true)
    expect(evaluate('!vars.empty', scope)).toBe(true)
  })

  it('cannot reach prototypes or call anything but built-ins', () => {
    expect(evaluate('vars.constructor', scope)).toBeNull()
    expect(evaluate('vars["__proto__"]', scope)).toBeNull()
    expect(evaluate('input.length', scope)).toBe(11)
    expect(() => evaluate('alert(1)', scope)).toThrow(/Unknown function "alert"/)
    expect(() => evaluate('vars.name.toUpperCase()', scope)).toThrow(ExpressionError)
  })

  it('reports syntax errors with positions', () => {
    expect(checkExpression('vars.score >')).toMatch(/Expected a value at 13/)
    expect(checkExpression('"unclosed')).toMatch(/Unclosed string/)
    expect(checkExpression('')).toMatch(/Expected an expression/)
    expect(checkExpression('a b')).toMatch(/Unexpected input/)
    expect(checkExpression('vars.score > 3')).toBeNull()
  })

  it('lists the paths an expression reads', () => {
    expect(referencedPaths('nodes.a.output.x > len(vars.list) ? nodes.b.text : "x"')).toEqual([
      ['nodes', 'a', 'output', 'x'],
      ['vars', 'list'],
      ['nodes', 'b', 'text']
    ])
  })
})

describe('templates', () => {
  it('fills in placeholders, formatting objects as JSON', () => {
    expect(renderTemplate('Hi {{ vars.name }}, you said “{{input}}”.', scope)).toBe('Hi Ada, you said “Hello there”.')
    expect(renderTemplate('{{nodes.classify.output.tags}}', scope)).toBe('[\n  "x"\n]')
    expect(renderTemplate('Missing: [{{vars.nope}}]', scope)).toBe('Missing: []')
    expect(renderTemplate('No placeholders', scope)).toBe('No placeholders')
  })

  it('undoes the Markdown editor’s escaping inside placeholders', () => {
    expect(renderTemplate('{{vars.my\\_var}} {{vars.score &gt; 3}}', { vars: { my_var: 'ok', score: 5 } })).toBe('ok true')
  })

  it('keeps the value of a template that is a single placeholder', () => {
    expect(renderValue('{{nodes.classify.output}}', scope)).toEqual({ category: 'billing', tags: ['x'] })
    expect(renderValue('Category: {{nodes.classify.output.category}}', scope)).toBe('Category: billing')
  })

  it('reports bad placeholders', () => {
    expect(() => renderTemplate('{{vars.score >}}', scope)).toThrow(TemplateError)
    expect(checkTemplate('{{ok}} and {{bad +}}')).toHaveLength(1)
    expect(checkTemplate('Unclosed {{vars.x')).toEqual(['A "{{" placeholder is never closed with "}}".'])
  })
})
