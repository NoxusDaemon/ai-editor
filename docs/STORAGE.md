# Storage: file or database? (October 2026)

Whether to move workspaces out of a single file and into a database, what it would cost, and what to do instead.

## How persistence works today

A workspace (`Session[]`, each with ordered message and snippet blocks) is saved as one file: plain JSON (format v2, `lib/schema.ts`) or a password-encrypted `.aienc` envelope (`lib/crypto.ts`, PBKDF2 600k → AES-256-GCM).

- **Path:** `stores/document.ts` → `lib/document.ts` (bytes ⇄ sessions, JSON vs encrypted detection) → `services/files.ts` (`FileSystem` interface: Tauri dialog + fs plugin, or the browser File System Access API / download).
- **Every save rewrites the whole file.** `writeTo()` serialises all sessions, optionally encrypts them, and calls `writeFile`, which truncates and writes in place. It is not atomic.
- **Autosave** is opt-in, debounced 1 s / max 5 s, and only for files with a location on disk, never for "Untitled" or dropped files.
- **Dirty tracking** compares the serialised workspace string with the last saved one.
- **Encryption is per file, per password.** The derived key is cached non-extractable for autosaves.
- **Security posture:** no custom Rust commands, fs scope limited to files picked in a dialog, strict CSP, offline.
- **Two runtimes:** the Tauri desktop app and a plain browser (`bun run dev`).
- **Settings** already live in localStorage (`stores/settings.ts`).
- **Data scale:** prompt text. Realistic workspaces are KB to low MB, so serialise + AES-GCM + write takes a few ms.

## Verdict: viable, but not worth it as a replacement

The code is layered so that a database would slot in easily: stores reach I/O only through `services/container.ts`, and the domain model in `lib/workspace.ts` is pure. Nothing blocks it.

The problem is the trade. At this data size a database buys almost no performance, and what it does buy (always-on saving, a browsable library) turns a document editor into a library app. The file code would also have to stay for import, export and sharing, so a database adds a second storage system rather than replacing one.

## Database options

| Option | Runtimes | Encryption | Security impact | Effort |
| --- | --- | --- | --- | --- |
| **A. SQLite via `tauri-plugin-sql`** (sqlx) | Tauri only | None built in; per-row app-level with the existing `Cipher` | The webview can run **arbitrary SQL** on the database (`sql:allow-execute`) | Medium |
| **B. SQLite via typed Rust commands** (`rusqlite`, optionally `bundled-sqlcipher`) | Tauri only | SQLCipher for the whole database, or app-level | Reverses "no custom commands", but a typed API (`list_sessions`, `save_session`) is narrower than raw SQL | Medium–high: Rust code, Rust tests, a C toolchain in CI for SQLCipher |
| **C. IndexedDB** (`idb` or Dexie) | Both | App-level with the existing `Cipher` | No new Rust code or permissions | Low–medium, but data sits inside the WebView2 profile, is **origin-bound** (dev `localhost:3000` and the packaged app get separate databases), is wiped with webview data, and is hard to back up |
| **D. Remote database** (Postgres, Supabase…) | — | — | Breaks offline use and the local-only CSP | Out of scope |

If a database is ever adopted, **B** fits this codebase best: it keeps the narrow, typed IPC of the current design, puts the database in the app data folder where it can be backed up, and allows SQLCipher if whole-database encryption is wanted.

## Pros of a database

1. **Incremental, transactional writes.** Only changed sessions and blocks are written, inside a transaction, and SQLite with WAL survives crashes and power loss. Today a crash during `writeFile` can leave a truncated file; for `.aienc` that makes the whole workspace undecryptable.
2. **Always-on persistence.** No "Untitled" workspace that disappears on a crash, autosave without first choosing a file, and the app reopens where you left off.
3. **Library features become cheap:** list and search every session ever made, sort by last edited, tags, several replies per prompt, generation stats, history and undo across restarts.
4. **Scales** to hundreds of sessions without holding or re-serialising everything on each save.
5. **Multi-window safety** later, through database locking.

## Cons of a database

