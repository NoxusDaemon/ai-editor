fn main() {
    // Listing the app's commands makes them need a permission in a capability,
    // like plugin commands, instead of being callable by default.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["write_file_atomic"])),
    )
    .expect("failed to run tauri-build");
}
