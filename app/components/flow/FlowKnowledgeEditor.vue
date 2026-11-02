<template>
  <div class="flex h-full min-h-0">
    <div class="min-w-0 flex-1 space-y-6 overflow-y-auto p-6">
      <FlowSection
        title="Documents"
        icon="i-lucide-library"
        :description="`${node.documents.length} document${node.documents.length === 1 ? '' : 's'}, ${chunks.length} chunk${chunks.length === 1 ? '' : 's'}. Saved in the workspace file, so they're encrypted with it.`"
      >
        <div class="flex flex-wrap gap-2">
          <UButton
            label="Import files…"
            icon="i-lucide-file-up"
            size="sm"
            :loading="importing"
            data-testid="import-documents"
            @click="importFiles"
          />
          <UButton
            label="Paste text"
            icon="i-lucide-file-plus-2"
            color="neutral"
            variant="outline"
            size="sm"
            data-testid="add-document"
            @click="addDocument"
          />
          <span class="self-center text-xs text-dimmed">Text, Markdown, CSV, JSON, HTML…</span>
        </div>

        <div
          v-for="doc in node.documents"
          :key="doc.id"
          class="rounded-lg border border-default bg-default"
          data-testid="knowledge-document"
        >
          <div class="flex items-center gap-2 px-3 py-2">
            <UIcon
              name="i-lucide-file-text"
              class="size-4 shrink-0 text-muted"
            />
            <UInput
              :model-value="doc.name"
              variant="ghost"
              size="sm"
              class="min-w-0 flex-1"
              aria-label="Document name"
              @update:model-value="name => patchDocument(doc.id, { name: String(name) })"
            />
            <span class="shrink-0 text-xs text-dimmed tabular-nums">{{ doc.text.length.toLocaleString() }} chars · {{ chunksPerDoc.get(doc.id) ?? 0 }} chunks</span>
            <UButton
              :icon="expanded === doc.id ? 'i-lucide-chevron-down' : 'i-lucide-pencil'"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="expanded === doc.id ? 'Collapse' : 'Edit text'"
              @click="expanded = expanded === doc.id ? null : doc.id"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              aria-label="Remove document"
              @click="update({ documents: node.documents.filter(d => d.id !== doc.id) })"
            />
          </div>
          <div
            v-if="expanded === doc.id"
            class="border-t border-default p-2"
          >
            <UTextarea
              :model-value="doc.text"
              :rows="10"
              autoresize
              :maxrows="30"
              class="w-full"
              :ui="{ base: 'text-xs' }"
              placeholder="Paste or write the document…"
              @update:model-value="text => patchDocument(doc.id, { text: String(text) })"
            />
          </div>
        </div>
      </FlowSection>

      <FlowSection
        title="Test search"
        icon="i-lucide-text-search"
        description="See what a query retrieves with the settings on the right."
      >
        <div class="flex gap-2">
          <UInput
            v-model="testQuery"
            placeholder="e.g. how do I reset my password?"
            class="flex-1"
            @keydown.enter.prevent="test"
          />
          <UButton
            label="Search"
            icon="i-lucide-search"
            color="neutral"
            variant="outline"
            :loading="testing"
            :disabled="!testQuery.trim()"
            @click="test"
          />
        </div>
        <p
          v-if="testError"
          class="text-xs text-error"
        >
          {{ testError }}
        </p>
        <ol
          v-if="testHits"
          class="space-y-1.5"
        >
          <li
            v-for="(hit, i) in testHits"
            :key="hit.id"
            class="rounded border border-default p-2 text-xs"
          >
            <p class="mb-0.5 flex justify-between gap-2 font-medium">
              <span class="truncate">[{{ i + 1 }}] {{ hit.source }}{{ hit.index ? ` (part ${hit.index + 1})` : '' }}</span>
              <span class="shrink-0 text-dimmed tabular-nums">{{ hit.score.toFixed(2) }}</span>
            </p>
            <p class="line-clamp-5 whitespace-pre-wrap text-muted">
              {{ hit.text }}
            </p>
          </li>
          <li
            v-if="!testHits.length"
            class="text-xs text-dimmed"
          >
            Nothing matched.
          </li>
        </ol>
      </FlowSection>
    </div>

    <aside class="w-80 shrink-0 space-y-6 overflow-y-auto border-l border-default bg-elevated/30 p-4 xl:w-96">
      <FlowSection
        title="Search"
        icon="i-lucide-search"
      >
        <UFormField
          label="Method"
          :help="SEARCH_HELP[node.search]"
        >
          <USelect
            :model-value="node.search"
            :items="[
              { label: 'Keyword (BM25)', value: 'keyword' },
              { label: 'Semantic (embeddings)', value: 'semantic' },
              { label: 'Hybrid (both, fused)', value: 'hybrid' }
            ]"
            class="w-full"
            @update:model-value="search => update({ search: search as SearchMode })"
          />
        </UFormField>
        <UFormField
          v-if="node.search !== 'keyword'"
          label="Embedding model"
          :error="node.embeddingModel ? undefined : 'Choose an embedding model loaded in LM Studio.'"
        >
          <ModelSelect
            :model-value="node.embeddingModel"
            kind="embedding"
            empty-label="None"
            class="w-full"
            @update:model-value="embeddingModel => update({ embeddingModel })"
          />
        </UFormField>
        <div class="grid grid-cols-2 gap-2">
          <UFormField label="Passages">
            <UInput
              type="number"
              :min="1"
              :max="50"
              :model-value="node.topK"
              class="w-full"
              @update:model-value="value => update({ topK: clamp(value, 1, 50) })"
            />
          </UFormField>
          <UFormField
            label="Min score"
            help="0–1"
          >
            <UInput
              type="number"
              :min="0"
              :max="1"
              :step="0.05"
              :model-value="node.minScore"
              class="w-full"
              @update:model-value="value => update({ minScore: Math.min(1, Math.max(0, Number(value) || 0)) })"
            />
          </UFormField>
        </div>
        <USwitch
          :model-value="node.diversify"
          label="Prefer varied passages"
          description="Skips near-duplicates in favour of passages that add something new (MMR)."
          @update:model-value="diversify => update({ diversify })"
        />
        <UFormField
          label="Search for"
          help="Templated. Rewrite the question in a setup segment first for better results, e.g. {{nodes.rewrite.output.query}}."
        >
          <FlowTemplateInput
            :model-value="node.query"
            :rows="1"
            mono
            @update:model-value="query => update({ query })"
          />
        </UFormField>
      </FlowSection>

      <FlowSection
        title="Chunks"
        icon="i-lucide-layers"
        description="Documents are split at paragraphs, then sentences, into chunks of about this size, with some text repeated between neighbours."
      >
        <div class="grid grid-cols-2 gap-2">
          <UFormField label="Size (chars)">
            <UInput
              type="number"
              :min="100"
              :step="100"
              :model-value="node.chunkSize"
              class="w-full"
              @update:model-value="value => update({ chunkSize: clamp(value, 100, 20_000) })"
            />
          </UFormField>
          <UFormField label="Overlap">
            <UInput
              type="number"
              :min="0"
              :step="20"
              :model-value="node.chunkOverlap"
              class="w-full"
              @update:model-value="value => update({ chunkOverlap: clamp(value, 0, Math.floor(node.chunkSize / 2)) })"
            />
          </UFormField>
        </div>
      </FlowSection>

      <FlowSection
        title="In the prompt"
        icon="i-lucide-route"
      >
        <UFormField label="Instructions above the passages">
          <FlowTemplateInput
            :model-value="node.instructions"
            :rows="3"
            @update:model-value="instructions => update({ instructions })"
          />
        </UFormField>
        <UFormField label="Placement">
          <USelect
            :model-value="node.placement"
            :items="[
              { label: 'In the system prompt', value: 'system' },
              { label: 'With the segment’s message', value: 'message' }
            ]"
            class="w-full"
            @update:model-value="placement => update({ placement: placement as Placement })"
          />
        </UFormField>
      </FlowSection>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { createId } from '~/lib/blocks'
