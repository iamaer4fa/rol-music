use tauri::Manager;

/// Get the resource directory path from Tauri
pub fn get_resource_dir(app: &tauri::AppHandle) -> Result<String, String> {
    app.path()
        .resource_dir()
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|error| error.to_string())
}

/// Initialize the application
pub fn init() {
    // Application initialization
}
