/**
 * A small, safe expression language for conditions, loops, variables and templates:
 *
 *   nodes.classify.output.category == "billing" && len(vars.items) > 0
 *   vars.score >= 8 ? "done" : "revise"
 *
 * Expressions are parsed into a tree and interpreted — no `eval` or `new Function`
 * (the CSP forbids them, and flows can come from files). They can only read the
 * scope they are given (own properties of plain data, never prototypes) and only
 * call the built-in functions below.
 *
 * Semantics are forgiving, as in a template language: reading a missing property
 * gives `null` rather than an error, `==` compares numbers with numeric strings,
 * and empty strings, lists and objects are false.
 */

export class ExpressionError extends Error {
  override name = 'ExpressionError'
}

type Token
  = | { type: 'num', value: number, pos: number }
    | { type: 'str', value: string, pos: number }
    | { type: 'ident', value: string, pos: number }
    | { type: 'op', value: string, pos: number }
    | { type: 'eof', pos: number }

export type Expr
  = | { t: 'lit', value: unknown }
    | { t: 'id', name: string }
    | { t: 'member', object: Expr, property: Expr }
    | { t: 'call', name: string, args: Expr[] }
    | { t: 'unary', op: string, arg: Expr }
    | { t: 'binary', op: string, left: Expr, right: Expr }
    | { t: 'logical', op: '&&' | '||' | '??', left: Expr, right: Expr }
    | { t: 'cond', test: Expr, yes: Expr, no: Expr }
    | { t: 'array', items: Expr[] }
    | { t: 'object', entries: [string, Expr][] }

const OPERATORS = ['===', '!==', '==', '!=', '<=', '>=', '&&', '||', '??', '<', '>', '+', '-', '*', '/', '%', '!', '?', ':', '.', ',', '(', ')', '[', ']', '{', '}']
const WORD_OPERATORS: Record<string, string> = { and: '&&', or: '||', not: '!' }
const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' }
/** Never readable, so expressions can't reach prototypes. */
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const MAX_RANGE = 10_000

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]!
    if (/\s/.test(ch)) {
      i++
      continue
    }
    const start = i
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(src[i + 1] ?? ''))) {
      const match = /^(\d*\.?\d+(?:[eE][+-]?\d+)?)/.exec(src.slice(i))!
      tokens.push({ type: 'num', value: Number(match[1]), pos: start })
      i += match[1]!.length
      continue
    }
    if (ch === '"' || ch === '\'') {
      let value = ''
      i++
      while (i < src.length && src[i] !== ch) {
        if (src[i] === '\\') {
          const next = src[i + 1]
          if (next === undefined) break
          if (next === 'u') {
            const hex = src.slice(i + 2, i + 6)
            if (!/^[\da-fA-F]{4}$/.test(hex)) throw new ExpressionError(`Invalid \\u escape at ${i + 1}`)
            value += String.fromCharCode(Number.parseInt(hex, 16))
            i += 6
            continue
          }
          value += Object.hasOwn(ESCAPES, next) ? ESCAPES[next] : next
          i += 2
          continue
        }
        value += src[i]
        i++
      }
      if (src[i] !== ch) throw new ExpressionError(`Unclosed string starting at ${start + 1}`)
      i++
      tokens.push({ type: 'str', value, pos: start })
      continue
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const match = /^[\w$]+/.exec(src.slice(i))!
      const word = match[0]
      tokens.push(Object.hasOwn(WORD_OPERATORS, word) ? { type: 'op', value: WORD_OPERATORS[word]!, pos: start } : { type: 'ident', value: word, pos: start })
      i += word.length
      continue
    }
    const op = OPERATORS.find(o => src.startsWith(o, i))
    if (!op) throw new ExpressionError(`Unexpected "${ch}" at ${i + 1}`)
    tokens.push({ type: 'op', value: op, pos: start })
    i += op.length
  }
  tokens.push({ type: 'eof', pos: src.length })
  return tokens
}

