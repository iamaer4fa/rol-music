# ROL Worship Team — Application Build Instruction

## 1. Project Mission

Build **ROL Worship Team**, a desktop application that serves as a shared workspace for a church worship team.

The primary purpose is to help members learn, review, practice, and prepare songs for weekly Sunday services. The application should make it easy for members to access the same song library, view the current service lineup, study lyrics and chords, practice with audio, and communicate relevant musical suggestions.

The team may include:

- Worship Leader
- Worship Team Director
- Lead Guitar
- Rhythm Guitar
- Keyboard
- Bass
- Vocals (Backup)
- Drums
- Other team members

A typical Sunday service may require four to five or more songs. The application must make weekly preparation and repeated practice straightforward.

Build a reliable rehearsal workspace, not a generic social network or an overly complicated church-management system.

Prioritize:

1. Shared song library and arrangements.
2. Weekly service lineups.
3. Readable lyrics and chord notation.
4. Useful audio practice features.
5. Reliable offline operation.
6. Secure synchronization between team members.
7. Privacy-respecting practice reports for authorized leadership.
8. Simple collaboration and announcements.

Do not introduce features that do not directly support these objectives.

## 2. Technology Stack and Architecture

Use the following architecture:

### Desktop application

- **Tauri v2** for the desktop application shell.
- **Rust** for native application services, database access, local storage, synchronization, and other backend operations.
- **React + TypeScript + Vite** for the frontend.
- Support Windows and Ubuntu Linux as initial desktop platforms.

### Shared backend

Use **Supabase** for:

- PostgreSQL database.
- Authentication.
- Row-Level Security (RLS).
- Realtime updates.
- Optional file storage.

Supabase PostgreSQL is the authoritative source for shared team information.

### Local storage

Use **SQLite** on each computer for:

- Cached songs and arrangements.
- Cached published lineups.
- Local practice records.
- Pending synchronization operations.
- User-specific settings.
- Local media references.
- Offline access to previously synchronized information.

Each installation must have its own SQLite database. Never use a shared SQLite file over a network as the multiuser database.

### Music and audio

Use:

- **ChordPro** as the preferred format for lyrics and chord notation.
- **WaveSurfer.js** for audio visualization and practice-player features where appropriate.
- Local MP3 and WAV files as the primary audio sources for the first release.

External media links, including YouTube links, may be associated with songs. Open external links in the browser when direct embedding or playback is unavailable or restricted.

Do not promise reliable A-B looping, playback-speed adjustment, or practice-time tracking for external streaming services. Those features must work with locally accessible audio files.

### Security rules

- Never embed a Supabase service-role key or other privileged backend secret in the desktop application.
- A public/publishable client key may be included only with properly configured RLS.
- Do not treat a locally selected name, instrument, or role as authorization.
- Authenticate users and enforce permissions in PostgreSQL.
- Store authentication credentials using an appropriate secure mechanism.
- Do not use GitHub as the application's shared database or messaging backend. GitHub may host the source code, migrations, documentation, and release packages.

Keep the backend and synchronization layers modular so the application can move to another PostgreSQL hosting arrangement later if necessary.

## 3. Database Design

Design the shared database before building the complete user interface. Use migrations for all schema changes.

All shared records must be scoped to a `team_id`, even if the first installation serves only one team.

### 3.1 Teams

Create a `teams` table.

Include:

- Team ID.
- Team name.
- Description, if needed.
- Created and updated timestamps.
- Active status.

### 3.2 Profiles

Create a `profiles` table associated with authenticated Supabase users.

Include:

- User ID.
- Display name.
- Email or account reference as appropriate.
- Profile image reference, optional.
- Preferred instrument or musical role.
- Created and updated timestamps.

Do not expose unnecessary personal account information to other members.

### 3.3 Team Membership and Roles

Create a `team_members` table.

Include:

- Team ID.
- User ID.
- Access role.
- Musical roles or instruments.
- Membership status.
- Date joined.
- Created and updated timestamps.

