use std::{
    collections::HashMap,
    fs,
    path::Path,
    sync::Mutex,
    time::{Duration, Instant},
};

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

pub struct PracticeStore {
    connection: Mutex<Connection>,
    active_segments: Mutex<HashMap<String, ActiveSegment>>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticeSession {
    pub session_id: String,
    pub team_id: String,
    pub user_id: String,
    pub song_id: String,
    pub arrangement_id: Option<String>,
    pub lineup_item_id: Option<String>,
    pub device_id: String,
    pub started_at: String,
    pub ended_at: String,
    pub actual_practice_duration_seconds: u64,
    pub playback_speed: f64,
    pub loop_start_ms: Option<u64>,
    pub loop_end_ms: Option<u64>,
    pub loop_repetitions: u64,
    pub schema_version: String,
    pub sync_state: String,
    pub sync_error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewPracticeSegment {
    pub session_id: String,
    pub team_id: String,
    pub user_id: String,
    pub song_id: String,
    pub arrangement_id: Option<String>,
    pub lineup_item_id: Option<String>,
    pub device_id: String,
    pub started_at: String,
    pub playback_speed: f64,
    pub loop_start_ms: Option<u64>,
    pub loop_end_ms: Option<u64>,
}

#[derive(Default)]
struct ActiveSegment {
    session: Option<NewPracticeSegment>,
    last_sample_at: Option<Instant>,
    last_position_seconds: Option<f64>,
    duration: Duration,
    loop_repetitions: u64,
}

impl PracticeStore {
    pub fn open(path: &Path) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let connection = Connection::open(path).map_err(|error| error.to_string())?;
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON;
                 CREATE TABLE IF NOT EXISTS practice_sessions (
                    session_id TEXT PRIMARY KEY NOT NULL,
                    team_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    song_id TEXT NOT NULL,
                    arrangement_id TEXT,
                    lineup_item_id TEXT,
                    device_id TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    ended_at TEXT NOT NULL,
                    actual_practice_duration_seconds INTEGER NOT NULL,
                    playback_speed REAL NOT NULL,
                    loop_start_ms INTEGER,
                    loop_end_ms INTEGER,
                    loop_repetitions INTEGER NOT NULL,
                    schema_version TEXT NOT NULL,
                    sync_state TEXT NOT NULL,
                    sync_error TEXT
                 );",
            )
            .map_err(|error| error.to_string())?;

        Ok(Self {
            connection: Mutex::new(connection),
            active_segments: Mutex::new(HashMap::new()),
        })
    }

    fn save(&self, session: &PracticeSession) -> Result<(), String> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| "Local practice database is unavailable.".to_string())?;
        connection
            .execute(
                "INSERT INTO practice_sessions (
                    session_id, team_id, user_id, song_id, arrangement_id, lineup_item_id,
                    device_id, started_at, ended_at, actual_practice_duration_seconds,
                    playback_speed, loop_start_ms, loop_end_ms, loop_repetitions,
                    schema_version, sync_state, sync_error
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
                params![
                    session.session_id,
                    session.team_id,
                    session.user_id,
                    session.song_id,
                    session.arrangement_id,
                    session.lineup_item_id,
                    session.device_id,
                    session.started_at,
                    session.ended_at,
                    session.actual_practice_duration_seconds,
                    session.playback_speed,
                    session.loop_start_ms,
                    session.loop_end_ms,
                    session.loop_repetitions,
                    session.schema_version,
                    session.sync_state,
                    session.sync_error,
                ],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }
}

