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

  it('grants global Admin access through RLS while protecting membership roles', () => {
    const migration = readFileSync(
      'src-tauri/src/db/20261124_admin_role_and_permissions.sql',
      'utf8',
    )
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.app_admins')
    expect(migration).toContain('public.is_app_admin()')
    expect(migration).toContain('FOR ALL TO authenticated')
    expect(migration).toContain('GRANT ALL PRIVILEGES ON TABLE public.%I TO authenticated')
    expect(migration).toContain('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain("access_role IN ('member', 'worship_team_director')")
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.register_app_admin_membership()')
    expect(migration).toContain('CREATE TRIGGER team_members_register_app_admin')
    expect(migration).toContain("target_user_id constant uuid := 'e5d9fc56-5f78-4b18-a137-51891d420df6'")
    expect(migration).toContain("lower(au.email) = lower('allan.registos@gmail.com')")

    const bootstrapIndex = migration.indexOf('Admin bootstrap stopped: the Auth user must first')
    const triggerIndex = migration.indexOf('CREATE TRIGGER team_members_guard_admin_fields')
    expect(bootstrapIndex).toBeGreaterThan(-1)
    expect(triggerIndex).toBeGreaterThan(bootstrapIndex)
  })
})