class Parser {
  private index = 0

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.index]!
  }

  private next(): Token {
    return this.tokens[this.index++]!
  }

  private isOp(value: string): boolean {
    const token = this.peek()
    return token.type === 'op' && token.value === value
  }

  private eatOp(value: string): boolean {
    if (!this.isOp(value)) return false
    this.index++
    return true
  }

  private expectOp(value: string) {
    if (!this.eatOp(value)) this.fail(`Expected "${value}"`)
  }

  private fail(message: string): never {
    const token = this.peek()
    const found = token.type === 'eof' ? 'the end' : `"${'value' in token ? token.value : ''}"`
    throw new ExpressionError(`${message} at ${token.pos + 1}, found ${found}`)
  }

  parse(): Expr {
    if (this.peek().type === 'eof') throw new ExpressionError('Expected an expression')
    const expr = this.conditional()
    if (this.peek().type !== 'eof') this.fail('Unexpected input')
    return expr
  }

  private conditional(): Expr {
    const test = this.nullish()
    if (!this.eatOp('?')) return test
    const yes = this.conditional()
    this.expectOp(':')
    return { t: 'cond', test, yes, no: this.conditional() }
  }

  private nullish(): Expr {
    let left = this.or()
    while (this.eatOp('??')) left = { t: 'logical', op: '??', left, right: this.or() }
    return left
  }

  private or(): Expr {
    let left = this.and()
    while (this.eatOp('||')) left = { t: 'logical', op: '||', left, right: this.and() }
    return left
  }

  private and(): Expr {
    let left = this.equality()
    while (this.eatOp('&&')) left = { t: 'logical', op: '&&', left, right: this.equality() }
    return left
  }

  private binaryLevel(ops: string[], operand: () => Expr): Expr {
    let left = operand()
    for (;;) {
      const op = ops.find(o => this.isOp(o) || (o === 'in' && this.peek().type === 'ident' && (this.peek() as { value: string }).value === 'in'))
      if (!op) return left
      this.index++
      left = { t: 'binary', op, left, right: operand() }
    }
  }

  private equality(): Expr {
    return this.binaryLevel(['===', '!==', '==', '!='], () => this.relational())
  }

  private relational(): Expr {
    return this.binaryLevel(['<=', '>=', '<', '>', 'in'], () => this.additive())
  }

  private additive(): Expr {
    return this.binaryLevel(['+', '-'], () => this.multiplicative())
  }

  private multiplicative(): Expr {
    return this.binaryLevel(['*', '/', '%'], () => this.unary())
  }

  private unary(): Expr {
    for (const op of ['!', '-', '+']) {
      if (this.eatOp(op)) return { t: 'unary', op, arg: this.unary() }
    }
    return this.postfix()
  }

  private postfix(): Expr {
    let expr = this.primary()
    for (;;) {
      if (this.eatOp('.')) {
        const token = this.next()
        if (token.type !== 'ident') {
          this.index--
          this.fail('Expected a property name')
        }
        expr = { t: 'member', object: expr, property: { t: 'lit', value: token.value } }
      } else if (this.eatOp('[')) {
        const property = this.conditional()
        this.expectOp(']')
        expr = { t: 'member', object: expr, property }
      } else {
        return expr
      }
    }
  }

  private list(close: string, item: () => void) {
    if (this.eatOp(close)) return
    do {
      if (this.isOp(close)) break // trailing comma
      item()
    } while (this.eatOp(','))
    this.expectOp(close)
  }

  private primary(): Expr {
    const token = this.next()
    switch (token.type) {
      case 'num':
      case 'str':
        return { t: 'lit', value: token.value }
      case 'ident': {
        if (token.value === 'true') return { t: 'lit', value: true }
        if (token.value === 'false') return { t: 'lit', value: false }
        if (token.value === 'null' || token.value === 'undefined') return { t: 'lit', value: null }
        if (!this.isOp('(')) return { t: 'id', name: token.value }
        if (!Object.hasOwn(FUNCTIONS, token.value)) throw new ExpressionError(`Unknown function "${token.value}" at ${token.pos + 1}`)
        this.index++
        const args: Expr[] = []
        this.list(')', () => args.push(this.conditional()))
        return { t: 'call', name: token.value, args }
      }
      case 'op': {
        if (token.value === '(') {
          const expr = this.conditional()
          this.expectOp(')')
          return expr
        }
        if (token.value === '[') {
          const items: Expr[] = []
          this.list(']', () => items.push(this.conditional()))
          return { t: 'array', items }
        }
        if (token.value === '{') {
          const entries: [string, Expr][] = []
          this.list('}', () => {
            const key = this.next()
            if (key.type !== 'ident' && key.type !== 'str') {
              this.index--
              this.fail('Expected a property name')
            }
            this.expectOp(':')
            entries.push([String(key.value), this.conditional()])
          })
          return { t: 'object', entries }
        }
        break
      }
    }
    this.index--
    this.fail('Expected a value')
  }
}

// ── Values ──────────────────────────────────────────────────────────────

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Like JS truthiness, but empty lists and objects are false too. */
export function truthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0
  if (isPlainObject(value)) return Object.keys(value).length > 0
  return Boolean(value)
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]))
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a)
    return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && deepEqual(a[key], b[key]))
  }
  return false
}

const isNumericString = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))

/** `==`: deep for lists and objects, `null == undefined`, and `1 == "1"`. */
export function looseEquals(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == null && b == null
  if (typeof a === 'number' && isNumericString(b)) return a === Number(b)
  if (typeof b === 'number' && isNumericString(a)) return b === Number(a)
  return deepEqual(a, b)
}

