<template>
  <div
    ref="root"
    tabindex="-1"
    class="flow-canvas relative h-full w-full outline-none"
    data-testid="flow-canvas"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <VueFlow
      :id="flowId"
      :nodes="nodes"
      :edges="edges"
      :min-zoom="0.1"
      :max-zoom="2.5"
      :snap-to-grid="true"
      :snap-grid="[8, 8]"
      :delete-key-code="null"
      :multi-selection-key-code="['Control', 'Meta']"
      :zoom-on-double-click="false"
      :connection-radius="28"
      :is-valid-connection="isValidConnection"
      :default-edge-options="{ type: 'flow' }"
      :elevate-edges-on-select="true"
      :node-drag-threshold="3"
      :pan-on-scroll="false"
      @node-click="onNodeClick"
      @node-double-click="onNodeDoubleClick"
      @node-drag-stop="onDragStop"
      @selection-drag-stop="onDragStop"
      @connect="onConnect"
      @nodes-initialized="onNodesInitialized"
      @move-end="({ flowTransform }) => view.saveViewport(sessionId, flowTransform)"
      @pane-click="emit('paneClick')"
    >
      <template #node-card="{ id, selected }">
        <UContextMenu :items="menuFor(id)">
          <FlowNodeCard
            :id="id"
            :selected="selected"
          />
        </UContextMenu>
      </template>
      <template #node-container="{ id, selected }">
        <UContextMenu :items="menuFor(id)">
          <FlowGroupNode
            :id="id"
            :selected="selected"
            class="h-full w-full"
          />
        </UContextMenu>
      </template>
      <template #edge-flow="edgeProps">
        <FlowEdge v-bind="edgeProps" />
      </template>

      <Background
        :gap="16"
        :size="1.2"
        pattern-color="var(--ui-border-accented)"
      />
      <MiniMap
        pannable
        zoomable
        :node-color="minimapColor"
        :node-stroke-width="0"
        mask-color="color-mix(in oklab, var(--ui-bg-elevated) 70%, transparent)"
        class="hidden md:block"
      />
      <Controls
        position="bottom-left"
        :show-interactive="false"
      />
      <slot />
    </VueFlow>
  </div>
</template>

<script setup lang="ts">
import type { ContextMenuItem } from '@nuxt/ui'
import { useEventListener } from '@vueuse/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MarkerType, useVueFlow, VueFlow, type Connection, type Edge, type GraphNode, type Node, type NodeDragEvent, type NodeMouseEvent } from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'
import { absolutePosition, ancestors, CARD_SIZE, canConnect, CONTEXT_HANDLE, FLOW_INPUT, groupAt, isContextEdge } from '~/lib/flow/graph'
import type { FlowNode, NodeKind } from '~/lib/flow/types'
import { validateFlow, type FlowIssue } from '~/lib/flow/validate'
import type { Session } from '~/lib/workspace'
import { detailForZoom, FLOW_CONTEXT, flowIdFor, prefersReducedMotion, type FlowEdgeData } from '~/utils/flowContext'
import { NODE_META, NODE_MIME } from '~/utils/nodes'

const props = defineProps<{ session: Session }>()
const emit = defineEmits<{
  open: [nodeId: string]
  paneClick: []
}>()

const workspace = useWorkspaceStore()
const flowRun = useFlowRunStore()
const view = useFlowViewStore()

const sessionId = props.session.id
const flowId = flowIdFor(sessionId)
const root = useTemplateRef('root')
const vueFlow = useVueFlow(flowId)

const flow = computed(() => props.session.flow)

/** Groups before their contents (deepest last), so they are drawn beneath them. */
const ordered = computed(() => {
  const depth = (node: FlowNode) => ancestors(flow.value, node).length
  return [...flow.value.nodes].sort((a, b) => (a.kind === 'group' ? 0 : 1) - (b.kind === 'group' ? 0 : 1) || depth(a) - depth(b))
})

// Only what Vue Flow needs; the cards read everything else from the store, so typing in a
// segment doesn't rebuild the canvas.
const nodes = computed<Node[]>(() => ordered.value.map(node => ({
  id: node.id,
  type: node.kind === 'group' ? 'container' : 'card',
  position: { ...node.position },
  parentNode: node.parentId ?? undefined,
  ...(node.kind === 'group' && { style: { width: `${node.width}px`, height: `${node.height}px` } })
})))

const runStates = computed(() => flowRun.nodeStates(sessionId))

const steps = computed(() => flowRun.runs[sessionId]?.steps ?? [])

/** How many times the latest run recalled each memory and knowledge node. */
const recalls = computed(() => {
  const counts = new Map<string, number>()
  for (const step of steps.value) {
    for (const item of step.recalled ?? []) if (item.text) counts.set(item.nodeId, (counts.get(item.nodeId) ?? 0) + 1)
  }
  return counts
})

