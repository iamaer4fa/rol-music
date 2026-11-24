# ROL Worship Team
## This is pre-Alpha software, do not use in production live environments.

ROL Worship Team is a desktop application for preparing and practicing music together. It uses Tauri v2 and Rust for the desktop shell, React and TypeScript for the interface, and Supabase for authentication and shared team data.

The app includes sign-in, a home dashboard, a song catalog and song details, weekly lineups, audio practice, announcements, a practice overview, and team settings. Worship Leaders manage catalog songs and draft lineups; active team members can contribute shared media and arrangements. Supabase PostgreSQL is the shared source of team data, with Row-Level Security (RLS) policies enforcing team and role access.

## Requirements

- Node.js 20 LTS (Node.js 18 or newer) and npm
- Rust 1.90 or newer, installed with [rustup](https://rustup.rs/)
- Tauri v2 platform prerequisites:
  - **Ubuntu/Debian:** `build-essential`, `curl`, `wget`, `file`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libxdo-dev`, and `libwebkit2gtk-4.1-dev`
  - **Windows:** Microsoft C++ Build Tools and WebView2

See the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for details and other supported platforms.

## Configure Supabase

1. Create a Supabase project and configure email/password authentication.
2. In the repository root, create a `.env` file with the project URL and **publishable** client key:

   ```dotenv
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_PUBLISHABLE_KEY=<your-publishable-key>
   ```

   These names are loaded by `vite.config.ts`. `.env` is ignored by Git; do not commit credentials. Never put a Supabase secret/service-role key in the desktop app.

3. For a new database, apply [`src-tauri/src/db/20241111_initial_schema.sql`](src-tauri/src/db/20241111_initial_schema.sql) once using the Supabase SQL Editor or your migration workflow. This creates the tables and RLS policies; the application does not run this migration automatically.
4. Create an Auth user, then bootstrap that user with a profile, team, active `team_members` row, and `team_settings` row using a privileged setup path such as the SQL Editor. Assign an application access role (`worship_leader`, `worship_team_director`, or `member`); musical roles are separate. Do not rerun the initial migration on an initialized database.
5. Apply [`src-tauri/src/db/20261114_team_audio_and_member_arrangements.sql`](src-tauri/src/db/20261114_team_audio_and_member_arrangements.sql) once after the initial schema. It keeps media and arrangement access team-scoped, permits active team members to add contributions, and creates the private `team-audio` Storage bucket. It does not allow members to edit songs or change their application access roles.
6. Apply [`src-tauri/src/db/20261124_priority1_worship_workflow.sql`](src-tauri/src/db/20261124_priority1_worship_workflow.sql) to add lineup assignments and change history.
7. Apply [`src-tauri/src/db/20261124_team_membership_management.sql`](src-tauri/src/db/20261124_team_membership_management.sql) to allow Worship Leaders to add existing Supabase Auth users to their team as a member or Worship Team Director. Create/invite the Auth user first, then enter that user's Auth ID in **Settings → Team Members**. Assigning the first Worship Leader remains a privileged bootstrap action; do not make a client-side `admin` role or trust Auth user metadata as team authorization.
8. Apply [`src-tauri/src/db/20261124_unassigned_auth_users.sql`](src-tauri/src/db/20261124_unassigned_auth_users.sql) to let active Worship Leaders view Auth users who have no team membership and select them directly in **Settings → Team Members**. The function is security-definer but explicitly restricted to Worship Leaders for the requested team; it does not expose a service-role key to the client.

### Load demo content

To populate a configured team for testing, run [`src-tauri/src/db/demo_seed.sql`](src-tauri/src/db/demo_seed.sql) in the Supabase SQL Editor after the initial schema and team bootstrap are in place. It adds five public-domain hymns (including “Amazing Grace”), tags, arrangements, a published lineup, an announcement, and a sample song comment. Rerunning the updated seed replaces the five prior demo songs and updates their seeded arrangements and lineup in place; it does not create fake practice sessions or enable practice sharing.

## Install, run, and build

From the repository root:

```sh
npm ci
npx tauri dev
```

`npx tauri dev` starts the Vite frontend and opens the desktop app. To run only the frontend in a browser during UI development, use `npm run dev`.

Build the frontend or create a native desktop bundle:

```sh
npm run build
npx tauri build
```

Tauri bundles are written under `src-tauri/target/release/bundle/`. Build on the target operating system and install the platform prerequisites above.
Linux artifact basenames use the lowercase `rol_worship_team` product name; the application window continues to display “ROL Worship Team”.

To uninstall the Debian package, use its package ID (not the display name or `.deb` filename):

```sh
sudo apt remove rol-worship-team
```

Use `sudo apt purge rol-worship-team` to also remove package-managed configuration files. This does not remove per-user application data.

## Practice and lineup behavior

- Practice timing uses a Rust monotonic clock and counts only normally advancing local audio playback. Pauses, buffering, seeks, stalls, and sampling gaps over two seconds are excluded.
- Completed practice sessions are kept in a SQLite database under Tauri's application-data directory. Sharing is opt-in; pending sessions sync only with consent and network access. Disabling sharing makes pending local sessions private. Remote practice records are append-only and duplicate session IDs are checked against the full payload.
- Song details allow active team members to add YouTube/Spotify links, direct audio links, private shared audio uploads (up to 100 MB), and named arrangements with key metadata. Shared audio is available only to active members of that song's team.
- YouTube and Spotify use their provider players; external playback is not measured as practice time. Use an uploaded/local audio file or playable direct audio URL for the in-app speed and A-B loop controls and measured playback sessions. Selecting an arrangement updates its displayed key/capo/tempo metadata; automatic chord transposition is not implemented.
- Published lineups are read-only in the app. Make a replacement draft to correct a published lineup.

The current database schema does not yet store song/arrangement snapshots on published lineup items, so a catalog change made outside the app can change how an older published lineup is displayed. The app also does not yet cache songs and lineups for offline browsing; offline playback requires the audio file to be available locally.

## Project layout

- `src-tauri/src/react/` — React application, pages, hooks, and Supabase client
- `src-tauri/src/` — Rust/Tauri application code
- `src-tauri/src/db/` — database schema, migrations, and optional demo seed
- `src-tauri/tauri.conf.json` — Tauri desktop and build configuration
- `docs/spec.md` — product and architecture specification
