<template>
  <div class="flex w-full flex-wrap items-center gap-2">
    <div class="flex items-center gap-1 rounded-lg border border-default bg-default/95 p-1 shadow-sm backdrop-blur">
      <UTooltip
        text="Undo"
        :kbds="['meta', 'z']"
      >
        <UButton
          icon="i-lucide-undo-2"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Undo"
          :disabled="!workspace.canUndo(session.id)"
          data-testid="undo"
          @click="workspace.undo(session.id)"
        />
      </UTooltip>
      <UTooltip
        text="Redo"
        :kbds="['meta', 'shift', 'z']"
      >
        <UButton
          icon="i-lucide-redo-2"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Redo"
          :disabled="!workspace.canRedo(session.id)"
          @click="workspace.redo(session.id)"
        />
      </UTooltip>
      <USeparator
        orientation="vertical"
        class="h-5"
      />
      <UDropdownMenu
        :items="templateItems"
        :ui="{ content: 'w-80' }"
      >
        <UButton
          icon="i-lucide-layout-template"
          label="Templates"
          color="neutral"
          variant="ghost"
          size="sm"
          data-testid="templates"
        />
      </UDropdownMenu>
      <UPopover v-if="issues.length">
        <UButton
          :icon="errors ? 'i-lucide-circle-x' : 'i-lucide-triangle-alert'"
          :label="String(issues.length)"
          :color="errors ? 'error' : 'warning'"
          variant="soft"
          size="sm"
          :aria-label="`${issues.length} problems`"
          data-testid="issues"
        />
        <template #content>
          <ul class="max-h-96 w-96 space-y-1 overflow-y-auto p-2">
            <li
              v-for="(issue, i) in issues"
              :key="i"
            >
              <button
                type="button"
                class="flex w-full gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-elevated"
                :disabled="!issue.nodeId"
                @click="issue.nodeId && emit('open', issue.nodeId)"
              >
                <UIcon
                  :name="issue.severity === 'error' ? 'i-lucide-circle-x' : 'i-lucide-triangle-alert'"
                  class="mt-0.5 size-3.5 shrink-0"
                  :class="issue.severity === 'error' ? 'text-error' : 'text-warning'"
                />
                <span>{{ issue.message }}</span>
              </button>
            </li>
          </ul>
        </template>
      </UPopover>
    </div>

    <div class="ms-auto flex min-w-0 items-center gap-2 rounded-lg border border-default bg-default/95 p-1 shadow-sm backdrop-blur">
      <UInput
        v-if="start"
        :model-value="start.input"
        placeholder="Input for the run, as {{input}}"
        icon="i-lucide-play"
        size="sm"
        class="w-40 md:w-64 xl:w-80"
        aria-label="Run input"
        data-testid="run-input"
        @update:model-value="input => workspace.updateNode(session.id, start!.id, { input: String(input) })"
        @keydown.enter.prevent="running || run()"
      />
      <ModelSelect
        :model-value="session.model"
        empty-label="Any loaded model"
        @update:model-value="model => workspace.setModel(session.id, model)"
      />
      <UTooltip
        :text="running ? 'Stop the run' : 'Run the flow from Start'"
        :kbds="['meta', 'enter']"
      >
        <UButton
          v-if="running"
          label="Stop"
          icon="i-lucide-square"
          color="error"
          variant="soft"
          size="sm"
          data-testid="stop-run"
          @click="flowRun.stop(session.id)"
        />
        <UButton
          v-else
          label="Run"
          icon="i-lucide-play"
          size="sm"
          data-testid="run"
          @click="run"
        />
      </UTooltip>
      <UTooltip :text="view.runPanelOpen ? 'Hide the run' : 'Show the run: steps, conversation, variables'">
        <UButton
          :icon="view.runPanelOpen ? 'i-lucide-panel-right-close' : 'i-lucide-panel-right-open'"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Toggle run panel"
          data-testid="toggle-run-panel"
          @click="view.runPanelOpen = !view.runPanelOpen"
        />
      </UTooltip>
      <UTooltip text="Flow settings: system prompt, defaults, step limit">
        <UButton
          icon="i-lucide-settings-2"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Flow settings"
          :disabled="!start"
          @click="start && emit('open', start.id)"
        />
      </UTooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { FLOW_TEMPLATES } from '~/lib/flow/templates'
import type { StartNode } from '~/lib/flow/types'
import { validateFlow } from '~/lib/flow/validate'
import { flowHasContent, type Session } from '~/lib/workspace'
import { useServices } from '~/services/container'

const props = defineProps<{ session: Session }>()
const emit = defineEmits<{ open: [nodeId: string] }>()

const workspace = useWorkspaceStore()
const flowRun = useFlowRunStore()
const view = useFlowViewStore()

const start = computed(() => props.session.flow.nodes.find((node): node is StartNode => node.kind === 'start'))
const running = computed(() => flowRun.isRunning(props.session.id))
const issues = computed(() => validateFlow(props.session.flow))
const errors = computed(() => issues.value.some(issue => issue.severity === 'error'))

async function run() {
  view.runPanelOpen = true
  await flowRun.run(props.session.id)
}

async function replaceWith(template: typeof FLOW_TEMPLATES[number]) {
  if (flowHasContent(props.session.flow)) {
    const confirmed = await useServices().dialogs.confirm({
      title: `Replace this flow with “${template.title}”?`,
      description: 'The current flow is replaced. You can undo this.',
      confirmLabel: 'Replace'
    })
    if (!confirmed) return
  }
  workspace.replaceFlow(props.session.id, template.create())
  view.requestFit(props.session.id)
}

const templateItems = computed<DropdownMenuItem[][]>(() => [
  [{ type: 'label', label: 'New session from a template' }],
  FLOW_TEMPLATES.map(template => ({
    label: template.title,
    description: template.description,
    icon: template.icon,
    onSelect: () => workspace.addSession(template)
  })),
  [{
    label: 'Replace this flow with…',
    icon: 'i-lucide-replace',
    children: FLOW_TEMPLATES.map(template => ({ label: template.title, icon: template.icon, onSelect: () => void replaceWith(template) }))
  }]
])
</script>