Distinguish between **application access roles** and **musical roles**.

Application access roles:

- `worship_leader`
- `worship_team_director`
- `member`

Musical roles may include:

- Lead Guitar
- Rhythm Guitar
- Keyboard
- Bass
- Backup Vocals
- Drums
- Other

A member may have multiple musical roles. Musical roles must never grant application permissions.

Do not allow users to promote themselves to Worship Leader or Worship Team Director.

### 3.4 Team Settings

Create a `team_settings` table with one settings record per team.

Include:

- `team_id`
- `iana_timezone`
- `week_starts_on`
- `service_day_of_week`
- `service_cutoff_time`
- Created and updated timestamps.

Requirements:

- Store the team's IANA timezone, not a fixed UTC offset.
- Set Monday as the default week start.
- Make the week start configurable by an authorized leader.
- Use ISO weekday numbering for `week_starts_on`: Monday = 1 through Sunday = 7.
- Default `service_day_of_week` to Sunday (7).
- Default `service_cutoff_time` to 09:00.
- Validate the timezone against PostgreSQL's available IANA timezone names.

Use `Asia/Manila` as the initial default when setting up a team in the Philippines, but allow the team timezone to be changed.

The team timezone is authoritative for service dates, weekly reporting, and dashboard date ranges. Never use an individual computer's timezone to determine the team's reporting week.

### 3.5 Songs

Create a `songs` table.

Include:

- Song ID.
- Team ID.
- Title.
- Artist or original source.
- ChordPro lyrics and chord data.
- Default musical key.
- Tempo (BPM), when known.
- Time signature.
- Song notes.
- Created by.
- Created and updated timestamps.
- Revision number.
- Active or archived status.

Songs must remain useful even when no audio file is attached.

### 3.6 Song Arrangements

Create a `song_arrangements` table.

Include:

- Arrangement ID.
- Song ID.
- Arrangement name.
- Key.
- Capo position.
- Tempo override.
- Time-signature override.
- Performance notes.
- Created and updated timestamps.

Allow a song to have different arrangements for different services or musical preferences.

### 3.7 Song Media

Create a `song_media` table.

Include:

- Song ID.
- Media type.
- External URL or local-file reference.
- Optional Supabase storage reference.
- Attribution or source information.
- Description.

Allow more than one media reference per song.

Do not assume that all members have the same local audio-file paths. Each member may associate their own local audio file with a shared song.

### 3.8 Song Tags

Create a `song_tags` table or appropriate song-to-tag relationship.

Support tags such as:

- Worship
- Praise
- Christmas
- Easter
- Communion
- Opening
- Closing
- Special Service

Use tags to make the song catalog easier to search and organize.

### 3.9 Lineups

Create a `lineups` table.

Include:

- Lineup ID.
- Team ID.
- Service date.
- Service title.
- Status: draft, published, or archived.
- Created by.
- Published timestamp.
- Version number.

The Worship Leader is responsible for publishing the official lineup.

A published lineup must represent a stable version. Changes to the song catalog must not silently change a previously published lineup.

### 3.10 Lineup Items

Create a `lineup_items` table.

Include:

- Lineup ID.
- Song ID.
- Position in the lineup.
- Selected arrangement.
- Key override.
- Tempo override.
- Transition notes.
- Optional published snapshot data.

Support adding, removing, reordering, and configuring songs in a lineup.

When a published lineup is corrected, create a new revision rather than silently changing the previously published version.

### 3.11 Collaboration Tables

Create:

**`team_posts`**

For announcements, suggestions, and general team discussions.

Include:

- Team ID.
- Author.
- Post type.
- Message body.
- Optional parent post.
- Optional song or lineup reference.
- Created and updated timestamps.

**`song_comments`**

For song-specific comments and suggestions.

Include:

- Song ID.
- Optional song section reference.
- Author.
- Comment body.
- Created and updated timestamps.

Start with contextual comments and announcements. Do not build a complex chat platform in the first release.

### 3.12 Practice Sessions

