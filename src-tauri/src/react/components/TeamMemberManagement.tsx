import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supa } from '../lib/supabase'
import StatusMessage from './StatusMessage'

type TeamMember = {
  user_id: string
  access_role: 'worship_leader' | 'worship_team_director' | 'member'
  membership_status: 'active' | 'inactive' | 'invited'
  display_name: string | null
}

type UnassignedAuthUser = {
  user_id: string
  email: string | null
  display_name: string | null
  created_at: string
}

type Props = {
  teamId: string
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message
    if (typeof message === 'string') return message
  }
  if (typeof error === 'string') return error
  return 'Unknown database error.'
}

export default function TeamMemberManagement({ teamId }: Props) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [unassignedUsers, setUnassignedUsers] = useState<UnassignedAuthUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [role, setRole] = useState<'member' | 'worship_team_director'>('member')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const loadMembers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: rows, error: membersError } = await supa
        .from('team_members')
        .select('user_id, access_role, membership_status')
        .eq('team_id', teamId)
        .order('created_at')
      if (membersError) throw membersError
      const memberRows = rows ?? []
      const ids = memberRows.map((member) => member.user_id)
      const { data: profiles, error: profilesError } = ids.length
        ? await supa.from('profiles').select('id, display_name').in('id', ids)
        : { data: [], error: null }
      if (profilesError) throw profilesError
      setMembers(memberRows.map((member) => ({
        ...member,
        display_name: profiles?.find((profile) => profile.id === member.user_id)?.display_name ?? null,
      })))
      const { data: unassignedRows, error: unassignedError } = await supa.rpc(
        'list_unassigned_auth_users',
        { p_team_id: teamId },
      )
      if (unassignedError) throw unassignedError
      setUnassignedUsers((unassignedRows ?? []) as UnassignedAuthUser[])
    } catch (loadError) {
      console.error('Unable to load team members:', loadError)
      setError(`Unable to load team members: ${getErrorMessage(loadError)}`)
    } finally {
      setLoading(false)
    }
  }, [teamId])

  useEffect(() => {
    void loadMembers()
  }, [loadMembers])

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedUserId) {
      setError('Select an Auth user to add to this team.')
      return
    }
    if (members.some((member) => member.user_id === selectedUserId)) {
      setError('This Auth user is already associated with the team.')
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const { error: insertError } = await supa.from('team_members').insert({
        team_id: teamId,
        user_id: selectedUserId,
        access_role: role,
        membership_status: 'active',
        musical_roles: [],
        practice_sharing_enabled: false,
      })
      if (insertError) throw insertError
      setSelectedUserId('')
      setNotice('Team membership added. The user can sign in and will receive access under the selected role.')
      await loadMembers()
    } catch (addError) {
      console.error('Unable to add team member:', addError)
      setError(`Unable to add the member: ${getErrorMessage(addError)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card team-member-management">
      <div className="team-member-heading">
        <h3>Team Members</h3>
        <button type="button" className="btn-secondary" onClick={() => void loadMembers()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh Auth users'}
        </button>
      </div>
      <p>
        Users listed here already exist in Supabase Authentication and do not yet have a team
        membership. After creating a user in Supabase Authentication, refresh this list. New members
        start with practice sharing off. Assigning a Worship Leader role remains an owner setup
        action in Supabase.
      </p>
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
      {notice && <StatusMessage tone="success">{notice}</StatusMessage>}
      <form className="team-member-form" onSubmit={(event) => void addMember(event)}>
        <label>
          Auth users without a team role
          <select
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            required
          >
            <option value="">Select a user</option>
            {unassignedUsers.map((candidate) => (
              <option key={candidate.user_id} value={candidate.user_id}>
                {candidate.display_name || candidate.email || candidate.user_id}
                {candidate.email && candidate.display_name ? ` · ${candidate.email}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Application role
          <select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
            <option value="member">Member</option>
            <option value="worship_team_director">Worship Team Director</option>
          </select>
        </label>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Adding…' : 'Add active member'}
        </button>
      </form>
      {loading ? (
        <p>Loading team members…</p>
      ) : (
        <>
          {unassignedUsers.length === 0 && (
            <p>No Auth users without a team membership were found.</p>
          )}
          <ul className="team-member-list">
            {members.map((member) => (
              <li key={member.user_id}>
                <span>
                  <strong>{member.display_name ?? 'Profile pending'}</strong>
                  <small>{member.user_id}</small>
                </span>
                <span>{member.access_role.replace(/_/g, ' ')} · {member.membership_status}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
