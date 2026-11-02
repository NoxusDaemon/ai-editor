import type { NodeKind } from '~/lib/flow/types'

export interface NodeMeta {
  label: string
  icon: string
  /** Text colour of the icon and accents. */
  tone: string
  /** Top border of the card. */
  accent: string
  /** Minimap fill. */
  swatch: string
  description: string
  section: 'Steps' | 'Context' | 'Layout'
}

/** How each node kind is presented. Order is the order of the palette. */
export const NODE_META: Record<NodeKind, NodeMeta> = {
  segment: {
    label: 'Segment',
    icon: 'i-lucide-message-square-text',
    tone: 'text-primary',
    accent: 'border-t-primary',
    swatch: 'var(--ui-primary)',
    description: 'Messages for the model, and its reply',
    section: 'Steps'
  },
  condition: {
    label: 'Condition',
    icon: 'i-lucide-split',
    tone: 'text-warning',
    accent: 'border-t-warning',
    swatch: 'var(--ui-warning)',
    description: 'Takes the first case that is true',
    section: 'Steps'
  },
  loop: {
    label: 'Loop',
    icon: 'i-lucide-repeat',
    tone: 'text-info',
    accent: 'border-t-info',
    swatch: 'var(--ui-info)',
    description: 'Repeats a path a number of times, for each item, or while true',
    section: 'Steps'
  },
  parallel: {
    label: 'Parallel',
    icon: 'i-lucide-git-fork',
    tone: 'text-violet-500 dark:text-violet-400',
    accent: 'border-t-violet-500',
    swatch: 'var(--color-violet-500)',
    description: 'Runs several paths at the same time',
    section: 'Steps'
  },
  join: {
    label: 'Join',
    icon: 'i-lucide-git-merge',
    tone: 'text-violet-500 dark:text-violet-400',
    accent: 'border-t-violet-500',
    swatch: 'var(--color-violet-500)',
    description: 'Waits for the branches of a Parallel node and collects their outputs',
    section: 'Steps'
  },
  set: {
    label: 'Set variables',
    icon: 'i-lucide-variable',
    tone: 'text-muted',
    accent: 'border-t-(--ui-border-accented)',
    swatch: 'var(--ui-text-muted)',
    description: 'Stores values in vars, e.g. a state machine’s state',
    section: 'Steps'
  },
  ask: {
    label: 'Ask user',
    icon: 'i-lucide-message-circle-question',
    tone: 'text-secondary',
    accent: 'border-t-secondary',
    swatch: 'var(--ui-secondary)',
    description: 'Pauses the run for an answer (human in the loop)',
    section: 'Steps'
  },
  end: {
    label: 'End',
    icon: 'i-lucide-flag',
    tone: 'text-error',
    accent: 'border-t-error',
    swatch: 'var(--ui-error)',
    description: 'Finishes the run with a result',
    section: 'Steps'
  },
  memory: {
    label: 'Memory',
    icon: 'i-lucide-brain',
    tone: 'text-secondary',
    accent: 'border-t-secondary',
    swatch: 'var(--ui-secondary)',
    description: 'Notes, recent messages or saved facts, injected into segments',
    section: 'Context'
  },
  knowledge: {
    label: 'Knowledge',
    icon: 'i-lucide-library',
    tone: 'text-info',
    accent: 'border-t-info',
    swatch: 'var(--ui-info)',
    description: 'Documents to retrieve passages from (RAG)',
    section: 'Context'
  },
  group: {
    label: 'Group',
    icon: 'i-lucide-square-dashed',
    tone: 'text-muted',
    accent: '',
    swatch: 'var(--ui-border-accented)',
    description: 'Shares settings, memory and knowledge with everything inside',
    section: 'Layout'
  },
  note: {
    label: 'Note',
    icon: 'i-lucide-sticky-note',
    tone: 'text-warning',
    accent: 'border-t-warning',
    swatch: 'var(--ui-warning)',
    description: 'A comment on the canvas; never run',
    section: 'Layout'
  },
  start: {
    label: 'Start',
    icon: 'i-lucide-play',
    tone: 'text-success',
    accent: 'border-t-success',
    swatch: 'var(--ui-success)',
    description: 'Where a run begins',
    section: 'Steps'
  }
}

/** Kinds offered in the palette (a flow has one Start). */
export const PALETTE_KINDS = (Object.keys(NODE_META) as NodeKind[]).filter(kind => kind !== 'start')

/** Drag data type for dropping a new node from the palette onto the canvas. */
export const NODE_MIME = 'application/x-ai-editor-node'

/** Plain text for previews: Markdown markers and placeholders' braces removed, whitespace collapsed. */
export function previewText(markdown: string, length = 140): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' [code] ')
    .replace(/[*_`#>~]+/g, '')
    .replace(/\\([\\`*_{}[\]()#+\-.!|])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
}