#[tauri::command]
pub fn start_practice_segment(
    store: State<'_, PracticeStore>,
    session: NewPracticeSegment,
) -> Result<(), String> {
    Uuid::parse_str(&session.session_id).map_err(|_| "Invalid practice session ID.".to_string())?;
    if !(0.5..=2.0).contains(&session.playback_speed) {
        return Err("Playback speed must be between 0.5x and 2.0x.".to_string());
    }
    if let (Some(start), Some(end)) = (session.loop_start_ms, session.loop_end_ms) {
        if end <= start {
            return Err("The A-B loop end must be after its start.".to_string());
        }
    }

    let mut segments = store
        .active_segments
        .lock()
        .map_err(|_| "Practice timing is unavailable.".to_string())?;
    segments.insert(
        session.session_id.clone(),
        ActiveSegment {
            session: Some(session),
            ..ActiveSegment::default()
        },
    );
    Ok(())
}

#[tauri::command]
pub fn sample_practice_playback(
    store: State<'_, PracticeStore>,
    session_id: String,
    position_seconds: f64,
    is_playing: bool,
    is_seeking: bool,
    is_buffering: bool,
) -> Result<(), String> {
    if !position_seconds.is_finite() || position_seconds < 0.0 {
        return Err("Invalid audio playback position.".to_string());
    }

    let mut segments = store
        .active_segments
        .lock()
        .map_err(|_| "Practice timing is unavailable.".to_string())?;
    let segment = segments
        .get_mut(&session_id)
        .ok_or_else(|| "Practice segment is not active.".to_string())?;
    let now = Instant::now();

    if let (Some(previous_time), Some(previous_position)) =
        (segment.last_sample_at, segment.last_position_seconds)
    {
        let elapsed = now.duration_since(previous_time);
        if is_sample_interval_eligible(elapsed, is_playing, is_seeking, is_buffering) {
            let session = segment
                .session
                .as_ref()
                .ok_or_else(|| "Practice segment metadata is unavailable.".to_string())?;
            let movement = position_seconds - previous_position;
            let (media_movement, looped) = adjusted_media_movement(
                movement,
                previous_position,
                position_seconds,
                session.loop_start_ms,
                session.loop_end_ms,
            );
            let expected_movement = elapsed.as_secs_f64() * session.playback_speed;
            if is_normal_playback_advance(media_movement, expected_movement) {
                segment.duration += elapsed;
                if looped {
                    segment.loop_repetitions = segment.loop_repetitions.saturating_add(1);
                }
            }
        }
    }

    segment.last_sample_at = Some(now);
    segment.last_position_seconds = if is_playing && !is_seeking && !is_buffering {
        Some(position_seconds)
    } else {
        None
    };
    Ok(())
}

#[tauri::command]
pub fn finish_practice_segment(
    store: State<'_, PracticeStore>,
    session_id: String,
    ended_at: String,
    sharing_enabled: bool,
) -> Result<Option<PracticeSession>, String> {
    let mut segments = store
        .active_segments
        .lock()
        .map_err(|_| "Practice timing is unavailable.".to_string())?;
    let Some(mut segment) = segments.remove(&session_id) else {
        return Ok(None);
    };
    let Some(metadata) = segment.session.take() else {
        return Ok(None);
    };
    let duration_seconds = segment.duration.as_secs();
    if duration_seconds == 0 {
        return Ok(None);
    }

    let session = PracticeSession {
        session_id: metadata.session_id,
        team_id: metadata.team_id,
        user_id: metadata.user_id,
        song_id: metadata.song_id,
        arrangement_id: metadata.arrangement_id,
        lineup_item_id: metadata.lineup_item_id,
        device_id: metadata.device_id,
        started_at: metadata.started_at,
        ended_at,
        actual_practice_duration_seconds: duration_seconds,
        playback_speed: metadata.playback_speed,
        loop_start_ms: metadata.loop_start_ms,
        loop_end_ms: metadata.loop_end_ms,
        loop_repetitions: segment.loop_repetitions,
        schema_version: "1.0".to_string(),
        sync_state: if sharing_enabled {
            "pending".to_string()
        } else {
            "private".to_string()
        },
        sync_error: None,
    };
    store.save(&session)?;
    Ok(Some(session))
}

