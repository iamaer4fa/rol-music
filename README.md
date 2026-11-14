# ROL Worship Team

ROL Worship Team is a desktop application for preparing and practicing music together. It uses Tauri v2 and Rust for the desktop shell, React and TypeScript for the interface, and Supabase for authentication and shared team data.

The app currently includes sign-in, a home dashboard, a song catalog and song details, weekly lineups, practice, announcements, a practice overview, and team settings. Supabase PostgreSQL is the shared source of team data, with Row-Level Security (RLS) policies enforcing team and role access.

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

## Project layout

- `src-tauri/src/react/` — React application, pages, hooks, and Supabase client
- `src-tauri/src/` — Rust/Tauri application code
- `src-tauri/src/db/` — database schema and migrations
- `src-tauri/tauri.conf.json` — Tauri desktop and build configuration
- `docs/spec.md` — product and architecture specification