Create a shared PostgreSQL table named `practice_sessions`.

This table is required in the first release because authorized leadership must be able to view team practice summaries when members have agreed to share their practice activity.

Each record represents one practice segment for one song using one playback configuration.

Required fields:

| Field | Purpose |
|---|---|
| `session_id` | Client-generated UUID; primary key and idempotency key |
| `team_id` | Owning team |
| `user_id` | Authenticated member who practiced |
| `song_id` | Song being practiced |
| `arrangement_id` | Optional arrangement reference |
| `lineup_item_id` | Optional reference to a service lineup item |
| `device_id` | Stable, locally generated UUID for the application installation |
| `started_at` | Segment start timestamp, stored as `timestamptz` |
| `ended_at` | Segment end timestamp, stored as `timestamptz` |
| `actual_practice_duration_seconds` | Counted real playback time in seconds |
| `playback_speed` | Playback speed used for this segment |
| `loop_start_ms` | A-B loop start position in milliseconds; nullable |
| `loop_end_ms` | A-B loop end position in milliseconds; nullable |
| `loop_repetitions` | Number of completed loop repetitions |
| `schema_version` | Version of the local practice-record format |
| `created_at` | Server-side record creation timestamp |

Database requirements:

- `session_id` must be a UUID primary key. Its primary-key constraint also provides the required uniqueness constraint for synchronization.
- Generate `session_id` on the client before saving the completed record locally.
- Persist the same UUID in SQLite and PostgreSQL. Never generate a new UUID when retrying an upload.
- `device_id` must be a random UUID generated once per application installation and persisted locally. Do not collect or derive hardware serial numbers or other hardware-fingerprinting identifiers.
- Store timestamps as `timestamptz`.
- Store actual duration as an integer number of seconds, with a nonnegative constraint.
- Store playback speed as a numeric value and enforce the range supported by the player.
- If A-B looping is disabled, both loop bounds must be `NULL`.
- If A-B looping is enabled, both loop bounds must be present, the start must be nonnegative, and the end must be greater than the start.
- Store loop positions relative to the associated local audio file.
- Store the playback speed and loop bounds in the shared row, not only in SQLite.
- Validate `schema_version` before accepting uploaded records.

A session record must represent one consistent playback configuration. If the member changes the song, playback speed, or A-B loop bounds, close the current record and start a new record with a new client-generated `session_id`.

Pausing and resuming playback with the same configuration may remain within the same record. Paused time must not be included in the duration.

The purpose of these records is to provide useful rehearsal information, not to monitor or rank the worth or commitment of individual members.

## 4. Privacy, Consent, and Practice Data Ownership

Practice history is personal information within the team context. Do not assume members automatically agree to share it simply because they use the application.

### First-use consent

Before the first practice session can be synchronized, present a clear consent explanation.

Explain:

- Which practice information is shared.
- That Worship Team Directors and Worship Leaders can view shared team practice records.
- That the information may be used for team and song practice summaries.
- That sharing is optional.
- How to disable sharing.
- That practice reports are not proof of attention, attendance, or musical performance.

Require an explicit opt-in. Do not treat silence, first login, or acceptance of general application terms as consent to share practice records.

Store consent information in `team_members`, including:

- `practice_sharing_enabled` — boolean, default `false`.
- `practice_sharing_consent_at` — timestamp of consent.
- `practice_sharing_consent_version` — version of the consent wording.

A member who declines consent must still be able to use the practice player and keep a local practice history.

### Per-member privacy control

Provide an accessible setting named **Share my practice activity with team leadership**.

Members may turn it off at any time.

When disabled:

- Stop uploading new practice records.
- Keep the member's practice history locally.
- Do not upload pending private practice records.
- Exclude that member's practice records from leadership reports.
- Hide that member's previously shared practice records from leadership queries through RLS.

Turning sharing off must not silently delete append-only server records. Explain this behavior in the privacy settings.

If a member later enables sharing again, require explicit confirmation. Do not automatically upload previously private, locally queued records without a separate confirmation.

