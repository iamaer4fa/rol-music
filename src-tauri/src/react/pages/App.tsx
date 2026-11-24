import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/use-auth'
import '../App.css'

// Page components
import SignIn from './SignIn'
import HomeDashboard from './HomeDashboard'
import SongCatalog from './SongCatalog'
import SongDetail from './SongDetail'
import WeeklyLineup from './WeeklyLineup'
import PracticeView from './PracticeView'
import Announcements from './Announcements'
import PracticeOverview from './PracticeOverview'
import Settings from './Settings'
import OfflineStatus from '../components/OfflineStatus'

function AppRoutes() {
  const { user, loading, signOut } = useAuth()
  const { pathname } = useLocation()

  if (loading) {
    return <div className="app-loading">Loading your workspace...</div>
  }

  const routes = (
      <Routes>
        <Route path="/signin" element={user ? <Navigate to="/" replace /> : <SignIn />} />
        <Route path="/" element={user ? <HomeDashboard /> : <Navigate to="/signin" replace />} />
        <Route path="/catalog" element={user ? <SongCatalog /> : <Navigate to="/signin" replace />} />
        <Route path="/song/:id" element={user ? <SongDetail /> : <Navigate to="/signin" replace />} />
        <Route path="/lineup" element={user ? <WeeklyLineup /> : <Navigate to="/signin" replace />} />
        <Route path="/practice/:songId" element={user ? <PracticeView /> : <Navigate to="/signin" replace />} />
        <Route path="/announcements" element={user ? <Announcements /> : <Navigate to="/signin" replace />} />
        <Route path="/overview" element={user ? <PracticeOverview /> : <Navigate to="/signin" replace />} />
        <Route path="/settings" element={user ? <Settings /> : <Navigate to="/signin" replace />} />
        <Route path="*" element={<Navigate to={user ? '/' : '/signin'} replace />} />
      </Routes>
  )

  if (!user) return routes

  const navItems = [
    { to: '/', label: 'Home', end: true },
    { to: '/catalog', label: 'Songs' },
    { to: '/lineup', label: 'Lineup' },
    { to: '/announcements', label: 'Updates' },
    { to: '/overview', label: 'Practice' },
    { to: '/settings', label: 'Settings' },
  ]

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="app-header">
        <NavLink to="/" className="app-brand" aria-label="ROL Worship Team home">
          <span className="app-brand-mark" aria-hidden="true">R</span>
          <span>ROL Worship Team</span>
        </NavLink>
        <div className="app-header-actions">
          <div className="app-user-chip">
            <span className="app-avatar" aria-hidden="true">
              {(user.email?.trim()[0] || 'M').toUpperCase()}
            </span>
            <span className="app-user-name">{user.email || 'Member'}</span>
          </div>
          <button onClick={signOut} className="btn-signout">Sign out</button>
        </div>
      </header>
      <OfflineStatus />
      <div className="app-workspace">
        <aside className="app-sidebar">
          <p className="app-sidebar-label">Workspace</p>
          <nav className="app-nav-links" aria-label="Main navigation">
            {navItems.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end ?? false}
                className={({ isActive }) =>
                  isActive || (to === '/overview' && pathname.startsWith('/practice/'))
                    ? 'app-nav-link active'
                    : 'app-nav-link'
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="app-main" id="main-content" tabIndex={-1}>
          {routes}
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}