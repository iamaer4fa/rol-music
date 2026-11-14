import { useEffect, useState } from 'react'
import { supa } from '../lib/supabase'
import { useAuth } from '../hooks/use-auth'
import '../App.css'

export default function Settings() {
  const { user } = useAuth()
  const [teamId, setTeamId] = useState('')
  const [practiceSharingEnabled, setPracticeSharingEnabled] = useState(false)
  const [ianaTimezone, setIanaTimezone] = useState('Asia/Manila')
  const [serviceDayOfWeek, setServiceDayOfWeek] = useState(7)
  const [serviceCutoffTime, setServiceCutoffTime] = useState('09:00')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.id) return

    const init = async () => {
      const tid = localStorage.getItem('team_id')
      if (tid) {
        setTeamId(tid)
        await loadTeamSettings()
      }
      setLoading(false)
    }

    init()
  }, [user?.id])

  async function loadTeamSettings() {
    try {
      const { data, error } = await supa
        .from('team_settings')
        .select('*')
        .eq('team_id', teamId)
        .single()

      if (!error && data) {
        setIanaTimezone(data.iana_timezone || 'Asia/Manila')
        setServiceDayOfWeek(data.service_day_of_week || 7)
        setServiceCutoffTime(data.service_cutoff_time || '09:00')
        // practice_sharing_enabled is on team_members, not team_settings
        // We'll check that separately
      }
    } catch (err) {
      console.error('Error loading team settings:', err)
      setError('Failed to load team settings')
    }
  }

  const togglePracticeSharing = async () => {
    const { error } = await supa
      .from('team_members')
      .update({ practice_sharing_enabled: !practiceSharingEnabled })
      .eq('user_id', user?.id)
      .eq('team_id', teamId)

    if (!error) {
      setPracticeSharingEnabled(!practiceSharingEnabled)
      if (!practiceSharingEnabled) {
        setError('Practice sharing disabled. Your practice history will remain private.')
      }
    } else {
      setError('Failed to update practice sharing preference')
    }
  }

  return (
    <div className="page-container">
      <h2>Settings</h2>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3>Practice Sharing</h3>
        <p>
          <label>
            <input
              type="checkbox"
              checked={practiceSharingEnabled}
              onChange={togglePracticeSharing}
            />
            Share my practice activity with team leadership
          </label>
        </p>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
          When enabled, Worship Team Directors and Worship Leaders can view shared team practice records. 
          Sharing is optional and can be changed at any time.
        </p>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3>Team Timezone</h3>
        <p>Current timezone: {ianaTimezone}</p>
        <p>Service day of week: {serviceDayOfWeek === 7 ? 'Sunday' : serviceDayOfWeek === 1 ? 'Monday' : 'Other'}</p>
        <p>Service cutoff time: {serviceCutoffTime}</p>
      </div>

      <div className="card">
        <h3>Musical Roles</h3>
        <p>Select your instruments (this doesn't grant application permissions):</p>
        <ul>
          <li>
            <label>
              <input type="checkbox" defaultChecked /> Lead Guitar
            </label>
          </li>
          <li>
            <label>
              <input type="checkbox" defaultChecked /> Rhythm Guitar
            </label>
          </li>
          <li>
            <label>
              <input type="checkbox" defaultChecked /> Keyboard
            </label>
          </li>
          <li>
            <label>
              <input type="checkbox" defaultChecked /> Bass
            </label>
          </li>
          <li>
            <label>
              <input type="checkbox" defaultChecked /> Backup Vocals
            </label>
          </li>
          <li>
            <label>
              <input type="checkbox" defaultChecked /> Drums
            </label>
          </li>
          <li>
            <label>
              <input type="checkbox" /> Other
            </label>
          </li>
        </ul>
      </div>

      <div className="card">
        <h3>Team Information</h3>
        <p>Team ID: {teamId}</p>
        <p>IANA Timezone: {ianaTimezone}</p>
        <p>Week starts on: Monday (default)</p>
        <p>Service day: {serviceDayOfWeek === 7 ? 'Sunday' : serviceDayOfWeek === 1 ? 'Monday' : 'Custom'}</p>
        <p>Service cutoff: {serviceCutoffTime} (default 09:00)</p>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <button onClick={() => window.alert('Settings saved')} className="btn-primary">
          Save Changes
        </button>
        <button style={{ marginLeft: '0.5rem' }} onClick={() => window.alert('Cancel')}>

          Cancel
        </button>
      </div>
    </div>
  )
}