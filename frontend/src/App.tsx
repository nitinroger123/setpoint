import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import Sessions from './pages/Sessions'
import SeriesDetail from './pages/SeriesDetail'
import SessionDetail from './pages/SessionDetail'
import PlayerProfile from './pages/PlayerProfile'
import Players from './pages/Players'
import Director from './pages/Director'
import DirectorSession from './pages/DirectorSession'
import DirectorPlayers from './pages/DirectorPlayers'
import DirectorPoolPlayoff from './pages/DirectorPoolPlayoff'
import PoolPlayoffDetail from './pages/PoolPlayoffDetail'
import Login from './pages/Login'
import Claim from './pages/Claim'
import PlayerDashboard from './pages/PlayerDashboard'
import Terms from './pages/Terms'
import { AuthProvider, useAuth } from './context/AuthContext'

/**
 * A single nav link that shows an underline when its route is active.
 * Uses useLocation to avoid prop-drilling the current path.
 */
function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const { pathname } = useLocation()
  const isActive = pathname === to || (to !== '/' && pathname.startsWith(to))

  return (
    <Link
      to={to}
      className={`text-sm font-medium pb-0.5 transition-colors ${
        isActive
          ? 'text-primary border-b-2 border-primary'
          : 'text-gray-500 hover:text-primary'
      }`}
    >
      {children}
    </Link>
  )
}

/**
 * Dashboard link: points to /dashboard (player's own stats) when logged in,
 * or / (public sessions view) when not. Keeps the nav label "Dashboard" in both cases.
 */
function DashboardNavLink() {
  const { loading } = useAuth()
  if (loading) return null
  return <NavLink to="/dashboard">Dashboard</NavLink>
}

/**
 * Shows "Sign in" on the right when the player is not logged in.
 * Hidden when logged in — Dashboard already serves as their entry point.
 */
function SignInNavLink() {
  const { player, session, loading } = useAuth()
  if (loading || (session && player)) return null
  return <NavLink to="/login">Sign in</NavLink>
}


/**
 * Top navigation bar.
 * Logo left · Dashboard / Tournaments / Players / Director right.
 *
 * To update logo icon:    replace /public/logo.svg
 * To update wordmark:     replace /public/wordmark.svg
 */
function Nav() {
  return (
    <nav className="bg-cream-light border-b border-cream-dark px-6 py-3 flex items-center gap-8 shadow-sm">

      {/* Logo: icon mark + wordmark */}
      <Link to="/" className="flex items-center gap-2.5 shrink-0">
        <img src="/logo.svg" alt="Setpoint" className="h-8 w-auto" />
        <img src="/wordmark.svg" alt="Setpoint" className="h-[18px] w-auto" />
      </Link>

      {/* Nav links */}
      <div className="flex items-center gap-6 ml-2">
        <DashboardNavLink />
        <NavLink to="/tournaments">Tournaments</NavLink>
        <NavLink to="/players">Players</NavLink>
      </div>

      {/* Right side: Sign in (when logged out) + Director */}
      <div className="ml-auto flex items-center gap-4">
        <SignInNavLink />
        <NavLink to="/director">Director</NavLink>
      </div>

    </nav>
  )
}

/**
 * Site-wide footer.
 * Dark primary green background, logo left, copyright + terms right.
 */
function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-primary px-6 py-5 mt-auto">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">

        {/* Logo mark + brand name */}
        <div className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="Setpoint" className="h-7 w-auto" />
          <span className="text-cream-light font-semibold tracking-wide text-sm">Setpoint</span>
        </div>

        {/* Copyright + terms */}
        <div className="flex items-center gap-4 text-sm text-cream-dark/70">
          <span>© {currentYear} Setpoint. All rights reserved.</span>
          <Link to="/terms" className="underline underline-offset-2 hover:text-cream-light transition-colors">
            Terms &amp; Conditions
          </Link>
        </div>

      </div>
    </footer>
  )
}

/**
 * Root application component.
 * Wraps all pages in the shared Nav and Footer.
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-cream flex flex-col">
          <Nav />

          <main className="flex-1">
            <Routes>
              <Route path="/" element={<PlayerDashboard />} />
              <Route path="/dashboard" element={<PlayerDashboard />} />
              <Route path="/tournaments" element={<Sessions />} />
              <Route path="/series/:id" element={<SeriesDetail />} />
              <Route path="/sessions/:id" element={<SessionDetail />} />
              <Route path="/players" element={<Players />} />
              <Route path="/players/:id" element={<PlayerProfile />} />
              <Route path="/login" element={<Login />} />
              <Route path="/claim" element={<Claim />} />
              <Route path="/dashboard" element={<PlayerDashboard />} />
              <Route path="/director" element={<Director />} />
              <Route path="/director/sessions/:id" element={<DirectorSession />} />
              <Route path="/director/players" element={<DirectorPlayers />} />
              {/* Pool play + bracket director workflow */}
              <Route path="/director/pool/:id" element={<DirectorPoolPlayoff />} />
              {/* Public pool+playoff session view */}
              <Route path="/pool/:id" element={<PoolPlayoffDetail />} />
              <Route path="/terms" element={<Terms />} />
            </Routes>
          </main>

          <Footer />
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}
