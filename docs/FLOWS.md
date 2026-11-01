# Flows

Each session is a **flow**: a graph that decides how the conversation with the model is built and in what order things happen. A run starts at **Start** and moves one node at a time, like a state machine. Each node does its work, then leaves by one of its outputs, and the edge on that output decides what runs next. The run ends at an **End** node, at an output with nothing connected, or when you stop it.

Click a node on the canvas to zoom into it and edit it at full size. A segment opens as the classic editor: system, user and assistant blocks, snippet trays, and Send. Press Escape or **← Flow** to zoom back out. Clicking a group zooms the canvas to fit that group; its ⚙ button opens the group's settings.

## Nodes

| Node | What it does | Outputs |
| --- | --- | --- |
| **Start** | Where a run begins. Holds the run's input (`{{input}}`) and the flow-wide settings. | next |
| **Segment** | Sends messages to the model and records its reply. | next, *On error* |
| **Condition** | Takes the first case whose expression is true. | one per case, *Else* |
| **Loop** | Repeats a path a number of times, once per item in a list, or while an expression is true (with a safety limit). Connect the end of the path back to the loop. | *Each time*, *Done* |
| **Set variables** | Sets `vars.<name>` from expressions, e.g. a state machine's state, counters, or lists you build up. | next |
| **Ask user** | Pauses and asks whoever is running the flow (human in the loop). Declining stops the run. | next |
| **End** | Finishes the run with a result (`{{last}}` by default). | none |
| **Memory** | Not a step. Injected into the segments it is connected to, or into every segment of the group it sits in. | context |
| **Knowledge** | Not a step. Documents to retrieve passages from (RAG), injected like memory. | context |
| **Group** | A container. Its settings apply to every segment inside it, including nested groups. | none |
| **Note** | A comment on the canvas. Never run. | none |

Each output leads to one place, so every transition is unambiguous. Connecting an output again replaces its edge. Memory and knowledge use the diamond handles: drag from a context node's top handle to a segment's or group's bottom handle.

### Segments

