import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
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

function AppRoutes() {
  const { user, loading, signOut } = useAuth()

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <>
      {user && (
        <nav className="app-nav">
          <span className="app-title">ROL Worship Team</span>
          <div className="app-nav-links">
            <Link to="/">Home</Link>
            <Link to="/catalog">Songs</Link>
            <Link to="/lineup">Lineup</Link>
            <Link to="/announcements">Announcements</Link>
            <Link to="/overview">Practice overview</Link>
            <Link to="/settings">Settings</Link>
          </div>
          <div className="app-nav-right">
            <span className="app-user-name">{user.email?.split('@')[0] || 'Member'}</span>
            <button onClick={signOut} className="btn-signout">Sign Out</button>
          </div>
        </nav>
      )}
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
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}