/** Edges the latest run went along, and the context edges memory and knowledge were recalled through. */
const taken = computed(() => {
  const used = new Set(steps.value.flatMap(step => step.via ?? []))
  for (const step of steps.value) {
    const recalled = new Set((step.recalled ?? []).filter(item => item.text).map(item => item.nodeId))
    const segment = recalled.size ? workspace.findNode(sessionId, step.nodeId) : undefined
    if (!segment) continue
    const targets = new Set([segment.id, ...ancestors(flow.value, segment).map(group => group.id)])
    for (const edge of flow.value.edges) {
      if (isContextEdge(edge) && recalled.has(edge.source) && targets.has(edge.target)) used.add(edge.id)
    }
  }
  return used
})

const removeEdge = (id: string) => workspace.removeEdges(sessionId, [id])

const edges = computed<Edge<FlowEdgeData>[]>(() => flow.value.edges.map((edge) => {
  const context = isContextEdge(edge)
  return {
    id: edge.id,
    type: 'flow',
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target,
    targetHandle: context ? CONTEXT_HANDLE : FLOW_INPUT,
    ...(!context && { markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: taken.value.has(edge.id) ? 'var(--ui-primary)' : 'var(--ui-border-accented)' } }),
    data: { context, taken: taken.value.has(edge.id), remove: removeEdge }
  }
}))

const issues = computed(() => {
  const byNode = new Map<string, FlowIssue[]>()
  for (const issue of validateFlow(flow.value)) {
    if (issue.nodeId) byNode.set(issue.nodeId, [...byNode.get(issue.nodeId) ?? [], issue])
  }
  return byNode
})

const detail = computed(() => detailForZoom(vueFlow.viewport.value.zoom))

function open(nodeId: string) {
  emit('open', nodeId)
}

function zoomToGroup(groupId: string) {
  void vueFlow.fitView({ nodes: [groupId], padding: 0.15, duration: prefersReducedMotion() ? 0 : 400 })
}

provide(FLOW_CONTEXT, { sessionId, detail, runStates, recalls, issues, open, zoomToGroup })

function isValidConnection(connection: Connection) {
  return canConnect(flow.value, { ...connection, sourceHandle: connection.sourceHandle ?? 'out' })
}

function onConnect(connection: Connection) {
  workspace.connect(sessionId, { ...connection, sourceHandle: connection.sourceHandle ?? 'out' })
}

function onNodeClick({ node, event }: NodeMouseEvent) {
  const pointer = event as MouseEvent
  // Modifier clicks add to the selection instead.
  if (pointer.shiftKey || pointer.ctrlKey || pointer.metaKey) return
  if ((pointer.target as Element | null)?.closest('.vue-flow__handle, button, .vue-flow__resize-control')) return
  if (node.type === 'container') zoomToGroup(node.id)
  else open(node.id)
}

function onNodeDoubleClick({ node }: NodeMouseEvent) {
  if (node.type === 'container') open(node.id)
}

function onDragStop({ nodes: dragged }: NodeDragEvent) {
  workspace.moveNodes(sessionId, dragged.map(node => ({ id: node.id, position: node.position })))
}

let initialised = false
function onNodesInitialized() {
  if (initialised) return
  initialised = true
  const saved = view.viewports[sessionId]
  if (saved) void vueFlow.setViewport(saved)
  else void vueFlow.fitView({ padding: 0.2, maxZoom: 1 })
}

/** Canvas point under a screen point. */
function toFlow(clientX: number, clientY: number) {
  return vueFlow.screenToFlowCoordinate({ x: clientX, y: clientY })
}

/** Adds a node centred on a canvas point, inside whichever group is there. */
function addAt(kind: NodeKind, point: { x: number, y: number }) {
  const size = kind === 'group' ? { width: 560, height: 320 } : CARD_SIZE
  const topLeft = { x: point.x - size.width / 2, y: point.y - Math.min(size.height, CARD_SIZE.height) / 2 }
  const parent = kind === 'group' ? null : groupAt(flow.value, point)
  const origin = parent ? absolutePosition(flow.value, parent) : { x: 0, y: 0 }
  const node = workspace.addNode(sessionId, kind, { x: topLeft.x - origin.x, y: topLeft.y - origin.y }, parent?.id ?? null)
  if (node) {
    vueFlow.removeSelectedNodes(vueFlow.getSelectedNodes.value)
    nextTick(() => vueFlow.addSelectedNodes([vueFlow.findNode(node.id)!].filter(Boolean)))
  }
  return node
}

/** Whether a card centred on `point` would cover another card. */
function occupied(point: { x: number, y: number }) {
  const gap = 16
  return flow.value.nodes.some((node) => {
    if (node.kind === 'group') return false
    const { x, y } = absolutePosition(flow.value, node)
    return Math.abs(x + CARD_SIZE.width / 2 - point.x) < CARD_SIZE.width + gap
      && Math.abs(y + CARD_SIZE.height / 2 - point.y) < CARD_SIZE.height + gap
  })
}

/** Adds a node in the middle of what is on screen, moved down past any cards already there. */
function addInView(kind: NodeKind) {
  const rect = root.value!.getBoundingClientRect()
  const point = toFlow(rect.left + rect.width / 2, rect.top + rect.height / 2)
  for (let tries = 0; kind !== 'group' && tries < 12 && occupied(point); tries++) point.y += CARD_SIZE.height + 24
  return addAt(kind, point)
}