#[tauri::command]
pub fn get_pending_practice_sessions(
    store: State<'_, PracticeStore>,
) -> Result<Vec<PracticeSession>, String> {
    let connection = store
        .connection
        .lock()
        .map_err(|_| "Local practice database is unavailable.".to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT session_id, team_id, user_id, song_id, arrangement_id, lineup_item_id,
                    device_id, started_at, ended_at, actual_practice_duration_seconds,
                    playback_speed, loop_start_ms, loop_end_ms, loop_repetitions,
                    schema_version, sync_state, sync_error
             FROM practice_sessions WHERE sync_state IN ('pending', 'error')",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(PracticeSession {
                session_id: row.get(0)?,
                team_id: row.get(1)?,
                user_id: row.get(2)?,
                song_id: row.get(3)?,
                arrangement_id: row.get(4)?,
                lineup_item_id: row.get(5)?,
                device_id: row.get(6)?,
                started_at: row.get(7)?,
                ended_at: row.get(8)?,
                actual_practice_duration_seconds: row.get(9)?,
                playback_speed: row.get(10)?,
                loop_start_ms: row.get(11)?,
                loop_end_ms: row.get(12)?,
                loop_repetitions: row.get(13)?,
                schema_version: row.get(14)?,
                sync_state: row.get(15)?,
                sync_error: row.get(16)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_local_practice_history(
    store: State<'_, PracticeStore>,
    user_id: String,
    team_id: String,
) -> Result<Vec<PracticeSession>, String> {
    let connection = store
        .connection
        .lock()
        .map_err(|_| "Local practice database is unavailable.".to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT session_id, team_id, user_id, song_id, arrangement_id, lineup_item_id,
                    device_id, started_at, ended_at, actual_practice_duration_seconds,
                    playback_speed, loop_start_ms, loop_end_ms, loop_repetitions,
                    schema_version, sync_state, sync_error
             FROM practice_sessions
             WHERE user_id = ?1 AND team_id = ?2
             ORDER BY started_at DESC LIMIT 50",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![user_id, team_id], |row| {
            Ok(PracticeSession {
                session_id: row.get(0)?,
                team_id: row.get(1)?,
                user_id: row.get(2)?,
                song_id: row.get(3)?,
                arrangement_id: row.get(4)?,
                lineup_item_id: row.get(5)?,
                device_id: row.get(6)?,
                started_at: row.get(7)?,
                ended_at: row.get(8)?,
                actual_practice_duration_seconds: row.get(9)?,
                playback_speed: row.get(10)?,
                loop_start_ms: row.get(11)?,
                loop_end_ms: row.get(12)?,
                loop_repetitions: row.get(13)?,
                schema_version: row.get(14)?,
                sync_state: row.get(15)?,
                sync_error: row.get(16)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_practice_sync_state(
    store: State<'_, PracticeStore>,
    session_id: String,
    sync_state: String,
    sync_error: Option<String>,
) -> Result<(), String> {
    if !["pending", "synced", "error", "private"].contains(&sync_state.as_str()) {
        return Err("Invalid practice synchronization state.".to_string());
    }
    let connection = store
        .connection
        .lock()
        .map_err(|_| "Local practice database is unavailable.".to_string())?;
    connection
        .execute(
            "UPDATE practice_sessions SET sync_state = ?1, sync_error = ?2 WHERE session_id = ?3",
            params![sync_state, sync_error, session_id],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn make_pending_practice_private(store: State<'_, PracticeStore>) -> Result<(), String> {
    let connection = store
        .connection
        .lock()
        .map_err(|_| "Local practice database is unavailable.".to_string())?;
    connection
        .execute(
            "UPDATE practice_sessions SET sync_state = 'private', sync_error = NULL
             WHERE sync_state IN ('pending', 'error')",
            [],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn adjusted_media_movement(
    movement: f64,
    previous_position: f64,
    position: f64,
    loop_start_ms: Option<u64>,
    loop_end_ms: Option<u64>,
) -> (f64, bool) {
    if movement >= 0.0 {
        return (movement, false);
    }
    let (Some(start), Some(end)) = (loop_start_ms, loop_end_ms) else {
        return (movement, false);
    };
    let start = start as f64 / 1000.0;
    let end = end as f64 / 1000.0;
    if previous_position >= end - 0.75 && position <= start + 0.75 {
        ((end - previous_position) + (position - start), true)
    } else {
        (movement, false)
    }
}

fn is_normal_playback_advance(media_movement: f64, expected_movement: f64) -> bool {
    let tolerance = (expected_movement * 0.35).max(0.35);
    media_movement > 0.0
        && (media_movement - expected_movement).abs() <= tolerance
        && media_movement <= expected_movement * 1.5 + 0.25
}

fn is_sample_interval_eligible(
    elapsed: Duration,
    is_playing: bool,
    is_seeking: bool,
    is_buffering: bool,
) -> bool {
    is_playing && !is_seeking && !is_buffering && elapsed <= Duration::from_secs(2)
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::{
        PracticeSession, PracticeStore, adjusted_media_movement, is_normal_playback_advance,
        is_sample_interval_eligible,
    };
    use uuid::Uuid;

    #[test]
    fn counts_wall_clock_playback_at_half_speed() {
        assert!(is_normal_playback_advance(0.5, 0.5));
    }

    #[test]
    fn excludes_stalls_and_discontinuous_seeks() {
        assert!(!is_normal_playback_advance(0.0, 1.0));
        assert!(!is_normal_playback_advance(20.0, 1.0));
        assert!(!is_normal_playback_advance(-5.0, 1.0));
    }

    #[test]
    fn recognizes_a_b_loop_wrap() {
        let (movement, looped) = adjusted_media_movement(-7.8, 10.9, 3.1, Some(3000), Some(11000));
        assert!(looped);
        assert!((movement - 0.2).abs() < 0.0001);
    }

    #[test]
    fn excludes_pauses_buffering_seeks_and_long_sampling_gaps() {
        assert!(is_sample_interval_eligible(
            Duration::from_secs(1),
            true,
            false,
            false
        ));
        assert!(!is_sample_interval_eligible(
            Duration::from_secs(1),
            false,
            false,
            false
        ));
        assert!(!is_sample_interval_eligible(
            Duration::from_secs(1),
            true,
            true,
            false
        ));
        assert!(!is_sample_interval_eligible(
            Duration::from_secs(1),
            true,
            false,
            true
        ));
        assert!(!is_sample_interval_eligible(
            Duration::from_secs(3),
            true,
            false,
            false
        ));
    }

    #[test]
    fn stores_completed_practice_in_local_sqlite() {
        let path = std::env::temp_dir().join(format!("rol-practice-{}.sqlite", Uuid::new_v4()));
        let store = PracticeStore::open(&path).expect("open local practice store");
        let session_id = Uuid::new_v4().to_string();
        store
            .save(&PracticeSession {
                session_id: session_id.clone(),
                team_id: Uuid::new_v4().to_string(),
                user_id: Uuid::new_v4().to_string(),
                song_id: Uuid::new_v4().to_string(),
                arrangement_id: None,
                lineup_item_id: None,
                device_id: Uuid::new_v4().to_string(),
                started_at: "2026-01-01T10:00:00Z".to_string(),
                ended_at: "2026-01-01T10:00:05Z".to_string(),
                actual_practice_duration_seconds: 4,
                playback_speed: 1.0,
                loop_start_ms: None,
                loop_end_ms: None,
                loop_repetitions: 0,
                schema_version: "1.0".to_string(),
                sync_state: "private".to_string(),
                sync_error: None,
            })
            .expect("save local practice session");

        let connection = store.connection.lock().expect("lock local practice store");
        let state: String = connection
            .query_row(
                "SELECT sync_state FROM practice_sessions WHERE session_id = ?1",
                [&session_id],
                |row| row.get(0),
            )
            .expect("read saved practice session");
        assert_eq!(state, "private");
        drop(connection);
        drop(store);
        std::fs::remove_file(path).expect("remove temporary local practice database");
    }
}