## 5. Authentication, Authorization, and RLS

Permissions must be enforced by Supabase PostgreSQL RLS, not merely by hiding frontend controls.

### General access

**Worship Leader**

- Manage songs and arrangements.
- Create and manage lineups.
- Publish official lineups.
- Manage relevant team content and settings.
- Read consented team practice records.

**Worship Team Director**

- Review songs and lineups.
- Add arrangement suggestions and rehearsal notes.
- Suggest lineup changes.
- View the authorized team practice overview.
- Read consented team practice records.

**Members**

- View the shared song library.
- View published lineups.
- Practice songs.
- Add permitted comments and suggestions.
- View their own practice history.
- Manage their own practice-sharing preference.

Instrument assignments must not create elevated application permissions.

### Practice session RLS policies

Implement explicit policies for `practice_sessions`.

**INSERT**

An authenticated member may insert a practice record only when:

- `user_id = auth.uid()`.
- The user has an active membership in the specified `team_id`.
- The member's `practice_sharing_enabled` setting is true.
- The record references a valid song belonging to the same team.
- The record passes the schema and field validation rules.

A member must never be able to insert a record on behalf of another member.

**SELECT**

- Members may SELECT their own practice records.
- Worship Leader and Worship Team Director may SELECT consented practice records belonging to their team.
- Leadership access must be limited to active team membership and team scope.
- Leadership queries must exclude members whose `practice_sharing_enabled` setting is false.

**UPDATE and DELETE**

`practice_sessions` is append-only.

- Do not grant application users UPDATE permission on this table.
- Do not grant application users DELETE permission on this table.
- Do not implement remote editing or deletion of submitted practice sessions.
- Use RLS and database privileges to enforce this restriction, not just frontend controls.

Use narrowly scoped functions or RPCs when needed for consent changes or validated synchronization. Do not expose privileged database operations to the desktop client.

## 6. Synchronization and Offline Operation

Treat Supabase PostgreSQL as the shared source of truth and SQLite as the local cache and offline workspace.

Implement:

- Local caching of synchronized songs and lineups.
- Local storage of practice sessions.
- A synchronization outbox.
- Stable client-generated UUIDs for queued records.
- Retry behavior for temporary network failures.
- Clear pending, synchronized, private/local-only, and error states.
- Schema migrations.
- Conflict detection.
- Synchronization timestamps.

A member must be able to access previously synchronized songs and practice them without an internet connection.

### Idempotent practice-session synchronization

Use `session_id` as the synchronization idempotency key.

The required database behavior is:

```sql
INSERT INTO public.practice_sessions (
    session_id,
    team_id,
    user_id,
    song_id,
    arrangement_id,
    lineup_item_id,
    device_id,
    started_at,
    ended_at,
    actual_practice_duration_seconds,
    playback_speed,
    loop_start_ms,
    loop_end_ms,
    loop_repetitions,
    schema_version
)
VALUES (
    -- validated values from the local record
)
ON CONFLICT (session_id) DO NOTHING
RETURNING session_id;
```

Interpret the result as follows:

- One returned row: the record was newly inserted.
- Zero returned rows / zero affected rows: the session ID already exists and the record has already been uploaded.

Before marking a duplicate as synchronized, verify that the existing record belongs to the same authenticated user and team and matches the immutable session payload. If the existing record cannot be verified or its data differs, retain the local record and report a synchronization conflict.

Do not implement this using an upsert that updates an existing practice session. A retry must never overwrite an existing record.

The Supabase client may call a narrowly scoped database RPC to implement these exact semantics. The database operation must remain `INSERT ... ON CONFLICT (session_id) DO NOTHING`, not an update.

Keep the original `session_id` through every retry. Never create a replacement ID for an already-recorded local session.

If the member's consent is disabled, mark pending practice records as local-only and do not submit them.

Never silently discard an unsynchronized record.

## 7. Music Practice Player

The practice player is one of the most important features of the application.

It should help members learn the song, understand its structure, and repeat difficult sections.