function onDragOver(event: DragEvent) {
  if (!event.dataTransfer?.types.includes(NODE_MIME)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
}

function onDrop(event: DragEvent) {
  const kind = event.dataTransfer?.getData(NODE_MIME) as NodeKind | undefined
  if (!kind || !(kind in NODE_META)) return
  event.preventDefault()
  addAt(kind, toFlow(event.clientX, event.clientY))
}

const selectedIds = () => vueFlow.getSelectedNodes.value.map((node: GraphNode) => node.id)

function removeSelected() {
  const nodeIds = selectedIds()
  const edgeIds = vueFlow.getSelectedEdges.value.map(edge => edge.id)
  if (nodeIds.length) workspace.removeNodes(sessionId, nodeIds)
  if (edgeIds.length) workspace.removeEdges(sessionId, edgeIds)
}

function duplicateSelected() {
  const copies = workspace.duplicateNodes(sessionId, selectedIds())
  if (!copies.length) return
  vueFlow.removeSelectedNodes(vueFlow.getSelectedNodes.value)
  nextTick(() => vueFlow.addSelectedNodes(copies.map(c => vueFlow.findNode(c.id)!).filter(Boolean)))
}

function groupSelected() {
  const ids = selectedIds()
  if (ids.length) workspace.groupNodes(sessionId, ids)
}

function menuFor(id: string): ContextMenuItem[][] {
  const node = workspace.findNode(sessionId, id)
  if (!node) return []
  const target = () => (selectedIds().includes(id) ? selectedIds() : [id])
  // A flow has exactly one Start: it can't be copied or deleted.
  const start = node.kind === 'start'
  return [
    [
      { label: node.kind === 'group' ? 'Group settings' : 'Open', icon: 'i-lucide-maximize', onSelect: () => open(id) },
      ...(node.kind === 'group' ? [{ label: 'Zoom to fit', icon: 'i-lucide-scan-search', onSelect: () => zoomToGroup(id) }] : [])
    ],
    [
      ...(start ? [] : [{ label: 'Duplicate', icon: 'i-lucide-copy', kbds: ['meta', 'd'], onSelect: () => workspace.duplicateNodes(sessionId, target()) }]),
      { label: 'Put in a group', icon: 'i-lucide-group', kbds: ['meta', 'g'], onSelect: () => workspace.groupNodes(sessionId, target()) },
      ...(node.kind === 'group' ? [{ label: 'Ungroup', icon: 'i-lucide-ungroup', onSelect: () => workspace.ungroup(sessionId, id) }] : []),
      ...(node.parentId ? [{ label: 'Move out of group', icon: 'i-lucide-arrow-left', onSelect: () => workspace.moveOutOfGroup(sessionId, id) }] : [])
    ],
    start
      ? []
      : [{ label: node.kind === 'group' ? 'Delete with contents' : 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, kbds: ['delete'], onSelect: () => workspace.removeNodes(sessionId, target()) }]
  ].filter(group => group.length)
}

const isTyping = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null
  return !!target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]')
}

// Canvas shortcuts, only while the canvas (not a field or the zoomed-in editor) has focus.
useEventListener(root, 'keydown', (event: KeyboardEvent) => {
  if (isTyping(event) || view.focusedId(sessionId)) return
  const meta = event.ctrlKey || event.metaKey
  if (event.key === 'Delete' || event.key === 'Backspace') removeSelected()
  else if (meta && event.key.toLowerCase() === 'd') duplicateSelected()
  else if (meta && event.key.toLowerCase() === 'g') groupSelected()
  else if (meta && event.key.toLowerCase() === 'a') vueFlow.addSelectedNodes(vueFlow.getNodes.value)
  else return
  event.preventDefault()
})

function minimapColor(node: GraphNode) {
  const kind = workspace.findNode(sessionId, node.id)?.kind
  return kind ? NODE_META[kind].swatch : 'var(--ui-border)'
}

// Centre on a node when asked, e.g. from the run panel.
watch(() => view.reveal, (request) => {
  if (!request || request.sessionId !== sessionId) return
  const node = vueFlow.findNode(request.nodeId)
  if (!node) return
  const { width, height } = node.dimensions
  void vueFlow.setCenter(node.computedPosition.x + width / 2, node.computedPosition.y + height / 2, {
    zoom: Math.max(vueFlow.viewport.value.zoom, 0.9),
    duration: prefersReducedMotion() ? 0 : 400
  })
  vueFlow.removeSelectedNodes(vueFlow.getSelectedNodes.value)
  vueFlow.addSelectedNodes([node])
})

watch(() => view.fit, (request) => {
  if (request?.sessionId !== sessionId) return
  // New nodes are measured on the next frames; fitting needs their sizes.
  setTimeout(() => void vueFlow.fitView({ padding: 0.2, maxZoom: 1, duration: prefersReducedMotion() ? 0 : 300 }), 80)
})

defineExpose({ addInView, vueFlow })
</script>