- **Messages** are templates, filled in when the run reaches the segment. Empty messages and snippet trays are never sent.
- **Ask the model for a reply**: switch this off to only add the messages to the conversation, for example few-shot examples or instructions for later segments.
- **Model, temperature, max tokens**: each segment can pick its own model, or inherit one from its group or the flow. A small, fast model can classify while a larger one writes the answer.
- **Sees**: the whole conversation, the last *n* messages, or nothing (isolated: only its own messages).
- **Setup only**: the segment runs, but neither its messages nor its reply stay in the conversation. Its output is still available to later steps as `{{nodes.<key>.output}}`. Use it for planning, query rewriting, classification and critique steps.
- **Structured output**: a JSON Schema the reply must match. LM Studio constrains generation to it where the model supports that, and the schema is also described in the system prompt. Replies are parsed (a ```` ```json ```` fence or surrounding prose is fine) and validated. If a reply doesn't match, the model is shown the problems and asked again, up to *Retries* times. The parsed value is the output, so conditions can read fields, e.g. `nodes.classify.output.category`.
- **Save as variable** also stores the output in `vars.<name>`.
- **Write to memory** appends the output to store memories.
- **On error**: if something is connected to it, a failure (for example retries exhausted) goes down that path with `{{error}}` set, instead of stopping the run.

### Groups

A group's settings apply to everything inside it. Nested groups override their outer groups, and a segment's own settings override them all.

- **System prompt**: added after the flow's and outer groups' system prompts, before the segment's own.
- **Model, temperature, max tokens, Sees, Setup only**: defaults for the segments inside.
- **Memory and knowledge**: any memory or knowledge node placed inside the group, or connected to it, is injected into every segment inside.

Drag a node onto a group to put it inside, and drag it out to take it out. Select several nodes and press Ctrl/⌘ + G to wrap them in a new group.

### Memory

| Kind | Injects |
| --- | --- |
| **Notes** | Fixed text (templated), such as facts about the user, a persona, or a style guide. |
| **Recent messages** | The last *n* messages of the conversation. Useful for isolated segments, such as a summariser. |
| **Store** | Entries that segments write during runs. Injects the most recent entries or the most relevant ones (BM25 against a query). With *Keep entries between runs* on, entries are saved in the workspace file, so they're encrypted with it, and they're there next time: long-term memory. |

Memory goes into the system prompt under a `## <title>` heading, or as a message just before the segment's own.

### Knowledge (RAG)

- **Documents**: paste text, or import text, Markdown, CSV, JSON or HTML files. Documents are stored in the workspace file.
- **Chunks**: documents are split at paragraphs, then lines, sentences and words, into chunks of about *Size* characters, with *Overlap* characters repeated between neighbours.
- **Search**:
  - *Keyword*: BM25. Works offline with no extra model.
  - *Semantic*: cosine similarity of embeddings from an LM Studio embedding model. Vectors are cached, so unchanged documents aren't embedded again.
  - *Hybrid*: both rankings, combined with reciprocal rank fusion.
- **Passages**: the top *k* above *Min score*. *Prefer varied passages* uses maximal marginal relevance to skip near-duplicates.
- **Search for**: a template, `{{input}}` by default. Better retrieval usually comes from a setup segment that rewrites the question first: `{{nodes.rewrite.output.query}}`.
- The passages are numbered (`[1] Source (part 2)`) under the instructions, so the model can cite them.
- **Test search** in the editor shows what a query retrieves with the current settings.

## How a segment's prompt is built

1. **One system message**, in this order:
   - the flow's system prompt
   - the groups' system prompts, outermost first
   - memory and knowledge placed in the system prompt
   - the segment's own system blocks
   - the schema instructions
2. **The conversation so far**, as much as *Sees* allows.
3. **Memory and knowledge placed as a message.**
4. **The segment's own user and assistant messages.**

Consecutive messages from the same role are merged, since many chat templates require roles to alternate. Exactly what was sent is shown in the run panel under each step.

## Placeholders and expressions

Write `{{ … }}` in any message or template. Inside, use an **expression**:

| Name | Value |
| --- | --- |
| `input` | The run's input. |
| `last` | Output of the previous step. |
| `vars.<name>` | Variables from Set, Ask and "Save as". |
| `nodes.<key>.output` / `.text` / `.visits` / `.error` | Any node that has run. The key is shown on each card and can be renamed. |
| `loop.index` / `loop.iteration` / `loop.item` / `loop.total` | The loop being run. |
| `memory.<key>` | A memory's current text. |
| `error` | The latest error, on an *On error* path. |

Expressions support:

- paths: `a.b`, `a[0]`, `a["key"]`
- literals: numbers, strings, `true`, `false`, `null`, `[lists]`, `{ objects }`
- operators: `== != === !== < <= > >= && || ! and or not in ?? + - * / %` and `cond ? a : b`
- functions: `len lower upper trim contains startsWith endsWith matches replace split join number string bool json parse default exists type keys values first last slice append merge range round floor ceil abs min max`

They are interpreted, not run as JavaScript (the CSP forbids `eval`, and flows can come from files). They can only read the values above and call the functions listed. Missing values read as `null` rather than failing. `==` compares numbers with numeric strings (`1 == "1"`), and empty strings, lists and objects count as false.

A template that is a single placeholder, such as `{{nodes.extract.output}}` in End's result, keeps its value's type (for example JSON).

The **Variables** button in a node's editor lists what's available. Drag an item into a message, or click it to copy.

## Running

- **Run** (Ctrl/⌘ + Enter on the canvas) runs from Start with the input in the toolbar. Inside a zoomed-in segment, Ctrl/⌘ + Enter is that segment's Send, which tries it on its own like the classic editor.
- The flow is checked first. Errors (such as an invalid expression, a broken schema, no Start, or duplicate keys) stop the run. Warnings (such as an unreachable node, or a cycle with no condition, loop or question) don't. Problems show on the cards and in the toolbar.
- A run works on a copy of the flow, so editing during a run doesn't change it halfway.
- **Step limit** (flow settings, default 200): a run stops after this many steps, so a loop that never ends can't run forever.
- The **run panel** shows:
  - every step: what was sent, the streamed reply, reasoning, retrieved passages and scores, attempts, timing and tokens
  - the conversation as it built up
  - the variables
  - the output
- The canvas shows each node's status, how many times it ran, the live text of the running segment, and the path the run took.

## Editing the canvas

| Action | How |
| --- | --- |
| Add a node | Click it in the palette (left), or drag it onto the canvas or into a group |
| Open a node | Click it |
| Select | Shift-click, or Shift-drag a box |
| Move | Drag. Dropping onto a group puts the node inside it |
| Delete selection | Delete / Backspace |
| Duplicate / group selection | Ctrl/⌘ + D / Ctrl/⌘ + G |
| Undo / redo | Ctrl/⌘ + Z / Ctrl/⌘ + Shift + Z (text fields keep their own undo) |
| More actions | Right-click a node |
| Remove a connection | Select it and click its ✕ |

Cards show more detail as you zoom in: just the icon and title when zoomed out, a summary at normal zoom, and the full messages close up.

## Templates

Start a new session from a template (the ⌄ next to + in the tabs, or **Templates** on the canvas):

| Template | Pattern |
| --- | --- |
| **Conversation** | One segment that replies to `{{input}}`. |
| **Chatbot with memory** | A chat loop: Ask → condition (*bye* ends it) → reply → a setup-only segment that writes facts to a store memory, which the reply reads. |
| **Knowledge Q&A (RAG)** | Rewrite the question into a search query (setup only, schema) → answer from retrieved passages with citations. |
| **Router** | Classify with a schema-constrained enum → condition → specialised segments in a group with a shared system prompt. |
| **Draft, critique, revise** | Reflection: a loop where an editor (schema score and feedback) critiques against a style-guide memory, and a reviser rewrites until the score is good enough. |
| **Structured extraction** | Extract JSON matching a schema, compute a value from it, and return the merged result. |

## Under the hood

The engine is pure TypeScript with no Vue or I/O. LM Studio, embeddings and the Ask dialog are passed in, so it is fully unit-tested.

| File | What it holds |
| --- | --- |
| `app/lib/flow/types.ts` | The data model and node defaults |
| `app/lib/flow/graph.ts` | Connection rules, nesting, inherited settings, context sources, copying and repair |
| `app/lib/flow/engine.ts` | The interpreter |
| `app/lib/flow/expression.ts`, `template.ts` | The expression language and placeholders |
| `app/lib/flow/json-schema.ts` | Schema validation (interpreted, CSP-safe) and JSON extraction |
| `app/lib/flow/retrieval.ts` | Chunking, BM25, cosine similarity, rank fusion, MMR |
| `app/lib/flow/validate.ts` | The checks shown on the canvas |
| `app/lib/flow/templates.ts` | The starter flows |
| `app/stores/flowRun.ts` | Wires the engine to the services and the run panel |
| `app/stores/workspace.ts` | Flow editing and the undo history |
