# AI Editor

A desktop editor for designing agentic conversations with local models in [LM Studio](https://lmstudio.ai). Lay out a conversation as a flow chart: segments that talk to the model, conditions, loops, parallel branches, variables, memory, retrieval (RAG) and questions for the user, with containers that share settings. Zoom into any segment to edit its system, user and assistant blocks as a classic prompt editor. Save the whole workspace as JSON or as a password-encrypted file.

Built with Nuxt 4, Nuxt UI 4, Pinia, Vue Flow and Tauri 2. See [docs/FLOWS.md](docs/FLOWS.md) for the full guide.

## Features

- **Flow canvas** – each session is a graph that a run walks from Start, like a state machine. Pan, zoom and a minimap. Cards show more detail as you zoom in. Problems with the flow show on the cards before you run it. Undo and redo cover every edit (flows with very large documents keep fewer undo steps).
- **Zoom in to edit** – click a node and the canvas zooms into it, opening its editor at full size. Escape zooms back out.
- **Segments** – messages for the model, templated with `{{placeholders}}`.
  - Each segment can use its own model, temperature and token limit, or inherit them from its group or the flow.
  - Choose how much of the conversation it sees: all of it, the last few messages, or none.
  - **Setup only** segments run but leave nothing in the conversation; later steps read their output.
  - **Structured output**: a JSON Schema the reply must match, constrained in LM Studio and validated, with automatic retries that show the model what was wrong.
  - An **On error** path for when a segment fails.
- **Logic**
  - **Conditions**: first matching case, or else.
  - **Loops**: a number of times, for each item, or while true, with a limit.
  - **Set variables**: for state machines.
  - **Ask user**: human in the loop.
  - **Parallel and Join**: run several paths at the same time, or one path for each item of a list, and collect their results at a Join. Each branch works on its own copy of the conversation and variables, and branches merge in branch order, so a run comes out the same whichever branch finishes first. Wait for every branch or just the first, limit how many run at once, and take a separate path if one fails.
  - Cycles are allowed, with a step limit as a safety net.
  - A small, safe expression language (no `eval`) for conditions and placeholders.
- **Groups** – containers whose system prompt, model, sampling, context and setup-only settings apply to every segment inside, nested groups included. Memory and knowledge placed in a group feed everything in it.
- **Memory** – notes, the recent conversation, or a store of facts that segments write. A store can keep its entries between runs, saved (and encrypted) with the workspace. Markers in a zoomed-in segment show where memory and knowledge go into its prompt and what they hold, or what they recalled in the last run.
- **Knowledge (RAG)**
  - Import or paste documents.
  - Chunking with overlap.
  - Keyword (BM25), semantic (LM Studio embeddings, cached) or hybrid (reciprocal rank fusion) search, optionally preferring varied passages (MMR).
  - Numbered passages for citations, and a test search box.
- **Run panel** – every step with exactly what was sent to the model, with recalled memory and knowledge highlighted where they went, the streamed reply and reasoning, retrieved passages and scores, attempts and timing. Also the conversation as it built up, the variables, and the output. The canvas highlights the running node, the path taken and the memory connections that were used.
- **Templates** – conversation, chatbot with memory, knowledge Q&A, router, draft–critique–revise loop, several perspectives (parallel), summarise in parts (map-reduce), and structured extraction.
- **Prompt blocks** – inside a segment, system, user and assistant messages in a rich Markdown editor. Drag to reorder, change a block's role, copy or remove it.
- **Snippets** – trays of reusable text. Drag a snippet into any prompt and it lands as a word of its own, with a space after it so the next one can follow. Group snippets under named section headings, and switch on Arrange to reorder snippets and headings. Snippets are never sent to the model.
- **Snippet sidebars** – two more trays at the left and right window edges, shared by every session and saved with the workspace. They slide in when the pointer reaches the edge and can be pinned open.
- **Sessions** – one tab per conversation. Double-click or press F2 to rename, right-click to duplicate, middle-click to close. Hovering over a tab while dragging text switches to it.
- **Streaming replies** – in a segment, Send (Ctrl/⌘ + Enter) tries it on its own, with the system prompts it inherits and its placeholders filled in from the run input and the last run. The reply goes into the last assistant block: an empty one is filled in, and one with text is carried on, so Stop then Send continues the same reply. A new block is added only when the conversation ends with your message. Stop at any time and keep the partial text. Reply blocks also have Regenerate, and Continue from the caret (Ctrl/⌘ + Shift + Enter), which keeps the text before the caret and writes the rest again. Reasoning ("thinking") output is shown separately and never saved. Tokens per second are shown when it finishes.
- **Files** – open, save, save as JSON, or save encrypted. Drop a file anywhere on the window to open it. Files from earlier versions of the app (plain or encrypted) still open.
- **Autosave** – optional, debounced, and only for files that have a location on disk.
- **Crash-safe saves** – saves go to a temporary file that is renamed over the original, so a crash or power cut never leaves a half-written workspace.
- **Crash recovery** – unsaved changes (including in "Untitled" workspaces) are copied to the app's local storage every few seconds, encrypted if the workspace is. After a crash the app offers to restore them.
- **Recent files** – File → Open recent, and the last file reopens on startup (can be turned off in Settings).
- **Safety nets** – confirmation before discarding unsaved changes, closing a session with content, or quitting with unsaved work. Text copied from the app is cleared off the clipboard when the app quits, unless something else has been copied since.
- Light and dark themes, keyboard shortcuts, works offline.

### Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Run / stop the flow (Send / stop inside a segment) | Ctrl/⌘ + Enter |
| Back from a zoomed-in node | Escape |
| Continue a reply from the caret | Ctrl/⌘ + Shift + Enter |
| Undo / redo flow edits | Ctrl/⌘ + Z / Ctrl/⌘ + Shift + Z |
| Delete / duplicate / group selected nodes | Delete / Ctrl/⌘ + D / Ctrl/⌘ + G |
| Save | Ctrl/⌘ + S |
| Save as JSON | Ctrl/⌘ + Shift + S |
| Open | Ctrl/⌘ + O |
| New session | Ctrl/⌘ + T |
| Rename / close focused tab | F2 / Delete |

## Getting started

Prerequisites: [Bun](https://bun.sh), [Rust](https://www.rust-lang.org/tools/install) and the [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/). For generation, LM Studio with its local server enabled and **CORS turned on** (`lms server start --cors`). Semantic and hybrid retrieval also need an embedding model in LM Studio, such as `nomic-embed-text`.

```bash
bun install
bun run dev           # desktop app with hot reload
```

The app only runs in its desktop window: it relies on Tauri for files, the clipboard and the window, so `http://localhost:3000` in a browser won't work.

The LM Studio address defaults to `ws://127.0.0.1:1234` and can be changed in Settings (the gear icon).

## Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Desktop app with hot reload |
| `bun run test` | All tests (~3 s): unit tests in Node plus component tests in a Nuxt environment |
| `bun run test:watch` | Tests in watch mode |
| `bun run lint` / `lint:fix` | ESLint (Nuxt config with stylistic rules) |
| `bun run typecheck` | `vue-tsc` over the app and tests |
| `bun run check` | Lint, typecheck and test |
| `bun run build` | Desktop installers in `src-tauri/target/release/bundle/` |
| `bun run frontend:dev` / `frontend:build` | Just the Nuxt dev server or static bundle that Tauri loads (run for you by `dev` and `build`) |

## Architecture

```
app/
├── lib/          Pure domain logic, no Vue or I/O (fully unit-tested)
│   ├── workspace.ts   Sessions and sidebars
│   ├── blocks.ts      Message and snippet blocks, and what a segment's Send sends
│   ├── flow/          The flow model and its interpreter (see docs/FLOWS.md)
│   │   ├── types.ts        Nodes, edges, settings and defaults
│   │   ├── graph.ts        Connection rules, nesting, inherited settings, context sources, where branches meet
│   │   ├── engine.ts       Runs a flow step by step, branches in parallel; the model, embeddings and questions are passed in
│   │   ├── expression.ts   Safe expression language (template.ts fills in {{placeholders}})
│   │   ├── json-schema.ts  Structured-output validation (CSP-safe) and JSON extraction
│   │   ├── retrieval.ts    Chunking, BM25, embedding similarity, rank fusion, MMR
│   │   ├── validate.ts     Checks shown on the canvas before a run
│   │   └── templates.ts    Starter flows
│   ├── schema.ts      File format validation (zod) and migration from v1–v3 files
│   ├── document.ts    Bytes ⇄ workspace, detecting JSON vs encrypted files
│   ├── crypto.ts      PBKDF2 + AES-GCM envelope
│   └── batch.ts       Coalesces streamed tokens into periodic UI updates
├── services/     Side effects behind interfaces
│   ├── files.ts       Tauri dialogs + fs plugin + atomic writes
│   ├── recovery.ts    Crash-recovery copy of unsaved changes (IndexedDB)
│   ├── llm.ts         LM Studio SDK (lazy-loaded): chat, structured output, embeddings
│   ├── clipboard.ts   Clipboard plugin: secret copies, clearing copied text on quit
│   └── container.ts   Service registry, so stores can be tested with fakes
├── stores/       Pinia stores
│   ├── workspace.ts   Sessions, flows, sidebars, every edit to them, and undo history
│   ├── document.ts    Open/save/encryption, dirty tracking, autosave
│   ├── generation.ts  Model lists, and a segment's Send (streaming, cancellation)
│   ├── flowRun.ts     Running flows: the engine wired to LM Studio, the Ask dialog and the run panel
│   ├── flowView.ts    Which node is zoomed into, viewports and panels (never saved)
│   └── settings.ts    Per-device preferences (localStorage)
├── plugins/services.ts  Wires real services, modals and toasts into the registry
├── composables/  Shortcuts, file drop target, window title, close guard, clipboard clean-up
└── components/   UI (Nuxt UI); flow/ holds the canvas, node cards and each node's editor
src-tauri/        Tauri shell: dialog, fs, persisted-scope and clipboard plugins, plus one command (write_file_atomic)
test/unit/        Node tests for lib, services and stores
test/nuxt/        Component tests rendered in a real Nuxt app
```

Data flows one way: components read store state and call store actions; stores use services; services touch the outside world.

## File format and security

Workspaces are saved as JSON:

```json
{ "format": "ai-editor", "version": 4, "sessions": [{ "id": "…", "title": "…", "model": "…", "flow": { "settings": {}, "nodes": [], "edges": [] } }], "sidebars": { "left": [], "right": [] } }
```

Files from earlier versions open as a flow with one segment holding their blocks. Node fields missing from a file take their defaults, and damaged flows are repaired on load: references to missing groups, edges that break the rules and duplicate keys are fixed.

Encrypted files (`.aienc`) start with an `AIEDITOR` header recording the format version and PBKDF2 iteration count, followed by a random salt, IV and the AES-256-GCM ciphertext. The header is authenticated, so tampering is detected.

- Keys are derived with PBKDF2-SHA256 at 600,000 iterations (OWASP 2023). The derived key is kept non-extractable in memory and reused for autosaves; the password itself is not stored.
- Files from the original app (100,000 iterations, no header) still open and are upgraded to the new format on the next save.
- The app can only read or write files the user picked in a dialog. The fs plugin's scope is limited to dialog selections, which are remembered across restarts so recent files can be reopened. The one custom command, `write_file_atomic`, checks the same scope before writing.
- Sidebar snippets, knowledge documents and memory entries live in the workspace file, so they are encrypted along with it. Only which sidebars are pinned is kept in local storage. Embedding vectors are cached in memory only.
- Knowledge documents are imported through the same dialog-scoped file access as workspaces.
- Flow expressions and placeholders are interpreted by the app, never run as code. They can only read the run's own values and call a fixed set of functions.
- Text copied from an encrypted workspace (Ctrl+C/X, the context menu or a copy button) is written as plain text marked sensitive, so Windows keeps it out of clipboard history (Win+V) and cloud sync, and clipboard managers on macOS and Linux are asked to skip it. Copies from plain workspaces behave as usual.
- On quit, the app clears the clipboard if it still holds text copied from the app.
- A strict Content Security Policy limits network access to the app itself and local LM Studio servers. Icons are bundled, so nothing is fetched from the internet at runtime.

## License

GPLv3
