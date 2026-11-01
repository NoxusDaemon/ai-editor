# AI Editor

A desktop editor for composing prompts and running them against local models in [LM Studio](https://lmstudio.ai). Build a conversation out of system, user and assistant blocks, keep reusable snippets beside it, and save the whole workspace as JSON or as a password-encrypted file.

Built with Nuxt 4, Nuxt UI 4, Pinia and Tauri 2.

## Features

- **Prompt blocks** – system, user and assistant messages in a rich Markdown editor. Drag to reorder, change a block's role, copy or remove it.
- **Snippets** – trays of reusable text. Drag a snippet into any prompt and it lands as a word of its own, with a space after it so the next one can follow. Group snippets under named section headings, and switch on Arrange to reorder snippets and headings. Snippets are never sent to the model.
- **Snippet sidebars** – two more trays at the left and right window edges, shared by every session and saved with the workspace. They slide in when the pointer reaches the edge and can be pinned open.
- **Sessions** – one tab per conversation. Double-click or press F2 to rename, right-click to duplicate, middle-click to close. Hovering over a tab while dragging text switches to it.
- **Streaming replies** – press Send (Ctrl/⌘ + Enter) to stream a reply into the trailing empty assistant block, or a new one. Stop at any time and keep the partial text. Reasoning ("thinking") output is shown separately and never saved. Tokens per second are shown when it finishes.
- **Files** – open, save, save as JSON, or save encrypted. Drop a file anywhere on the window to open it. Files from earlier versions of the app (plain or encrypted) still open.
- **Autosave** – optional, debounced, and only for files that have a location on disk.
- **Crash-safe saves** – the desktop app writes to a temporary file and renames it over the original, so a crash or power cut never leaves a half-written workspace.
- **Crash recovery** – unsaved changes (including in "Untitled" workspaces) are copied to the app's local storage every few seconds, encrypted if the workspace is. After a crash the app offers to restore them.
- **Recent files** – File → Open recent, and the last file reopens on startup (desktop app; can be turned off in Settings).
- **Safety nets** – confirmation before discarding unsaved changes, closing a session with content, or quitting with unsaved work. Text copied from the app is cleared off the clipboard when the app quits, unless something else has been copied since.
- Light and dark themes, keyboard shortcuts, works offline.

### Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Send / stop | Ctrl/⌘ + Enter |
| Save | Ctrl/⌘ + S |
| Save as JSON | Ctrl/⌘ + Shift + S |
| Open | Ctrl/⌘ + O |
| New session | Ctrl/⌘ + T |
| Rename / close focused tab | F2 / Delete |

## Getting started

Prerequisites: [Bun](https://bun.sh), [Rust](https://www.rust-lang.org/tools/install) and the [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/). For generation, LM Studio with its local server enabled and **CORS turned on** (`lms server start --cors`).

```bash
bun install
bun run tauri:dev     # desktop app with hot reload
bun run dev           # the same UI in a browser at http://localhost:3000
```

In the browser, files are opened and saved with the File System Access API (Chromium) or plain upload/download elsewhere.

The LM Studio address defaults to `ws://127.0.0.1:1234` and can be changed in Settings (the gear icon).

## Scripts

| Command | What it does |
| --- | --- |
| `bun run test` | All tests (~3 s): unit tests in Node plus component tests in a Nuxt environment |
| `bun run test:watch` | Tests in watch mode |
| `bun run lint` / `lint:fix` | ESLint (Nuxt config with stylistic rules) |
| `bun run typecheck` | `vue-tsc` over the app and tests |
| `bun run check` | Lint, typecheck and test |
| `bun run build` | Static frontend in `.output/public` |
| `bun run tauri:build` | Desktop installers in `src-tauri/target/release/bundle/` |

## Architecture

```
app/
├── lib/          Pure domain logic, no Vue or I/O (fully unit-tested)
│   ├── workspace.ts   Sessions, blocks, snippets, and what gets sent to the model
│   ├── schema.ts      File format validation (zod) and migration from v1 and v2 files
│   ├── document.ts    Bytes ⇄ workspace, detecting JSON vs encrypted files
│   ├── crypto.ts      PBKDF2 + AES-GCM envelope
│   └── batch.ts       Coalesces streamed tokens into periodic UI updates
├── services/     Side effects behind interfaces
│   ├── files.ts       Tauri dialogs + fs plugin + atomic writes, or browser file APIs
│   ├── recovery.ts    Crash-recovery copy of unsaved changes (IndexedDB)
│   ├── llm.ts         LM Studio SDK (lazy-loaded)
│   ├── clipboard.ts   Clipboard plugin: secret copies, clearing copied text on quit
│   └── container.ts   Service registry, so stores can be tested with fakes
├── stores/       Pinia stores
│   ├── workspace.ts   Sessions, sidebars and every edit to them
│   ├── document.ts    Open/save/encryption, dirty tracking, autosave
│   ├── generation.ts  Model list, streaming, cancellation
│   └── settings.ts    Per-device preferences (localStorage)
├── plugins/services.ts  Wires real services, modals and toasts into the registry
├── composables/  Shortcuts, file drop target, window title, close guard, clipboard clean-up
└── components/   UI (Nuxt UI)
src-tauri/        Tauri shell: dialog, fs, persisted-scope and clipboard plugins, plus one command (write_file_atomic)
test/unit/        Node tests for lib, services and stores
test/nuxt/        Component tests rendered in a real Nuxt app
```

Data flows one way: components read store state and call store actions; stores use services; services touch the outside world.

## File format and security

Workspaces are saved as JSON:

```json
{ "format": "ai-editor", "version": 3, "sessions": [{ "id": "…", "title": "…", "model": "…", "blocks": [] }], "sidebars": { "left": [], "right": [] } }
```

Encrypted files (`.aienc`) start with an `AIEDITOR` header recording the format version and PBKDF2 iteration count, followed by a random salt, IV and the AES-256-GCM ciphertext. The header is authenticated, so tampering is detected.

- Keys are derived with PBKDF2-SHA256 at 600,000 iterations (OWASP 2023). The derived key is kept non-extractable in memory and reused for autosaves; the password itself is not stored.
- Files from the original app (100,000 iterations, no header) still open and are upgraded to the new format on the next save.
- The desktop app can only read or write files the user picked in a dialog. The fs plugin's scope is limited to dialog selections, which are remembered across restarts so recent files can be reopened. The one custom command, `write_file_atomic`, checks the same scope before writing.
- Sidebar snippets live in the workspace file, so they are encrypted along with it. Only which sidebars are pinned is kept in local storage.
- Text copied from an encrypted workspace (Ctrl+C/X, the context menu or a copy button) is written as plain text marked sensitive, so Windows keeps it out of clipboard history (Win+V) and cloud sync, and clipboard managers on macOS and Linux are asked to skip it. Copies from plain workspaces behave as usual.
- On quit, the app clears the clipboard if it still holds text copied from the app.
- A strict Content Security Policy limits network access to the app itself and local LM Studio servers. Icons are bundled, so nothing is fetched from the internet at runtime.

## License

GPLv3
