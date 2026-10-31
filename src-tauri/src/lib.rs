// File access goes through the official fs plugin. The dialog plugin adds every
// path the user picks to the fs scope, so the webview can only touch files the
// user explicitly chose.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running AI Editor");
}
