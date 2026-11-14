//! # Authentication Module
//!
//! Minimal authentication support using Supabase JavaScript SDK.

/// Get the current user session (handled by frontend Supabase SDK)
pub fn get_current_user() -> Option<serde_json::Value> {
    // This is handled by the frontend Supabase SDK
    None
}

/// Check if user is authenticated
pub fn is_authenticated() -> bool {
    // Check via frontend
    false
}
