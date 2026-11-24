use std::{fs, path::Path, sync::Mutex};

use rusqlite::{params, Connection};
use serde::Serialize;
use tauri::State;

pub struct OfflineCacheStore {
    connection: Mutex<Connection>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineCacheEntry {
    pub payload: String,
    pub updated_at: String,
}

impl OfflineCacheStore {
    pub fn open(path: &Path) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let connection = Connection::open(path).map_err(|error| error.to_string())?;
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON;
                 CREATE TABLE IF NOT EXISTS application_cache (
                    team_id TEXT NOT NULL,
                    cache_key TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (team_id, cache_key)
                 );",
            )
            .map_err(|error| error.to_string())?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }
}

#[tauri::command]
pub fn save_application_cache(
    store: State<'_, OfflineCacheStore>,
    team_id: String,
    cache_key: String,
    payload: String,
) -> Result<(), String> {
    let connection = store
        .connection
        .lock()
        .map_err(|_| "Local application cache is unavailable.".to_string())?;
    connection
        .execute(
            "INSERT INTO application_cache (team_id, cache_key, payload, updated_at)
             VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
             ON CONFLICT(team_id, cache_key) DO UPDATE SET
                payload = excluded.payload,
                updated_at = excluded.updated_at",
            params![team_id, cache_key, payload],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_application_cache(
    store: State<'_, OfflineCacheStore>,
    team_id: String,
    cache_key: String,
) -> Result<Option<OfflineCacheEntry>, String> {
    let connection = store
        .connection
        .lock()
        .map_err(|_| "Local application cache is unavailable.".to_string())?;
    let result = connection.query_row(
        "SELECT payload, updated_at
         FROM application_cache
         WHERE team_id = ?1 AND cache_key = ?2",
        params![team_id, cache_key],
        |row| {
            Ok(OfflineCacheEntry {
                payload: row.get(0)?,
                updated_at: row.get(1)?,
            })
        },
    );
    match result {
        Ok(entry) => Ok(Some(entry)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}
