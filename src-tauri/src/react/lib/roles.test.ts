import { describe, expect, it } from 'vitest'
import { canManageTeam, canViewPracticeReports } from './roles'

describe('application role permissions', () => {
  it('lets Admins and Worship Leaders manage a team', () => {
    expect(canManageTeam('admin')).toBe(true)
    expect(canManageTeam('worship_leader')).toBe(true)
    expect(canManageTeam('worship_team_director')).toBe(false)
    expect(canManageTeam('member')).toBe(false)
    expect(canManageTeam(null)).toBe(false)
  })

  it('lets Admins, Worship Leaders, and Worship Team Directors view reports', () => {
    expect(canViewPracticeReports('admin')).toBe(true)
    expect(canViewPracticeReports('worship_leader')).toBe(true)
    expect(canViewPracticeReports('worship_team_director')).toBe(true)
    expect(canViewPracticeReports('member')).toBe(false)
  })
})