### Song display

Display:

- Song title.
- Artist or source.
- Key.
- Capo.
- Tempo.
- Time signature.
- Lyrics.
- Chords.
- Song sections.
- Selected arrangement.
- Relevant notes.

Use ChordPro rendering for lyrics and chord positioning.

Provide comfortable, readable text sizing for members who may be viewing the screen while playing an instrument.

### Playback features

For local audio files, implement:

- Play and pause.
- Seek and timeline controls.
- A-B loop markers.
- Repeat selected sections.
- Playback-speed adjustment.
- Current playback position.
- Optional waveform visualization.
- Loop repetition counter.

Allow members to practice a difficult verse, chorus, bridge, introduction, or other song section repeatedly.

Store the chosen playback speed and active loop boundaries in each synchronized practice record.

External links may open in the browser when the application cannot reliably control playback. Do not falsely report external playback activity as measured practice time.

### Exact practice-time calculation

Define `actual_practice_duration_seconds` consistently across Windows and Linux.

For v1, the value represents **real elapsed playback time while the local audio player is demonstrably advancing**. It does not represent media duration, estimated attention, or total time that the application window is open.

Implement the following algorithm:

1. When local audio playback starts, create a local practice-record segment with a client-generated `session_id`.
2. Use a Rust monotonic clock to measure elapsed wall-clock time. Do not calculate duration by subtracting system clock timestamps.
3. Sample the audio playback position approximately once per second.
4. Count an interval only when the player is in the playing state and the media position has advanced normally during that interval.
5. Do not count an interval when playback is paused, buffering, stalled, ended, or in an error state.
6. Do not count large gaps between samples. If the sampling gap exceeds two seconds, reset the playback-position baseline and exclude the missed interval. This prevents system suspension or long application stalls from being counted as practice.
7. Treat a recognized A-B loop wrap as continuous playback, not as a backward seek.
8. Detect manual seeks and other discontinuities. Do not count a position jump as playback time.
9. When playback is paused, stop accumulating time. Resume accumulation only after playback is actually advancing again.
10. When the member changes the song, playback speed, or A-B loop bounds, close the current record and start another record with a new UUID.
11. At the end of a segment, save its accumulated duration and metadata to SQLite.
12. Synchronize the completed record only when sharing is enabled and a network connection is available.

Count actual wall-clock seconds, not media-position seconds. For example, ten minutes of playback at 0.5x speed counts as ten minutes of practice time, not twenty minutes.

The application must not count:

- Time spent with the application open but no audio playing.
- Paused playback.
- Buffering or stalled playback.
- Time after playback has ended.
- Time spent waiting before pressing Play.
- Time during operating-system suspension or an unobserved sampling gap.

A member may be practicing an instrument while using the chord display without playing audio. V1 must not pretend to measure that activity. A future manually started practice timer may be considered, but it must be identified as a separate self-recorded metric rather than mixed with measured playback time.

Practice-time tracking must not be described as proof that a member was attentive throughout playback.

### Local and shared practice history

Always preserve the member's personal practice history locally.

Store:

- Song practiced.
- Practice segment date and duration.
- Playback speed.
- Selected A-B loop interval.
- Number of completed loop repetitions.
- Device identifier.
- Synchronization state.

When the member has opted in, synchronize the same session metadata to `practice_sessions`.

When sharing is disabled, personal practice history remains local-only.

### Practice interface

Keep the interface focused and uncomplicated.

Do not develop complex analytics dashboards in the practice-player feature. The Director's reporting requirements belong in the Dashboard section and are specified separately below.

## 8. Collaboration and Announcements

Support basic communication related to worship-team preparation.

Include:

- Team announcements.
- Song-specific comments.
- Arrangement suggestions.
- Lineup suggestions.
- Rehearsal notes.
- Simple replies where appropriate.

Show the author's display name and timestamp.

Use Supabase Realtime to notify connected clients of new announcements, comments, and lineup publication events.

