import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('database migration security', () => {
  it('defines team-scoped RLS for lineup assignments and history', () => {
    const migration = readFileSync(
      'src-tauri/src/db/20261124_priority1_worship_workflow.sql',
      'utf8',
    )
    expect(migration).toContain('ALTER TABLE public.lineup_assignments ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('public.is_active_team_member(team_id)')
    expect(migration).toContain('lineup_change_history_leader_insert')
  })
})
