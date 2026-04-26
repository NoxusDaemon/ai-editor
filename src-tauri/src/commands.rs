use std::{fs::File, io::Read, path::Path};

#[tauri::command]
pub async fn read_file(_app: tauri::AppHandle, path: String) -> Result<Vec<u8>, String> {
    let content: Vec<u8> = std::fs::read(&path)
        .map_err(|e| format!("Failed to read file '{}': {}", path, e))?;
    Ok(content)
}

#[tauri::command]
pub async fn read_file_bytes(
    _app: tauri::AppHandle,
    path: String,
    length: u64,
) -> Result<Vec<u8>, String> {
    let mut buf: Vec<u8> = vec![0; length.try_into().unwrap()];
    if !Path::new(&path).exists() {
        Ok(buf)
    } else {
        let mut file: File = File::open(&path)
            .map_err(|e| format!("Failed to open file '{}': {}", path, e))?;
        file.read_exact(&mut buf)
            .map_err(|e| format!("Failed to read file '{}': {}", path, e))?;
        Ok(buf)
    }
}

#[tauri::command]
pub async fn write_file(_app: tauri::AppHandle, path: String, data: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, data).map_err(|e| format!("Failed to write file '{}': {}", path, e))?;
    Ok(())
}