Realtime events must refresh records from the database. Never treat an ephemeral realtime event as the only stored copy of a message.

Do not build a full chat application in v1. Defer direct messages, typing indicators, presence, reactions, and complex threaded discussions until the core application is reliable.

## 9. Initial Application Screens and Dashboard

Build the following screens.

### 9.1 Sign In

- Supabase authentication.
- Clear sign-in and sign-out states.
- Useful error messages.
- Team membership retrieval.
- No self-selected access roles.

Present the practice-sharing consent explanation before the first practice synchronization.

### 9.2 Home Dashboard

Show information appropriate to the signed-in member:

- Upcoming Sunday service.
- Current published lineup.
- Recently added or updated songs.
- Recent team announcements.
- Pending suggestions or relevant comments.
- Personal practice summary.
- Synchronization status.

A normal member must not see other members' individual practice hours or private practice records.

### 9.3 Song Catalog

Provide:

- Search by title, artist, tag, key, and other useful metadata.
- Filters.
- Song detail access.
- Arrangement selection.
- Media links.
- Clear indication of available local or external audio.

### 9.4 Song Detail

Show:

- Lyrics and chords.
- ChordPro rendering.
- Key and capo.
- Tempo and time signature.
- Song sections.
- Arrangements.
- Audio references.
- Notes and comments.
- Practice launch control.

### 9.5 Weekly Lineup

Allow the Worship Leader to:

- Create a draft lineup.
- Add and remove songs.
- Reorder songs.
- Select arrangements.
- Change keys and tempos.
- Add transition notes.
- Publish the official lineup.

Other members may view the published lineup and relevant updates.

Calculate the upcoming service date using the team's timezone and service settings.

With the default Sunday service and 09:00 cutoff:

- Sunday before 09:00: the current Sunday is the upcoming service.
- Sunday at or after 09:00: the next Sunday is the upcoming service.
- Monday through Saturday: the next Sunday is the upcoming service.

Use `team_settings` so the service day and cutoff can be configured later. Do not rely on the computer's local timezone for this calculation.

### 9.6 Practice View

Include the chord-and-lyric display, local audio controls, A-B looping, playback speed, and practice history described in Section 7.

Show the local synchronization state without interrupting practice.

### 9.7 Announcements and Comments

Provide a simple view of team announcements, song comments, and suggestions.

### 9.8 Practice Overview — Leadership Only

Provide a separate **Team Practice Overview** for authorized leadership.

This view must be available only to:

- Worship Team Director.
- Worship Leader.

Normal members must not see team-wide or per-member practice reports. They may see their own practice history.

Show tables and totals for:

- Total team practice time for the selected week.
- Practice time by consenting member.
- Practice time by song.
- Recent shared practice sessions.
- Playback speed used.
- Selected loop range.
- Loop repetitions.
- Most-practiced songs during the selected period.

Provide filters for:

- Week.
- Member.
- Song.

Use team-local week boundaries as defined in `team_settings`.

Display the reporting period using the team's local dates. Do not assume every week is exactly 168 hours. Convert each local week boundary to the corresponding UTC timestamp using the configured IANA timezone. This must work correctly across daylight-saving transitions.

Only aggregate records from members who have enabled practice sharing. Do not infer that someone is inactive or has not practiced simply because no shared record exists.

### 9.9 No Shared Practice Record Panel

Provide an optional panel identifying members who have no shared practice record in the selected week.

Requirements:

- Visible only to the **Worship Team Director**.
- Disabled by default.
- Must require the Director to explicitly enable it.
- Exclude members who have disabled practice sharing or have not given consent.
- Do not include members whose records are intentionally private.
- Use the wording **No shared practice record** rather than labels such as "non-practicer" or "inactive member."

This panel is an optional leadership reference, not a public ranking or disciplinary feature.

### 9.10 Settings

Include:

- Profile information.
- Musical roles and instrument preferences.
- Practice-sharing consent and privacy switch.
- Local media locations.
- Team timezone and relevant settings for authorized roles.
- Synchronization status.
- Local cache information.
- Sign out.
- Diagnostic or export information.