import { buildChunks, searchChunks, type RetrievalHit } from '~/lib/flow/retrieval'
import type { KnowledgeDocument, KnowledgeNode, Placement, SearchMode } from '~/lib/flow/types'
import { errorMessage, useServices } from '~/services/container'

const props = defineProps<{
  sessionId: string
  node: KnowledgeNode
}>()

const workspace = useWorkspaceStore()
const flowRun = useFlowRunStore()

const expanded = ref<string | null>(null)
const importing = ref(false)
const testQuery = ref('')
const testing = ref(false)
const testHits = ref<RetrievalHit[] | null>(null)
const testError = ref<string | null>(null)

const SEARCH_HELP: Record<SearchMode, string> = {
  keyword: 'Matches words. Works offline with no extra model.',
  semantic: 'Matches meaning, using an embedding model in LM Studio.',
  hybrid: 'Both, combined with reciprocal rank fusion. Usually the best.'
}

const update = (patch: Partial<KnowledgeNode>) => workspace.updateNode(props.sessionId, props.node.id, patch)

const patchDocument = (id: string, patch: Partial<KnowledgeDocument>) =>
  update({ documents: props.node.documents.map(doc => doc.id === id ? { ...doc, ...patch } : doc) })

const clamp = (value: unknown, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(value) || min)))

const chunks = computed(() => buildChunks(props.node.documents, props.node.chunkSize, props.node.chunkOverlap))
const chunksPerDoc = computed(() => {
  const counts = new Map<string, number>()
  for (const chunk of chunks.value) counts.set(chunk.documentId, (counts.get(chunk.documentId) ?? 0) + 1)
  return counts
})

function addDocument() {
  const doc = { id: createId(), name: `Document ${props.node.documents.length + 1}`, text: '' }
  update({ documents: [...props.node.documents, doc] })
  expanded.value = doc.id
}

async function importFiles() {
  const { files, dialogs } = useServices()
  importing.value = true
  try {
    const picked = await files.pickTextFiles()
    if (!picked.length) return
    update({ documents: [...props.node.documents, ...picked.map(file => ({ id: createId(), name: file.name, text: file.text }))] })
    dialogs.notify({ title: `Imported ${picked.length} document${picked.length === 1 ? '' : 's'}`, color: 'success' })
  } catch (error) {
    dialogs.notify({ title: 'Could not import', description: errorMessage(error), color: 'error' })
  } finally {
    importing.value = false
  }
}

async function test() {
  if (!testQuery.value.trim()) return
  testing.value = true
  testError.value = null
  try {
    const model = props.node.embeddingModel.trim()
    if (props.node.search !== 'keyword' && !model) throw new Error('Choose an embedding model first.')
    testHits.value = await searchChunks(chunks.value, testQuery.value, {
      mode: props.node.search,
      topK: props.node.topK,
      minScore: props.node.minScore,
      diversify: props.node.diversify,
      // Shares the vectors runs use, so testing again or running afterwards doesn't embed the documents again.
      embed: texts => flowRun.embed(model, texts)
    })
  } catch (error) {
    testHits.value = null
    testError.value = errorMessage(error)
  } finally {
    testing.value = false
  }
}
</script>
