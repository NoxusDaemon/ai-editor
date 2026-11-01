<template>
  <nav class="flex shrink-0 items-end gap-1 border-b border-default bg-elevated/40 px-2 pt-1.5">
    <div
      ref="tablist"
      role="tablist"
      aria-label="Sessions"
      class="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto [scrollbar-width:none]"
      @wheel.passive="onWheel"
    >
      <UContextMenu
        v-for="session in workspace.sessions"
        :key="session.id"
        :items="menuFor(session)"
      >
        <div
          :id="tabId(session.id)"
          role="tab"
          :aria-selected="session.id === workspace.activeId"
          :tabindex="session.id === workspace.activeId ? 0 : -1"
          :data-active="session.id === workspace.activeId || undefined"
          :title="session.title"
          class="group -mb-px flex h-9 max-w-56 shrink-0 cursor-pointer items-center gap-1.5 rounded-t-md border border-transparent ps-3 pe-1 text-sm text-muted outline-none select-none hover:bg-elevated hover:text-default focus-visible:ring-2 focus-visible:ring-primary data-active:border-default data-active:border-b-(--ui-bg) data-active:bg-default data-active:text-highlighted"
          data-testid="session-tab"
          @click="workspace.select(session.id)"
          @dblclick="startRename(session)"
          @auxclick="event => event.button === 1 && close(session)"
          @dragenter="workspace.select(session.id)"
          @keydown="onKeydown($event, session)"
        >
          <UIcon
            v-if="generation.isSessionBusy(session.id) || flowRun.isRunning(session.id)"
            name="i-lucide-loader-circle"
            class="size-3.5 shrink-0 animate-spin text-primary"
          />
          <input
            v-if="renamingId === session.id"
            v-model="renameValue"
            v-select-on-mount
            class="w-32 rounded bg-elevated px-1 text-highlighted outline-none ring-1 ring-primary"
            aria-label="Session name"
            @keydown.enter.prevent="commitRename"
            @keydown.esc.prevent="renamingId = null"
            @keydown.stop
            @blur="commitRename"
            @click.stop
            @dblclick.stop
          >
          <span
            v-else
            class="truncate"
          >{{ session.title }}</span>
          <UButton
            icon="i-lucide-x"
            size="xs"
            color="neutral"
            variant="ghost"
            tabindex="-1"
            :aria-label="`Close ${session.title}`"
            class="opacity-0 group-hover:opacity-100 group-data-active:opacity-100"
            @click.stop="close(session)"
          />
        </div>
      </UContextMenu>
    </div>

    <div class="mb-1 flex items-center">
      <UTooltip
        text="New session"
        :kbds="['meta', 't']"
      >
        <UButton
          icon="i-lucide-plus"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="New session"
          data-testid="add-session"
          @click="workspace.addSession()"
        />
      </UTooltip>
      <UDropdownMenu
        :items="templateItems"
        :content="{ align: 'end' }"
        :ui="{ content: 'w-80' }"
      >
        <UButton
          icon="i-lucide-chevron-down"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="New session from a template"
          data-testid="add-session-template"
        />
      </UDropdownMenu>
    </div>
  </nav>
</template>

<script setup lang="ts">
import type { ContextMenuItem, DropdownMenuItem } from '@nuxt/ui'
import { FLOW_TEMPLATES } from '~/lib/flow/templates'
import { sessionHasContent, type Session } from '~/lib/workspace'
import { useServices } from '~/services/container'
import { vSelectOnMount } from '~/utils/directives'

const workspace = useWorkspaceStore()
const generation = useGenerationStore()
const flowRun = useFlowRunStore()
const tablist = useTemplateRef('tablist')

const templateItems: DropdownMenuItem[][] = [
  [{ type: 'label', label: 'New session from a template' }],
  FLOW_TEMPLATES.map(template => ({
    label: template.title,
    description: template.description,
    icon: template.icon,
    onSelect: () => workspace.addSession(template)
  }))
]

const renamingId = ref<string | null>(null)
const renameValue = ref('')

const tabId = (id: string) => `session-tab-${id}`

function focusTab(id: string) {
  nextTick(() => document.getElementById(tabId(id))?.focus())
}

watch(() => workspace.activeId, (id) => {
  nextTick(() => document.getElementById(tabId(id))?.scrollIntoView({ block: 'nearest', inline: 'nearest' }))
})

function startRename(session: Session) {
  renamingId.value = session.id
  renameValue.value = session.title
}

function commitRename() {
  if (renamingId.value) workspace.renameSession(renamingId.value, renameValue.value)
  renamingId.value = null
}

async function close(session: Session) {
  if (sessionHasContent(session)) {
    const confirmed = await useServices().dialogs.confirm({
      title: `Close ${session.title}?`,
      description: 'Its flow will be removed from the workspace.',
      confirmLabel: 'Close session',
      danger: true
    })
    if (!confirmed) return
  }
  workspace.closeSession(session.id)
}

function menuFor(session: Session): ContextMenuItem[][] {
  return [
    [
      { label: 'Rename', icon: 'i-lucide-pencil', onSelect: () => startRename(session) },
      { label: 'Duplicate', icon: 'i-lucide-copy', onSelect: () => workspace.duplicate(session.id) }
    ],
    [
      { label: 'Close', icon: 'i-lucide-x', color: 'error', onSelect: () => void close(session) }
    ]
  ]
}

function onKeydown(event: KeyboardEvent, session: Session) {
  const index = workspace.sessions.findIndex(s => s.id === session.id)
  const last = workspace.sessions.length - 1
  const target = {
    ArrowLeft: Math.max(0, index - 1),
    ArrowRight: Math.min(last, index + 1),
    Home: 0,
    End: last
  }[event.key]

  if (target !== undefined) {
    event.preventDefault()
    const next = workspace.sessions[target]!
    workspace.select(next.id)
    focusTab(next.id)
  } else if (event.key === 'F2') {
    event.preventDefault()
    startRename(session)
  } else if (event.key === 'Delete') {
    event.preventDefault()
    void close(session)
  }
}

function onWheel(event: WheelEvent) {
  if (tablist.value && event.deltaY && !event.shiftKey) tablist.value.scrollLeft += event.deltaY
}
</script>