### Visual and reporting approach

Use a practical, rehearsal-oriented interface:

- Clear typography.
- Comfortable text sizing.
- High-contrast chord and lyric display.
- Uncomplicated navigation.
- Muted, calm colors.
- Touch-friendly controls.
- Responsive layouts for different desktop window sizes.
- Optional dark mode after the main workflow is stable.

For v1 reporting, use **tables and totals only**. Do not add charting libraries or elaborate analytics visualizations.

The application should feel like a dependable rehearsal workspace, not a social-media feed or a performance-monitoring system.

## 10. Delivery Phases and Acceptance Criteria

Build in stages. Do not attempt to implement every feature simultaneously.

### Phase 1 — Foundation and Backend

Implement:

- Tauri v2 project foundation.
- Rust and frontend boundaries.
- React, TypeScript, and Vite.
- Supabase configuration.
- Authentication.
- Team membership and roles.
- Shared PostgreSQL schema.
- RLS policies.
- Database migrations.
- Local SQLite.
- Local cache and synchronization foundation.
- Initial settings and profile management.

Acceptance criteria:

- A user can sign in and sign out.
- The application retrieves the user's actual team membership and access role.
- Unauthorized users cannot access protected team information.
- RLS blocks unauthorized database operations even when called outside the frontend.
- The application can create and migrate its local SQLite database.
- The application can retrieve shared songs and lineup data from Supabase.
- No privileged backend key is present in the desktop application.

### Phase 2 — Song Library and Lineup

Implement:

- Song catalog.
- Song search and filtering.
- ChordPro song data and rendering.
- Song arrangements.
- Song media references.
- Weekly lineups.
- Lineup editing and publication.
- Published lineup revisions.
- Basic announcements and contextual song comments.
- Offline access to previously synchronized songs and published lineups.

Acceptance criteria:

- Members can browse and search the shared song catalog.
- Members can view lyrics, chords, and song metadata.
- Members can access associated external media links.
- The Worship Leader can create, edit, and publish an official lineup.
- Other members can view the published lineup.
- A published lineup remains stable when catalog information changes.
- Previously synchronized songs and lineups remain accessible offline.

### Phase 3 — Practice Room and Practice Reporting

Implement this phase as three separately testable deliverables. Passing one does not automatically mean the other two are complete.

#### Phase 3a — Offline Practice Recording

Implement:

- Local audio playback.
- Playback-speed adjustment.
- A-B loop selection.
- Loop repetition counter.
- ChordPro practice display.
- Local practice session recording.
- The exact active-playback duration algorithm in Section 7.
- Local practice history.
- Local device UUID.
- Local schema versioning.

Acceptance criteria:

- A member can practice a song using a local MP3 or WAV file without an internet connection.
- The player supports the required playback and A-B loop controls.
- Playback speed and loop bounds are recorded locally.
- Paused, buffering, stalled, and idle time are excluded from duration.
- A change in song, speed, or loop configuration creates a new record with a new session UUID.
- Local records remain available after closing and reopening the application.
- The measured duration is consistent across supported Windows and Linux environments.

#### Phase 3b — Privacy-Aware, Idempotent Synchronization

Implement:

- First-use practice-sharing consent.
- Per-member practice-sharing switch.
- Local outbox.
- Offline retry behavior.
- Stable client-generated `session_id`.
- Server-side duplicate prevention.
- Append-only database behavior.
- RLS policies for practice sessions.
- Schema-version validation.

Acceptance criteria:

- Members who have not opted in can practice and retain local history without uploading it.
- Members who disable sharing do not upload new or pending private sessions.
- An opted-in member's completed practice record synchronizes when connectivity returns.
- Retrying the same session upload does not create a duplicate.
- The same `session_id` is preserved across retries and application restarts.
- The database uses `INSERT ... ON CONFLICT (session_id) DO NOTHING`.
- An existing record is verified before a duplicate is marked as synchronized.
- Members can SELECT their own records but cannot UPDATE or DELETE submitted records remotely.
- Worship Leader and Worship Team Director can SELECT consented team records.
- Unauthorized users cannot SELECT another member's private practice records.
- A failed or conflicting synchronization never silently discards the local record.

