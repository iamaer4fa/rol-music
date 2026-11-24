export type AccessRole = 'admin' | 'worship_leader' | 'worship_team_director' | 'member'

export function canManageTeam(role: string | null): boolean {
  return role === 'admin' || role === 'worship_leader'
}

export function canViewPracticeReports(role: string | null): boolean {
  return canManageTeam(role) || role === 'worship_team_director'
}
