//! # ROL Worship Team
//!
//! The backend for the ROL Worship Team desktop application.
//!
//! Provides database access, authentication, synchronization, and other services.

use tauri::Manager;

pub mod auth;
pub mod db;
pub mod models;
pub mod offline_cache;
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
            let cache_database_path =
                app.path().app_data_dir()?.join("application-cache.sqlite3");
            let cache_store =
                offline_cache::OfflineCacheStore::open(&cache_database_path)
                    .map_err(std::io::Error::other)?;
            app.manage(cache_store);
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
            offline_cache::save_application_cache,
            offline_cache::get_application_cache,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run ROL Worship Team");
}