/** How a value reads in text: strings as they are, lists and objects as JSON. */
export function formatValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value, null, 2)
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (isNumericString(value)) return Number(value)
  return Number.NaN
}

function compare(op: string, a: unknown, b: unknown): boolean {
  const bothStrings = typeof a === 'string' && typeof b === 'string' && !(isNumericString(a) && isNumericString(b))
  const [x, y] = bothStrings ? [a, b] : [toNumber(a), toNumber(b)]
  switch (op) {
    case '<': return x < y
    case '<=': return x <= y
    case '>': return x > y
    default: return x >= y
  }
}

function contains(haystack: unknown, needle: unknown): boolean {
  if (typeof haystack === 'string') return haystack.includes(formatValue(needle))
  if (Array.isArray(haystack)) return haystack.some(item => looseEquals(item, needle))
  if (isPlainObject(haystack)) return Object.hasOwn(haystack, formatValue(needle))
  return false
}

function read(object: unknown, key: unknown): unknown {
  if (object == null) return null
  const name = typeof key === 'number' ? key : formatValue(key)
  if (typeof name === 'string' && BLOCKED_KEYS.has(name)) return null
  if (typeof object === 'string' || Array.isArray(object)) {
    if (name === 'length') return object.length
    const index = typeof name === 'number' ? name : isNumericString(name) ? Number(name) : Number.NaN
    if (!Number.isInteger(index)) return null
    return object.at(index) ?? null
  }
  if (isPlainObject(object)) return Object.hasOwn(object, name) ? object[name] : null
  return null
}

const asString = (value: unknown) => formatValue(value)
const asList = (value: unknown): unknown[] => Array.isArray(value) ? value : value == null ? [] : [value]

function regex(pattern: unknown, flags: unknown): RegExp {
  const flagText = flags == null ? '' : asString(flags)
  if (!/^[gimsuy]*$/.test(flagText)) throw new ExpressionError(`Invalid regular expression flags "${flagText}"`)
  try {
    return new RegExp(asString(pattern), flagText)
  } catch (error) {
    throw new ExpressionError(`Invalid regular expression: ${(error as Error).message}`)
  }
}

type Fn = (...args: unknown[]) => unknown

const FUNCTIONS: Record<string, Fn> = {
  len: v => typeof v === 'string' || Array.isArray(v) ? v.length : isPlainObject(v) ? Object.keys(v).length : 0,
  lower: v => asString(v).toLowerCase(),
  upper: v => asString(v).toUpperCase(),
  trim: v => asString(v).trim(),
  contains: (a, b) => contains(a, b),
  startsWith: (a, b) => asString(a).startsWith(asString(b)),
  endsWith: (a, b) => asString(a).endsWith(asString(b)),
  matches: (text, pattern, flags) => regex(pattern, flags).test(asString(text)),
  replace: (text, find, replacement) => asString(text).split(asString(find)).join(asString(replacement)),
  split: (text, separator) => asString(text).split(separator == null ? ',' : asString(separator)).map(part => part.trim()),
  join: (list, separator) => asList(list).map(asString).join(separator == null ? ', ' : asString(separator)),
  number: v => toNumber(v),
  string: v => asString(v),
  bool: v => truthy(v),
  json: v => JSON.stringify(v ?? null),
  parse: (v) => {
    try {
      return JSON.parse(asString(v))
    } catch {
      throw new ExpressionError('parse(): not valid JSON')
    }
  },
  default: (v, fallback) => v == null || v === '' ? fallback : v,
  exists: v => v != null,
  type: v => v === null || v === undefined ? 'null' : Array.isArray(v) ? 'list' : typeof v,
  keys: v => isPlainObject(v) ? Object.keys(v) : [],
  values: v => isPlainObject(v) ? Object.values(v) : [],
  first: v => asList(v)[0] ?? null,
  last: v => asList(v).at(-1) ?? null,
  slice: (v, start, end) => (typeof v === 'string' ? v : asList(v)).slice(toNumber(start ?? 0), end == null ? undefined : toNumber(end)),
  append: (list, ...items) => [...asList(list), ...items],
  merge: (...objects) => Object.assign({}, ...objects.filter(isPlainObject)),
  range: (n) => {
    const count = Math.max(0, Math.min(MAX_RANGE, Math.floor(toNumber(n)) || 0))
    return Array.from({ length: count }, (_, i) => i)
  },
  round: (v, digits) => {
    const factor = 10 ** (toNumber(digits ?? 0) || 0)
    return Math.round(toNumber(v) * factor) / factor
  },
  floor: v => Math.floor(toNumber(v)),
  ceil: v => Math.ceil(toNumber(v)),
  abs: v => Math.abs(toNumber(v)),
  min: (...v) => Math.min(...v.flat().map(toNumber)),
  max: (...v) => Math.max(...v.flat().map(toNumber))
}