#### Phase 3c — Leadership Practice Overview

Implement:

- Team practice totals.
- Per-member practice totals.
- Per-song totals.
- Week, member, and song filters.
- Team timezone and configurable week boundaries.
- Leadership-only dashboard access.
- Optional Director-only no-shared-practice-record panel.

Acceptance criteria:

- Only Worship Team Director and Worship Leader can access the team practice overview.
- Ordinary members can see only their own practice history.
- The Director can see per-member totals only for members who have enabled sharing.
- The no-shared-practice-record panel is Director-only and disabled by default.
- Members who disabled sharing are never listed as having no shared practice record.
- Week boundaries use the team's IANA timezone and configured week start.
- Reports correctly handle daylight-saving transitions and do not use fixed 168-hour calculations.
- Playback speed and loop metadata are visible in the appropriate session and per-song views.
- All v1 reports use tables and totals, without a charting library.

### Phase 4 — Collaboration Improvements

After the core practice workflow is reliable, implement:

- Improved announcements.
- Song-specific discussions.
- Arrangement suggestions.
- Lineup suggestions.
- Better realtime updates.
- Conflict-aware collaborative editing.
- Additional export and import options.
- Optional notifications.

Consider full chat, reactions, presence, direct messages, calendar integration, cloud media storage, mobile companion applications, and advanced analytics only after real team usage demonstrates a need.

## 11. Engineering and Development Rules

Follow these rules throughout development:

1. Define the database structure and ownership rules before implementing a feature.
2. Implement authentication and RLS before relying on frontend role checks.
3. Keep personal local data separate from shared team data.
4. Define offline behavior for each operation.
5. Preserve unsynchronized data.
6. Use stable IDs for all queued writes.
7. Use database migrations rather than manual production schema changes.
8. Provide automated tests for permission boundaries.
9. Test synchronization with interrupted connectivity and repeated requests.
10. Test date and timezone calculations, including week boundaries.
11. Test the practice-time algorithm for pause, resume, buffering, looping, seeking, and application suspension.
12. Never silently overwrite a newer shared record.
13. Never silently discard a local record.
14. Avoid unnecessary dependencies.
15. Do not store privileged credentials in the client.
16. Provide useful error messages rather than exposing raw backend errors.
17. Document local development, backend configuration, migrations, seeding, backup, and restore procedures.

Keep the Rust code organized by responsibility. Suggested areas include:

- Authentication.
- Database and SQLite access.
- Shared backend access.
- Synchronization and outbox.
- Practice-session tracking.
- Audio and media integration.
- Application commands.
- Domain models and validation.

Keep the React frontend organized by feature, with reusable components and clear separation from backend operations.

Do not put all application logic into one large Rust file or one large React component.

For each development phase, provide:

- A description of the implemented feature.
- The files and modules created or changed.
- Database migrations, if applicable.
- Relevant automated tests.
- Instructions to run and verify the feature.
- Known limitations or unfinished items.

Do not claim a phase is complete until its acceptance criteria have been tested.

## 12. Final Product Objective

The first useful release must allow a worship-team member to:

1. Sign in securely.
2. View the shared song catalog.
3. Open the current Sunday lineup.
4. Read lyrics and chords.
5. Practice a song using local audio.
6. Repeat difficult sections with A-B looping.
7. Adjust playback speed.
8. Retain personal practice history while offline.
9. Choose whether to share practice activity with team leadership.
10. Synchronize shared practice records safely when online.
11. Participate in relevant team announcements and song discussions.

An authorized Worship Team Director must additionally be able to view consented team practice totals and per-member practice summaries, with correctly calculated team-local weekly periods.

The application must remain simple, dependable, privacy-respecting, and focused on helping the worship team prepare better for each service.