1. **It changes the product model.** Open, Save, Save As, the dirty indicator, "Discard unsaved changes", the quit guard, file drop and the title bar all need redesigning. That touches `stores/document.ts`, `components/FileMenu.vue`, `components/AppHeader.vue`, `composables/useWindowGuard.ts`, `composables/useAppShortcuts.ts`, `app.vue`, and the tests in `test/unit/document-store.test.ts` and `test/unit/fakes.ts`.
2. **It loses portability.** A JSON file can be emailed, synced through Dropbox, versioned and diffed in git, hand-edited, and opened on another machine. Import and export would still be needed, so `schema.ts`, `document.ts`, `crypto.ts` and `files.ts` all stay: **more code, not less**.
3. **The encryption model doesn't map.** Per-file passwords become either:
   - one master password for the whole database (SQLCipher: a native C dependency, cross-platform build and CI work, and no mixing of plain and encrypted workspaces), or
   - per-row app-level encryption (titles, counts, sizes and timestamps leak, encrypted text can't be searched with SQL, and salt and key storage plus an unlock-at-startup flow need designing).
4. **It weakens the security story** in the README ("no custom commands, fs scope limited to dialog selections"). Every option except IndexedDB adds IPC surface, and `tauri-plugin-sql` lets any script in the webview run any SQL.
5. **Two runtimes need two backends.** Tauri SQLite doesn't exist under `bun run dev`, so browser mode needs IndexedDB (or wasm SQLite) as a second implementation, or loses persistence.
6. **A second migration system** alongside the file-format versioning in `schema.ts`.
7. **Testing gets heavier.** Store tests can fake a repository interface the way `fakes.ts` fakes `FileSystem`, but real SQL needs Rust or integration tests that CI doesn't run today.
8. **Negligible performance gain** at current scale: the 1 s debounce dominates the few ms spent serialising, encrypting and writing.
9. **The data location becomes opaque.** Users can no longer point at "my prompts file" to back it up or move it.

## Recommendation

**Stay on files.** A database's real advantages are reliability and library features. The first can be had cheaply without a database; the second is a product decision, not a storage one.

### Reliability fixes (done, no database needed)

- **Atomic saves.** `tauri-plugin-fs` 2.7.1 `write_file` opens the target with `truncate: true` and writes in place, so a crash mid-save could cut the file short. Desktop saves now go through one app command, `write_file_atomic` (`src-tauri/src/lib.rs`): it checks the path is in the fs scope (picked in a dialog), writes `.<name>.tmp` next to it, syncs it to disk and renames it over the original. The command is listed in `build.rs`, so it needs the `allow-write-file-atomic` permission like a plugin command, and `fs:allow-write-file` was removed. In the browser, File System Access writes were already atomic (swap file committed on close).
- **Recovery copy.** `services/recovery.ts` keeps unsaved changes in IndexedDB, written at the autosave pace whether autosave is on or not and encrypted with the workspace's key when it is encrypted. It is cleared when the changes are saved or discarded, including "Quit without saving". On startup the app offers to restore it, marked unsaved and pointing back at its file. IndexedDB was chosen over `$APPDATA/recovery.json` because it works in both runtimes and needs no extra fs scope.
- **Recent files and reopening the last file** (desktop app). Paths are kept in localStorage. `tauri-plugin-persisted-scope` remembers which files were picked in a dialog, so they can be read again after a restart without widening the scope to other files.

### If a session library is wanted later

Use a hybrid, not a replacement:

- SQLite through typed Rust commands (option B) as the always-on store, behind a new `WorkspaceRepository` service registered in `services/container.ts` and faked in `test/unit/fakes.ts` the way `FileSystem` is.
- JSON and `.aienc` files kept for import and export, reusing `lib/schema.ts`, `lib/document.ts`, `lib/crypto.ts` and `services/files.ts` unchanged.
- An IndexedDB backend for `bun run dev` only.
- Decide encryption at that point:

| Choice | Gains | Costs |
| --- | --- | --- |
| Plaintext database, encryption only on exported `.aienc` files | Simplest; SQL search works | Library contents readable by anyone with disk access |
| Master password with SQLCipher | Everything encrypted, including titles and metadata | Native C dependency, CI builds on three OSes, an unlock prompt every launch, and a forgotten password loses the whole library |
| Per-row app-level encryption with the existing `Cipher` | No native dependency; reuses `crypto.ts` | Structure and metadata leak; no search over encrypted text; key and salt storage to design |

**Spikes before committing:** whether `rusqlite` with `bundled-sqlcipher` builds cleanly in the GitHub Actions workflow on Windows, macOS and Linux, and how much it adds to installer size.
