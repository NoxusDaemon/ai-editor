/**
 * Structured output: JSON Schemas for segment replies, a validator for them, and
 * pulling JSON out of a model's reply.
 *
 * The validator interprets the schema directly (Ajv compiles validators with
 * `new Function`, which the CSP forbids) and covers the keywords used for
 * model output: type, enum, const, properties, required, additionalProperties,
 * items, prefixItems, min/max (length, items, properties), pattern, numeric
 * bounds, multipleOf, uniqueItems, allOf/anyOf/oneOf/not, and local `$ref`s.
 */

export type JsonSchema = boolean | { [keyword: string]: unknown }

type SchemaObject = { [keyword: string]: unknown }

const MAX_DEPTH = 64
const MAX_ERRORS = 20

export type ParsedSchema = { ok: true, schema: SchemaObject } | { ok: false, error: string }

/** Parses the schema text of a segment. */
export function parseSchema(text: string): ParsedSchema {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    return { ok: false, error: `The schema is not valid JSON: ${(error as Error).message}` }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, error: 'The schema must be a JSON object, e.g. { "type": "object", "properties": { … } }.' }
  }
  return { ok: true, schema: value as SchemaObject }
}

const typeOf = (value: unknown): string => {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  return typeof value
}

const matchesType = (value: unknown, type: string) => {
  const actual = typeOf(value)
  return actual === type || (type === 'number' && actual === 'integer')
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => equal(item, b[i]))
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a)
    return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]))
  }
  return false
}

const at = (path: string, key: string | number) =>
  typeof key === 'number' ? `${path}[${key}]` : /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`

function resolveRef(ref: string, root: JsonSchema): JsonSchema | undefined {
  if (ref === '#') return root
  if (!ref.startsWith('#/')) return undefined
  let current: unknown = root
  for (const raw of ref.slice(2).split('/')) {
    const part = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~')
    if (!isObject(current) || !Object.hasOwn(current, part)) return undefined
    current = current[part]
  }
  return typeof current === 'boolean' || isObject(current) ? current as JsonSchema : undefined
}

function check(value: unknown, schema: JsonSchema, path: string, root: JsonSchema, errors: string[], depth: number): void {
  if (errors.length >= MAX_ERRORS) return
  if (depth > MAX_DEPTH) {
    errors.push(`${path}: the schema is nested too deeply`)
    return
  }
  if (schema === true) return
  if (schema === false) {
    errors.push(`${path}: no value is allowed here`)
    return
  }
  const s = schema
  const sub = (v: unknown, child: unknown, p: string, into = errors) => check(v, child as JsonSchema, p, root, into, depth + 1)

  if (typeof s.$ref === 'string') {
    const target = resolveRef(s.$ref, root)
    if (target === undefined) errors.push(`${path}: unknown $ref ${s.$ref}`)
    else sub(value, target, path)
  }

  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? s.type as string[] : [s.type as string]
    if (!types.some(type => matchesType(value, type))) {
      errors.push(`${path}: expected ${types.join(' or ')}, got ${typeOf(value)}`)
      return
    }
  }
  if (Array.isArray(s.enum) && !s.enum.some(option => equal(option, value))) {
    errors.push(`${path}: must be one of ${s.enum.map(option => JSON.stringify(option)).join(', ')}`)
  }
  if ('const' in s && !equal(s.const, value)) errors.push(`${path}: must be ${JSON.stringify(s.const)}`)

  if (typeof value === 'string') {
    const length = [...value].length
    if (typeof s.minLength === 'number' && length < s.minLength) errors.push(`${path}: must be at least ${s.minLength} characters`)
    if (typeof s.maxLength === 'number' && length > s.maxLength) errors.push(`${path}: must be at most ${s.maxLength} characters`)
    if (typeof s.pattern === 'string') {
      try {
        if (!new RegExp(s.pattern, 'u').test(value)) errors.push(`${path}: must match ${s.pattern}`)
      } catch {
        errors.push(`${path}: the schema's pattern ${s.pattern} is invalid`)
      }
    }
  }

  if (typeof value === 'number') {
    if (typeof s.minimum === 'number' && value < s.minimum) errors.push(`${path}: must be ≥ ${s.minimum}`)
    if (typeof s.maximum === 'number' && value > s.maximum) errors.push(`${path}: must be ≤ ${s.maximum}`)
    if (typeof s.exclusiveMinimum === 'number' && value <= s.exclusiveMinimum) errors.push(`${path}: must be > ${s.exclusiveMinimum}`)
    if (typeof s.exclusiveMaximum === 'number' && value >= s.exclusiveMaximum) errors.push(`${path}: must be < ${s.exclusiveMaximum}`)
    if (typeof s.multipleOf === 'number' && s.multipleOf > 0 && Math.abs(value / s.multipleOf - Math.round(value / s.multipleOf)) > 1e-9) {
      errors.push(`${path}: must be a multiple of ${s.multipleOf}`)
    }
  }

  if (Array.isArray(value)) {
    if (typeof s.minItems === 'number' && value.length < s.minItems) errors.push(`${path}: must have at least ${s.minItems} items`)
    if (typeof s.maxItems === 'number' && value.length > s.maxItems) errors.push(`${path}: must have at most ${s.maxItems} items`)
    const prefix = Array.isArray(s.prefixItems) ? s.prefixItems : []
    prefix.forEach((child, i) => i < value.length && sub(value[i], child, at(path, i)))
    if (s.items !== undefined && !Array.isArray(s.items)) {
      value.slice(prefix.length).forEach((item, i) => sub(item, s.items, at(path, i + prefix.length)))
    }
    if (s.uniqueItems === true && value.some((item, i) => value.slice(i + 1).some(other => equal(item, other)))) {
      errors.push(`${path}: items must be unique`)
    }
  }

  if (isObject(value)) {
    const properties = isObject(s.properties) ? s.properties : {}
    if (Array.isArray(s.required)) {
      for (const key of s.required as string[]) {
        if (!Object.hasOwn(value, key)) errors.push(`${at(path, key)}: is required`)
      }
    }
    const count = Object.keys(value).length
    if (typeof s.minProperties === 'number' && count < s.minProperties) errors.push(`${path}: must have at least ${s.minProperties} properties`)
    if (typeof s.maxProperties === 'number' && count > s.maxProperties) errors.push(`${path}: must have at most ${s.maxProperties} properties`)
    for (const [key, item] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) sub(item, properties[key], at(path, key))
      else if (s.additionalProperties === false) errors.push(`${at(path, key)}: is not an allowed property`)
      else if (isObject(s.additionalProperties)) sub(item, s.additionalProperties, at(path, key))
    }
  }

  if (Array.isArray(s.allOf)) s.allOf.forEach(child => sub(value, child, path))
  const passes = (child: unknown) => {
    const scratch: string[] = []
    sub(value, child, path, scratch)
    return scratch.length === 0
  }
  if (Array.isArray(s.anyOf) && !s.anyOf.some(passes)) errors.push(`${path}: does not match any of the allowed shapes`)
  if (Array.isArray(s.oneOf)) {
    const matches = s.oneOf.filter(passes).length
    if (matches !== 1) errors.push(`${path}: must match exactly one of the allowed shapes (matches ${matches})`)
  }
  if (s.not !== undefined && passes(s.not)) errors.push(`${path}: matches a shape that is not allowed`)
}

