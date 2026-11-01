// File access goes through the official fs plugin. The dialog plugin adds every
// path the user picks to the fs scope, so the webview can only touch files the
// user explicitly chose; the persisted-scope plugin remembers those choices so
// recent files can be reopened after a restart. The clipboard plugin keeps text
// copied from encrypted workspaces out of clipboard history and clears copied
// text on quit.
use std::ffi::OsString;
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request};
use tauri::{Runtime, Webview};
use tauri_plugin_fs::FsExt;

/// Replaces `path` without ever leaving it half-written: the bytes go to a
/// temporary file next to it, which is flushed to disk and then renamed over
/// the original. A crash mid-save leaves either the old file or the new one.
fn replace_file(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let name = path
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "not a file path"))?;
    let mut temp_name = OsString::from(".");
    temp_name.push(name);
    temp_name.push(".tmp");
    let temp = path.with_file_name(temp_name);

    let result = File::create(&temp)
        .and_then(|mut file| {
            file.write_all(bytes)?;
            file.sync_all()
        })
        .and_then(|()| fs::rename(&temp, path));
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

/// Atomic counterpart of the fs plugin's `write_file`, with the same scope:
/// only files the user picked in a dialog. The path travels in a header so the
/// bytes can be sent as a raw body rather than a JSON number array.
#[tauri::command]
fn write_file_atomic<R: Runtime>(webview: Webview<R>, request: Request<'_>) -> Result<(), String> {
    let path = request
        .headers()
        .get("path")
        .and_then(|value| value.to_str().ok())
        .map(|value| PathBuf::from(percent_decode_str(value).decode_utf8_lossy().into_owned()))
        .ok_or("missing file path")?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected the file contents as raw bytes".into());
    };
    if !webview.fs_scope().is_allowed(&path) {
        return Err(format!("{} has not been chosen in a file dialog", path.display()));
    }
    replace_file(&path, bytes).map_err(|error| format!("Could not write {}: {error}", path.display()))
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // Must come after the fs plugin, whose scope it saves and restores.
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![write_file_atomic])
        .run(tauri::generate_context!())
        .expect("error while running AI Editor");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ai-editor-{name}-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn replaces_existing_file_and_leaves_no_temp_file() {
        let dir = temp_dir("replace");
        let path = dir.join("work.json");
        fs::write(&path, b"old contents that are longer").unwrap();

        replace_file(&path, b"new").unwrap();

        assert_eq!(fs::read(&path).unwrap(), b"new");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn keeps_original_when_writing_fails() {
        let dir = temp_dir("fail");
        let path = dir.join("work.json");
        fs::write(&path, b"original").unwrap();
        // A directory where the temp file should go makes creating it fail.
        fs::create_dir(dir.join(".work.json.tmp")).unwrap();

        assert!(replace_file(&path, b"new").is_err());
        assert_eq!(fs::read(&path).unwrap(), b"original");
        fs::remove_dir_all(dir).unwrap();
    }
}
