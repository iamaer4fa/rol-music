# Purpose
## ROL Worship Team is a focused rehearsal workspace for church worship teams. Its core goal is to help members:

* Maintain a shared song and arrangement library.
* Prepare for scheduled services.
* Practice songs using lyrics and local/shared audio.
* Organize weekly lineups.
* Share optional practice activity with authorized leadership.
* Keep team communication simple and relevant.

The architecture and mission are documented in spec.md, README.md, and App.tsx.

## What Is Working Well
* Clear separation of application roles and musical roles.
* Team-scoped Supabase data with RLS.
* Local SQLite practice history and optional sharing.
* Published-versus-draft lineup workflow.
* Arrangement, key, tempo, and audio metadata.
* Practice privacy warnings are clear and not misleading.
* Existing desktop, song, lineup, practice, and settings areas provide a solid foundation.

# Recommended Improvements

# Priority 1: Core worship workflow

1. Add a proper Home dashboard

   * Show the next service, lineup count, and primary songs.
   * Provide direct actions such as “Open lineup” and “Practice next song.
   * Avoid separate “recent songs” and practice sections as competing priorities.

2. Improve lineup usability

   * Add drag-and-drop ordering instead of repeated move buttons.
   * Show transitions, arrangement, key, and tempo together.
   * Allow batching and searching when adding songs.
   * Prevent duplicate songs in a single lineup.
   * Add confirmation and change history for publishing or replacement drafts.

3. Build a real ChordPro renderer

   * Render chords and lyrics in columns rather than raw text.
   * Add key transposition.
   * Add font, spacing, and column controls for rehearsal displays.
   * Preserve the editable ChordPro source separately.

4. Create an upcoming-service overview

   * Combine lineup, assigned members, arrangements, and required audio.
   * Add per-member responsibilities and preparation status.

# Priority 2: Reliability and offline support

The specification requires offline operation, but HomeDashboard.tsx and the README still describe significant gaps.

* Cache songs, arrangements, lineups, and announcements in SQLite.
* Clearly indicate when data is offline or stale.
* Download shared audio intentionally for offline use.
* Retry and report failed synchronization instead of only logging errors.
* Add synchronization timestamps and conflict/version indicators.

# Priority 3: Quality and maintainability

* Replace frontend any types and shared any[] state with explicit interfaces.
* Add unit, integration, and end-to-end tests; no test suite currently exists.
* Test practice timing, timezone calculations, lineup revisions, RLS, and audio playback.
* Split large pages into smaller components and hooks.
* Introduce a typed Supabase database schema.
* Remove unused week-selector state from PracticeOverview.tsx or make it filter real data.
* Improve loading and partial-data handling across dashboard queries.

# Priority 4: Practice reporting

Practice reporting should remain privacy-centered.

* Use team time zones and configured reporting weeks.
* Show duration, frequency, and rehearsal activity rather than “attendance” or performance.
* Add clear consent text and retention behavior.
* Make leader reports exportable to CSV or PDF.
* Clarify whether a week begins on the team’s configured weekday.
* Include data ranges and sample-size counts to avoid misleading totals.

# Priority 5: User experience
* Replace inline styles with reusable CSS components.
* Use responsive card and table layouts on smaller desktop windows.
* Add visible empty states and skeleton loading.
* Improve keyboard navigation and accessible form labels.
* Use consistent success, warning, and error notifications.
* Add catalog sorting, tag filtering, and arrangement previews.
* Improve song, lineup, and announcement search.

# Important Architecture Improvements
* Support switching teams instead of assuming exactly one membership.
* The current membership lookup uses .single() in use-auth.ts, which is unsafe for users belonging to multiple teams.
* Make database migrations reproducible and validated.
* Add a migration status screen for setup issues.
* Replace client-side role assumptions with server-enforced authorization as the final source of truth.
* Add application analytics only if strictly necessary and privacy-preserving.

# Suggested Release Roadmap
1. **Alpha stabilization:** ChordPro rendering, offline cache, timezone reporting, test coverage.
2. **Beta**: Drag-and-drop lineups, team switching, downloadable audio, improved dashboard.
3. **Release candidate**: Accessibility, RLS verification, backup/sync recovery, desktop-package testing.
4. *First release:* Instrument-specific prep views, notifications, exports, and service checklists.

The strongest next step is to establish reliable offline workflows and real ChordPro rehearsal features, since both directly support the application’s stated mission.