/** Every way `value` breaks `schema` (up to 20), as "$.path: problem". Empty when it matches. */
export function validateJson(value: unknown, schema: JsonSchema): string[] {
  const errors: string[] = []
  check(value, schema, '$', schema, errors, 0)
  return errors
}

export type ExtractedJson = { ok: true, value: unknown } | { ok: false, error: string }

/**
 * Reads JSON from a model reply, which may wrap it in a ```json fence or in prose.
 * Tries the whole reply, then a fenced block, then the outermost {…} or […].
 */
export function extractJson(text: string): ExtractedJson {
  const candidates = [text.trim()]
  const fenced = /```(?:json|JSON)?\s*\n?([\s\S]*?)```/.exec(text)
  if (fenced) candidates.push(fenced[1]!.trim())
  for (const [open, close] of [['{', '}'], ['[', ']']] as const) {
    const start = text.indexOf(open)
    const end = text.lastIndexOf(close)
    if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1))
  }
  let lastError = 'The reply is empty.'
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      return { ok: true, value: JSON.parse(candidate) }
    } catch (error) {
      lastError = (error as Error).message
    }
  }
  return { ok: false, error: `The reply is not valid JSON (${lastError}).` }
}

/** Top-level property names, for showing a schema's fields at a glance. */
export function schemaFields(text: string): string[] {
  const parsed = parseSchema(text)
  return parsed.ok && isObject(parsed.schema.properties) ? Object.keys(parsed.schema.properties) : []
}

export interface SchemaPreset {
  label: string
  description: string
  schema: object
}

export const SCHEMA_PRESETS: SchemaPreset[] = [
  {
    label: 'Classification',
    description: 'Pick one category, with a confidence score',
    schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['question', 'complaint', 'feedback', 'other'] },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        reason: { type: 'string' }
      },
      required: ['category', 'confidence'],
      additionalProperties: false
    }
  },
  {
    label: 'Yes / no decision',
    description: 'A boolean answer with a short justification',
    schema: {
      type: 'object',
      properties: { answer: { type: 'boolean' }, reason: { type: 'string' } },
      required: ['answer', 'reason'],
      additionalProperties: false
    }
  },
  {
    label: 'Review score',
    description: 'A 1–10 score with feedback, for critique loops',
    schema: {
      type: 'object',
      properties: {
        score: { type: 'integer', minimum: 1, maximum: 10 },
        feedback: { type: 'string' }
      },
      required: ['score', 'feedback'],
      additionalProperties: false
    }
  },
  {
    label: 'List of items',
    description: 'Extract a list of named things',
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { name: { type: 'string' }, details: { type: 'string' } },
            required: ['name'],
            additionalProperties: false
          }
        }
      },
      required: ['items'],
      additionalProperties: false
    }
  },
  {
    label: 'Search query',
    description: 'Rewrite a question into a retrieval query',
    schema: {
      type: 'object',
      properties: { query: { type: 'string', minLength: 1 } },
      required: ['query'],
      additionalProperties: false
    }
  }
]
