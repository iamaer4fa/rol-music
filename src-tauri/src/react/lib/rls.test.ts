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

  it('lets existing leaders add members without granting client-side leader promotion', () => {
    const migration = readFileSync(
      'src-tauri/src/db/20261124_team_membership_management.sql',
      'utf8',
    )
    expect(migration).toContain("public.has_team_role(team_id, ARRAY['worship_leader']::text[])")
    expect(migration).toContain("access_role IN ('member', 'worship_team_director')")
    expect(migration).not.toContain("access_role = 'worship_leader'")
  })

  it('limits Auth user discovery to Worship Leaders and users without a membership', () => {
    const migration = readFileSync(
      'src-tauri/src/db/20261124_unassigned_auth_users.sql',
      'utf8',
    )
    expect(migration).toContain('SECURITY DEFINER')
    expect(migration).toContain("ARRAY['worship_leader']::text[]")
    expect(migration).toContain('WHERE tm.user_id = au.id')
    expect(migration).toContain('FROM PUBLIC, anon')
  })
})