/** Names of the built-in functions, for help text. */
export const FUNCTION_NAMES = Object.keys(FUNCTIONS)

function evaluateNode(expr: Expr, scope: Record<string, unknown>): unknown {
  switch (expr.t) {
    case 'lit':
      return expr.value
    case 'id':
      return Object.hasOwn(scope, expr.name) && !BLOCKED_KEYS.has(expr.name) ? scope[expr.name] ?? null : null
    case 'member':
      return read(evaluateNode(expr.object, scope), evaluateNode(expr.property, scope))
    case 'call':
      return FUNCTIONS[expr.name]!(...expr.args.map(arg => evaluateNode(arg, scope)))
    case 'array':
      return expr.items.map(item => evaluateNode(item, scope))
    case 'object':
      return Object.fromEntries(expr.entries.filter(([key]) => !BLOCKED_KEYS.has(key)).map(([key, value]) => [key, evaluateNode(value, scope)]))
    case 'cond':
      return truthy(evaluateNode(expr.test, scope)) ? evaluateNode(expr.yes, scope) : evaluateNode(expr.no, scope)
    case 'unary': {
      const value = evaluateNode(expr.arg, scope)
      if (expr.op === '!') return !truthy(value)
      return expr.op === '-' ? -toNumber(value) : toNumber(value)
    }
    case 'logical': {
      const left = evaluateNode(expr.left, scope)
      if (expr.op === '??') return left ?? evaluateNode(expr.right, scope)
      if (expr.op === '&&') return truthy(left) ? evaluateNode(expr.right, scope) : left
      return truthy(left) ? left : evaluateNode(expr.right, scope)
    }
    case 'binary': {
      const left = evaluateNode(expr.left, scope)
      const right = evaluateNode(expr.right, scope)
      switch (expr.op) {
        case '==': return looseEquals(left, right)
        case '!=': return !looseEquals(left, right)
        case '===': return deepEqual(left, right)
        case '!==': return !deepEqual(left, right)
        case 'in': return contains(right, left)
        case '+':
          if (Array.isArray(left) && Array.isArray(right)) return [...left, ...right]
          if (typeof left === 'string' || typeof right === 'string') return asString(left) + asString(right)
          return toNumber(left) + toNumber(right)
        case '-': return toNumber(left) - toNumber(right)
        case '*': return toNumber(left) * toNumber(right)
        case '/': return toNumber(left) / toNumber(right)
        case '%': return toNumber(left) % toNumber(right)
        default: return compare(expr.op, left, right)
      }
    }
  }
}

const cache = new Map<string, Expr>()
const CACHE_LIMIT = 500

/** Parses an expression, caching the result. Throws `ExpressionError`. */
export function parseExpression(src: string): Expr {
  let expr = cache.get(src)
  if (!expr) {
    expr = new Parser(tokenize(src)).parse()
    if (cache.size >= CACHE_LIMIT) cache.clear()
    cache.set(src, expr)
  }
  return expr
}

/** Evaluates `src` against `scope`. Throws `ExpressionError` for invalid expressions. */
export function evaluate(src: string, scope: Record<string, unknown>): unknown {
  return evaluateNode(parseExpression(src), scope)
}

/** The error message for an invalid expression, or `null` when it is fine. */
export function checkExpression(src: string): string | null {
  try {
    parseExpression(src)
    return null
  } catch (error) {
    return (error as Error).message
  }
}

/** Dotted paths the expression reads from the scope, e.g. `nodes.draft.output`. Invalid expressions give none. */
export function referencedPaths(src: string): string[][] {
  let root: Expr
  try {
    root = parseExpression(src)
  } catch {
    return []
  }
  const paths: string[][] = []
  const pathOf = (expr: Expr): string[] | null => {
    if (expr.t === 'id') return [expr.name]
    if (expr.t === 'member' && expr.property.t === 'lit') {
      const base = pathOf(expr.object)
      return base ? [...base, String(expr.property.value)] : null
    }
    return null
  }
  const visit = (expr: Expr) => {
    const path = pathOf(expr)
    if (path) {
      paths.push(path)
      return
    }
    switch (expr.t) {
      case 'member':
        visit(expr.object)
        visit(expr.property)
        break
      case 'call': expr.args.forEach(visit)
        break
      case 'array': expr.items.forEach(visit)
        break
      case 'object': expr.entries.forEach(([, value]) => visit(value))
        break
      case 'unary': visit(expr.arg)
        break
      case 'binary':
      case 'logical':
        visit(expr.left)
        visit(expr.right)
        break
      case 'cond':
        visit(expr.test)
        visit(expr.yes)
        visit(expr.no)
        break
    }
  }
  visit(root)
  return paths
}
