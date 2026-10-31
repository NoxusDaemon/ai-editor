import type { BlockType } from '~/lib/workspace'

interface BlockMeta {
  label: string
  icon: string
  /** Left accent border colour. */
  accent: string
  placeholder: string
}

/** How each block type is presented. Order is the order of the "add block" buttons. */
export const BLOCK_META: Record<BlockType, BlockMeta> = {
  system: {
    label: 'System',
    icon: 'i-lucide-settings-2',
    accent: 'border-l-warning',
    placeholder: 'Instructions that set the model’s behaviour…'
  },
  user: {
    label: 'User',
    icon: 'i-lucide-user-round',
    accent: 'border-l-primary',
    placeholder: 'Write a message…'
  },
  assistant: {
    label: 'Assistant',
    icon: 'i-lucide-bot',
    accent: 'border-l-info',
    placeholder: 'Leave empty and press Send to generate a reply…'
  },
  snippets: {
    label: 'Snippets',
    icon: 'i-lucide-bookmark',
    accent: 'border-l-secondary',
    placeholder: ''
  }
}

export const BLOCK_TYPES = Object.keys(BLOCK_META) as BlockType[]
