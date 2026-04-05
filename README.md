# AI Editor

A secure desktop application for managing AI chat sessions with encrypted file storage. Built with Nuxt 4, Tauri v2, and Vue 3.

## Features

- **Encrypted File Storage** - Password-protected AES-GCM encryption for your chat data
- **Multi-tab Interface** - Manage multiple conversation sessions simultaneously
- **Auto-save** - Automatic debounced saving of your work (encrypted or plain JSON)
- **File Operations** - Open, export, and save encrypted files with password protection
- **LM Studio Integration** - Connect to local AI models via LM Studio SDK
- **Drag-to-Switch Tabs** - Quick navigation by dragging over tab headers
- **Cross-platform Desktop App** - Runs on Windows, macOS, and Linux

## Tech Stack

- **Frontend**: Nuxt 4, Vue 3, TypeScript, Tailwind CSS v4
- **UI Components**: Nuxt UI v4
- **Desktop Framework**: Tauri v2 (Rust backend)
- **Encryption**: Web Crypto API (AES-GCM with PBKDF2 key derivation)
- **Package Manager**: Bun

## Prerequisites

- [Bun](https://bun.sh/) - JavaScript runtime and package manager
- [Rust](https://www.rust-lang.org/tools/install) - For Tauri backend compilation
- System dependencies for Tauri (see [Tauri docs](https://tauri.app/v1/guides/getting-started/prerequisites))

## Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd ai-editor

# Install dependencies
bun install
```

## Development

### Web Development Mode (Nuxt only)
```bash
bun run dev
```

### Desktop Development Mode (Tauri + Nuxt)
```bash
bun run tauri:dev
```

## Building for Production

### Build Desktop Application
```bash
bun run tauri:build
```

The compiled binaries will be in `src-tauri/target/release/bundle/`.

### Build Web Version Only
```bash
bun run build
bun run preview
```

## Usage

1. **Create a New Tab** - Click the + button to add conversation sessions
2. **Configure Prompts** - Edit system, user, and assistant prompts in each tab
3. **Save Encrypted** - Use "Save & Enc File" from the menu to save with password protection
4. **Open Encrypted Files** - Select "Open Encrypted File" and enter your password
5. **Auto-save** - Toggle auto-save switch for automatic file updates

## Project Structure

```
├── app/
│   ├── components/       # Vue components (Tabs, Editor, File dialogs)
│   ├── composables/      # Reusable logic (useCrypto, useFileHandler)
│   ├── constants/        # Default configurations
│   └── pages/            # Nuxt page routes
├── src-tauri/
│   ├── src/
│   │   ├── commands.rs   # Tauri backend commands
│   │   ├── lib.rs        # Tauri application setup
│   │   └── main.rs       # Application entry point
│   ├── capabilities/     # Permission configurations
│   └── tauri.conf.json   # Tauri configuration
├── package.json
└── nuxt.config.ts
```

## Security Notes

- Encryption uses AES-GCM with 256-bit keys derived via PBKDF2 (100,000 iterations)
- Passwords are never stored - you must enter them when opening encrypted files
- For production use, consider additional security measures for key storage

## License

GPLv3