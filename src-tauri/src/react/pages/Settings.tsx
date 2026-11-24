import { useEffect, useState, type FormEvent } from 'react'
import { supa } from '../lib/supabase'
import { useAuth } from '../hooks/use-auth'
import LoadingSkeleton from '../components/LoadingSkeleton'
import StatusMessage from '../components/StatusMessage'
import '../App.css'

const weekdays = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

export default function Settings() {
  const {
    user,
    teamId,
    accessRole,
    musicalRoles,
    practiceSharingEnabled,
    setPracticeSharingEnabled,
  } = useAuth()
  const isLeader = accessRole === 'worship_leader'
  const [displayName, setDisplayName] = useState('')
  const [preferredInstrument, setPreferredInstrument] = useState('')
  const [ianaTimezone, setIanaTimezone] = useState('Asia/Manila')
  const [weekStartsOn, setWeekStartsOn] = useState(1)
  const [serviceDayOfWeek, setServiceDayOfWeek] = useState(7)
  const [serviceCutoffTime, setServiceCutoffTime] = useState('09:00')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const currentUser = user
    const currentUserId = currentUser?.id
    const fallbackName =
      currentUser?.user_metadata?.full_name ?? currentUser?.email?.split('@')[0] ?? ''
    if (!currentUserId || !teamId) {
      setLoading(false)
      return
    }

    let cancelled = false
    async function loadSettings() {
      setLoading(true)
      setError(null)
      try {
        const [profileResult, teamResult] = await Promise.all([
          supa
            .from('profiles')
            .select('display_name, preferred_instrument')
            .eq('id', currentUserId)
            .maybeSingle(),
          supa
            .from('team_settings')
            .select('iana_timezone, week_starts_on, service_day_of_week, service_cutoff_time')
            .eq('team_id', teamId)
            .maybeSingle(),
        ])

        if (profileResult.error) throw profileResult.error
        if (teamResult.error) throw teamResult.error
        if (cancelled) return

        setDisplayName(
          profileResult.data?.display_name ??
            fallbackName
        )
        setPreferredInstrument(profileResult.data?.preferred_instrument ?? '')
        setIanaTimezone(teamResult.data?.iana_timezone ?? 'Asia/Manila')
        setWeekStartsOn(teamResult.data?.week_starts_on ?? 1)
        setServiceDayOfWeek(teamResult.data?.service_day_of_week ?? 7)
        setServiceCutoffTime((teamResult.data?.service_cutoff_time ?? '09:00').slice(0, 5))
      } catch (loadError) {
        console.error('Error loading settings:', loadError)
        if (!cancelled) setError('Unable to load your settings. Please try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadSettings()
    return () => {
      cancelled = true
    }
  }, [user?.id, teamId])

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user?.id || !teamId) return

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: ianaTimezone }).format()
    } catch {
      setError('Enter a valid IANA timezone, such as Asia/Manila.')
      return
    }

    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const { data: existingProfile, error: profileReadError } = await supa
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()
      if (profileReadError) throw profileReadError

      const profileSave = existingProfile
        ? await supa
            .from('profiles')
            .update({
              display_name: displayName.trim() || null,
              preferred_instrument: preferredInstrument.trim() || null,
            })
            .eq('id', user.id)
            .select('id')
            .maybeSingle()
        : await supa.from('profiles').insert({
            id: user.id,
            display_name: displayName.trim() || null,
            preferred_instrument: preferredInstrument.trim() || null,
          }).select('id').single()
      if (profileSave.error) throw profileSave.error
      if (!profileSave.data) throw new Error('Profile settings were not saved.')

      if (isLeader) {
        const { data: savedTeamSettings, error: teamError } = await supa
          .from('team_settings')
          .update({
            iana_timezone: ianaTimezone.trim(),
            week_starts_on: weekStartsOn,
            service_day_of_week: serviceDayOfWeek,
            service_cutoff_time: serviceCutoffTime,
          })
          .eq('team_id', teamId)
          .select('team_id')
          .maybeSingle()
        if (teamError) throw teamError
        if (!savedTeamSettings) throw new Error('Team settings were not saved.')
      }

      setNotice('Settings saved.')
    } catch (saveError) {
      console.error('Error saving settings:', saveError)
      setError('Unable to save settings. Check your permissions and try again.')
    } finally {
      setSaving(false)
    }
  }

  async function changePracticeSharing(enabled: boolean) {
    setError(null)
    setNotice(null)
    if (enabled) {
      const accepted = window.confirm(
        'Practice sharing is optional. If you enable it, completed practice session details (song, date, duration, playback speed, and loop information) may be shared with your Worship Leader and Worship Team Director for team and song summaries. These reports do not prove attention, attendance, or musical performance. You can turn sharing off at any time. Previously shared server records are retained but become hidden from leadership by the database policies. Private local sessions will not be uploaded automatically.\n\nDo you consent to share new practice activity?'
      )
      if (!accepted) return
    }

    try {
      await setPracticeSharingEnabled(enabled)
      setNotice(
        enabled
          ? 'Practice sharing enabled for new sessions. Existing private history remains local.'
          : 'Practice sharing disabled. New and pending sessions remain local; previously shared server records are retained and hidden from leadership.'
      )
    } catch (sharingError) {
      console.error('Error updating practice sharing:', sharingError)
      setError('Unable to update your practice-sharing preference.')
    }
  }

  if (loading) {
    return <div className="page-container"><h2>Settings</h2><LoadingSkeleton rows={4} label="Loading settings" /></div>
  }

  return (
    <div className="page-container">
      <h2>Settings</h2>
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
      {notice && <StatusMessage tone="success">{notice}</StatusMessage>}

      <form className="settings-form" onSubmit={saveSettings}>
        <section className="card">
          <h3>Profile</h3>
          <div className="settings-fields">
            <label>
              Display name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={255}
                autoComplete="name"
              />
            </label>
            <label>
              Preferred instrument
              <input
                value={preferredInstrument}
                onChange={(event) => setPreferredInstrument(event.target.value)}
                maxLength={255}
                placeholder="For example, keyboard"
              />
            </label>
          </div>
          <p className="settings-musical-roles">
            Musical roles: {musicalRoles.length ? musicalRoles.join(', ') : 'Not assigned'}
          </p>
        </section>

        <section className="card">
          <h3>Practice Privacy</h3>
          <label className="settings-checkbox-row">
            <input
              type="checkbox"
              checked={practiceSharingEnabled}
              onChange={(event) => void changePracticeSharing(event.target.checked)}
            />
            <span>Share my practice activity with team leadership</span>
          </label>
          <div className="settings-privacy-copy">
            <p>
              Sharing is optional. When enabled, Worship Leaders and Worship Team Directors can
              view shared sessions for team and song summaries. Reports are not proof of
              attention, attendance, or performance.
            </p>
            <p>
              Turning sharing off stops new uploads and hides your previously shared sessions
              from leadership through RLS; it does not delete append-only server records.
              Private local history is never uploaded automatically.
            </p>
          </div>
        </section>

        <section className="card">
          <h3>Team Calendar</h3>
          {isLeader ? (
            <div className="settings-fields settings-calendar-fields">
              <label>
                IANA timezone
                <input
                  value={ianaTimezone}
                  onChange={(event) => setIanaTimezone(event.target.value)}
                  placeholder="Asia/Manila"
                />
              </label>
              <label>
                Week starts on
                <select
                  value={weekStartsOn}
                  onChange={(event) => setWeekStartsOn(Number(event.target.value))}
                >
                  {weekdays.map((day, index) => (
                    <option key={day} value={index + 1}>{day}</option>
                  ))}
                </select>
              </label>
              <label>
                Service day
                <select
                  value={serviceDayOfWeek}
                  onChange={(event) => setServiceDayOfWeek(Number(event.target.value))}
                >
                  {weekdays.map((day, index) => (
                    <option key={day} value={index + 1}>{day}</option>
                  ))}
                </select>
              </label>
              <label>
                Service cutoff time
                <input
                  type="time"
                  value={serviceCutoffTime}
                  onChange={(event) => setServiceCutoffTime(event.target.value)}
                  required
                />
              </label>
            </div>
          ) : (
            <div className="settings-summary-grid">
              <p>Timezone: {ianaTimezone}</p>
              <p>Week starts on: {weekdays[weekStartsOn - 1]}</p>
              <p>Service day: {weekdays[serviceDayOfWeek - 1]}</p>
              <p>Service cutoff: {serviceCutoffTime}</p>
            </div>
          )}
        </section>

        <div className="settings-actions">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>

      <section className="card">
        <h3>Team Information</h3>
        <p>Application role: {accessRole ?? 'Not assigned'}</p>
        <p>Team ID: {teamId ?? 'Not assigned'}</p>
      </section>
    </div>
  )
}
