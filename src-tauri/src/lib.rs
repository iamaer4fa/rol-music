//! # ROL Worship Team
//! 
//! The backend for the ROL Worship Team desktop application.
//! 
//! Provides database access, authentication, synchronization, and other services.

pub mod db;
pub mod auth;
pub mod models;
pub mod sync;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("failed to run ROL Worship Team");
}
