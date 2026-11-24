import { useState } from 'react'
import { useAuth } from '../hooks/use-auth'
import StatusMessage from './StatusMessage'

export default function NoTeamAccess() {
  const { user, teamMembershipError, getTeamMembership, signOut } = useAuth()
  const [notice, setNotice] = useState('')
  const [checking, setChecking] = useState(false)

  async function checkMembership() {
    setChecking(true)
    setNotice('')
    try {
      const membership = await getTeamMembership()
      setNotice(membership
        ? 'Team access is ready. Reloading your workspace…'
        : 'No active team membership was found yet.')
      if (membership) window.location.reload()
    } finally {
      setChecking(false)
    }
  }

  async function copyUserId() {
    if (!user?.id) return
    try {
      await navigator.clipboard.writeText(user.id)
      setNotice('Auth user ID copied.')
    } catch (copyError) {
      console.error('Unable to copy Auth user ID:', copyError)
      setNotice('Copy failed. Select and copy the Auth user ID shown below.')
    }
  }

  return (
    <main className="no-team-access">
      <section className="card">
        <h1>Team access is not assigned</h1>
        {teamMembershipError ? (
          <StatusMessage tone="error">{teamMembershipError}</StatusMessage>
        ) : (
          <p>
            Your account is signed in, but it does not have an active team membership.
            Ask your Worship Leader to add you in Settings → Team Members.
          </p>
        )}
        {user?.id && (
          <label>
            Your Supabase Auth user ID
            <input value={user.id} readOnly />
          </label>
        )}
        {notice && <StatusMessage tone="success">{notice}</StatusMessage>}
        <div className="no-team-actions">
          <button type="button" className="btn-secondary" onClick={() => void copyUserId()}>
            Copy user ID
          </button>
          <button type="button" className="btn-primary" onClick={() => void checkMembership()} disabled={checking}>
            {checking ? 'Checking…' : 'Check access again'}
          </button>
          <button type="button" onClick={() => void signOut()}>Sign out</button>
        </div>
        <small>
          Access is granted through an active row in the team’s membership table and enforced by
          database policies. The app does not infer a role from email or user metadata.
        </small>
      </section>
    </main>
  )
}
