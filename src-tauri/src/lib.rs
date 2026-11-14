//! # ROL Worship Team
//!
//! The backend for the ROL Worship Team desktop application.
//!
//! Provides database access, authentication, synchronization, and other services.

use tauri::Manager;

pub mod auth;
pub mod db;
pub mod models;
pub mod practice;
pub mod sync;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            let database_path = app.path().app_data_dir()?.join("practice-history.sqlite3");
            let store =
                practice::PracticeStore::open(&database_path).map_err(std::io::Error::other)?;
            app.manage(store);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            practice::start_practice_segment,
            practice::sample_practice_playback,
            practice::finish_practice_segment,
            practice::get_pending_practice_sessions,
            practice::get_local_practice_history,
            practice::update_practice_sync_state,
            practice::make_pending_practice_private,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run ROL Worship Team");
}
