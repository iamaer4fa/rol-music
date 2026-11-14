//! # Synchronization Module
//!
//! Minimal synchronization between local and remote storage.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A practice session record for synchronization
#[derive(Debug, Clone, Serialize)]
pub struct LocalPracticeRecord {
    pub session_id: Uuid,
    pub team_id: Uuid,
    pub user_id: Uuid,
    pub song_id: Uuid,
    pub arrangement_id: Option<Uuid>,
    pub lineup_item_id: Option<Uuid>,
    pub device_id: Uuid,
    pub started_at: chrono::DateTime<Utc>,
    pub ended_at: Option<chrono::DateTime<Utc>>,
    pub actual_practice_duration_seconds: i64,
    pub playback_speed: f64,
    pub loop_start_ms: Option<i32>,
    pub loop_end_ms: Option<i32>,
    pub loop_repetitions: i32,
    pub schema_version: String,
}

/// Sync status
#[derive(Debug, Clone, PartialEq)]
pub enum SyncStatus {
    Synced,
    Pending,
    Offline,
    Error(String),
}

/// Validate a practice session record
pub fn validate_record(record: &LocalPracticeRecord) -> bool {
    record.actual_practice_duration_seconds >= 0
        && (record.playback_speed >= 0.5 && record.playback_speed <= 2.0)
}

/// Generate a new session ID
pub fn generate_session_id() -> Uuid {
    Uuid::new_v4()
}
