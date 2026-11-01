# Code audit (October 2026)

What was wrong with the previous version (commit `b528da2`) and how the rewrite fixes it.

## Data loss and correctness bugs

| # | Problem | Fix |
| --- | --- | --- |
| 1 | The `overlayResult` watcher was never cleared. After opening an encrypted file, the "read" branch always matched first, so **Save & Enc never wrote again** and every state change decrypted the file once more. | Dialogs return a promise (`useOverlay().open().result`); no global result state. |
| 2 | Saving encrypted over an **existing** file always failed silently: `canWrite` AES-GCM-decrypted only the first 29 bytes, which can never authenticate. | Removed. The OS save dialog confirms overwrites; encryption uses a versioned envelope. |
| 3 | Autosave called `canWrite(...)` without `await`; a Promise is truthy, so the check never ran. | Autosave writes through one serialised save path in `stores/document.ts`. |
| 4 | Cancelling the password prompt after "Open Encrypted File" still made that file the autosave target, so the next autosave **wrote plaintext JSON over the encrypted file**. | The file only becomes current after it is successfully opened or saved. |
| 5 | Opening or exporting JSON kept the previous password, so autosave **silently encrypted a plain JSON file** with an old password. | Each document carries its own encryption state; opening a file replaces it. |
| 6 | Dropping a file kept the previous file path, so autosave **overwrote the previously opened file** with the dropped content. | Dropped files have no location; saving asks where to store them and autosave stays off. |
| 7 | A wrong password produced an unhandled rejection and no feedback; the password was stored even when decryption failed. | The password dialog verifies before closing and shows "Incorrect password". |
| 8 | "Add Segment" pushed the object from the `defaultTab` constant itself, so added blocks shared one object and edits changed the template. | `createBlock()` makes a new block with its own id every time. |
| 9 | "Open JSON File" assigned to a `defineModel` bound to a `reactive` const in the parent; the update was dropped. | State lives in Pinia stores; nothing is passed down by `v-model` chains. |
| 10 | The live LM Studio prediction (`stopController`) was stored inside tab data: deep-watched, serialised on autosave, and duplicating a tab mid-generation threw `DataCloneError`. | Runtime state (abort controllers, reasoning, stats) lives in `stores/generation.ts`, never in saved data. |
| 11 | A failed generation left the Stop button stuck; a session without an Assistant block threw `TypeError`; replies were appended to an *earlier* assistant block if the conversation continued after it. | `try/finally` around every run; `planGeneration()` fills a trailing empty assistant block or appends a new one. |
| 12 | Streaming appended each token to text read back from the Markdown editor, which had normalised it, so words merged and `&nbsp;` appeared (the `.replace('&nbsp;')` patch only handled the first match). | Tokens accumulate in a plain string, flushed to the editor every 50 ms. |
| 13 | Empty prompts were padded to `' '` (`prompt ||= ' '`) and sent to the model. | Removed; empty messages are skipped; v1 files are cleaned on import. |
| 14 | Tab labels doubled as indexes: after closing a tab, labels repeated and drag-to-switch picked the wrong tab; closing the active tab left an out-of-range selection. | Sessions have stable ids and titles; closing selects a neighbour. |
| 15 | Sortable was bound to the first prompt list it saw, so reordering broke after loading a file; index keys made editors swap content when reordering. | Sorting calls `moveBlock()` on the current session; blocks are keyed by id; pointer-based dragging so block text is never dropped into an editor. |
| 16 | The drop overlay appeared for any drag (text, block reordering) and flickered as the pointer crossed child elements. | Only drags that carry files, counted across enter/leave. |
| 17 | The model list spinner spun forever when LM Studio was down; every tab created and leaked its own `LMStudioClient`. | One lazily created client, reset after errors, with clear messages. |
| 18 | `read_file_bytes` in Rust used `expect`/`unwrap`, so an unreadable file panicked the command. | Custom commands removed in favour of the fs plugin. |
| 19 | Icons were fetched from `api.iconify.design` at runtime, so they broke offline. | Icons are bundled (`icon.provider: 'none'`). |
| 20 | `@vueuse/integrations` and `@tiptap/core` were used without being dependencies; types were imported from an internal Nuxt UI path. | Declared explicitly; own domain types. |

## Security

- **Any file on disk** could be read or written from the webview through custom commands, with **CSP disabled** (`"csp": null`) and `withGlobalTauri` on. Now only the official fs plugin is used, its scope is limited to files picked in a dialog, a strict CSP is set, and the global API is off.
- PBKDF2 used 100,000 iterations (below OWASP's 600,000), the derived key was extractable, the password sat in global state, and the file had no header or version. Now 600,000 iterations recorded in an authenticated header, a non-extractable key reused for autosaves (the password isn't kept), and old files still open and are upgraded on save.
- File bytes travelled as JSON number arrays over IPC. The fs plugin sends raw binary.

## Third-party issues worked around

- `@lmstudio/sdk` 2.1 in the webview (its browser build) doesn't await its own server probe, and crashes in `onWsError` because browser WebSocket error events have no `error`. `services/llm.ts` always passes an explicit URL and checks the server answers first. Worth reporting upstream.

## UX

Previously errors only went to the console, nothing tracked unsaved changes, dialogs were titled "File Selector", JSON and encrypted files needed different menu items, there were no keyboard shortcuts, menu items only responded to clicks on their inner button, the window was 800×600, and tabs could only be closed with a middle-click.

Now there are toasts, a dirty indicator with the file name in the title bar, guards before discarding work, one "Open…" that detects the file type, shortcuts, a light/dark toggle, closable and renamable tabs with a context menu, colour-coded blocks with role switching and token estimates, inline snippet editing with drag-to-insert, live reasoning, and generation stats.

## Tooling

- `.gitignore` was copied from the Bun repository and ignored unrelated paths such as `test.ts`, `coverage`, `out` and `release/`. Replaced.
- There were no tests and no CI. Now 78 tests run in about 3 s, plus a GitHub Actions workflow for lint, typecheck, tests, build and Clippy.

## Not done / follow-ups

- **TypeScript 7** isn't used: `vue-tsc` needs the TypeScript JS API, which 7.0 doesn't ship. The project stays on 6.0 until Volar supports it.
- **Tauri 3** is still alpha; the app uses Tauri 2.12.
- Nuxt reports Node 25 as unsupported; use Node 24 LTS or 26.
- The main JS chunk is about 1.5 MB (TipTap, Nuxt UI). That's fine for a desktop app loading from disk.
- Native dialogs and the quit-with-unsaved-changes prompt were not exercised by automated tests.
