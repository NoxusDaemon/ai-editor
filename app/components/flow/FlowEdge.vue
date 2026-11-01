<template>
  <BaseEdge
    :id="id"
    :path="path[0]"
    :marker-end="context ? undefined : markerEnd"
    :interaction-width="24"
    class="flow-edge"
    :class="{ 'flow-edge--context': context, 'flow-edge--taken': data?.taken, 'flow-edge--selected': selected }"
  />
  <EdgeLabelRenderer>
    <div
      class="nodrag nopan pointer-events-auto absolute"
      :style="{ transform: `translate(-50%, -50%) translate(${path[1]}px, ${path[2]}px)` }"
    >
      <UButton
        v-if="selected"
        icon="i-lucide-x"
        color="neutral"
        variant="solid"
        size="xs"
        class="rounded-full shadow"
        aria-label="Remove connection"
        data-testid="remove-edge"
        @click.stop="data?.remove(id)"
      />
    </div>
  </EdgeLabelRenderer>
</template>

<script setup lang="ts">
import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, type EdgeProps } from '@vue-flow/core'
import type { FlowEdgeData } from '~/utils/flowContext'

const props = defineProps<EdgeProps<FlowEdgeData>>()

const context = computed(() => props.data?.context ?? false)

const path = computed(() => {
  const geometry = {
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition
  }
  // Loops back to an earlier node read better as stepped lines than as curves through other nodes.
  return !context.value && props.targetX < props.sourceX
    ? getSmoothStepPath({ ...geometry, borderRadius: 16, offset: 28 })
    : getBezierPath(geometry)
})
</script>
