import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Sessions from './pages/Sessions'
import SeriesDetail from './pages/SeriesDetail'
import SessionDetail from './pages/SessionDetail'
import PlayerProfile from './pages/PlayerProfile'

function Nav() {
  return (
    <nav className="bg-blue-600 text-white px-6 py-4 flex items-center gap-6 shadow">
      <Link to="/" className="text-xl font-bold tracking-tight">⚡ Setpoint</Link>
      <Link to="/tournaments" className="text-sm hover:underline">Tournaments</Link>
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Nav />
        <Routes>
          <Route path="/" element={<Sessions />} />
          <Route path="/tournaments" element={<Sessions />} />
          <Route path="/series/:id" element={<SeriesDetail />} />
          <Route path="/sessions/:id" element={<SessionDetail />} />
          <Route path="/players/:id" element={<PlayerProfile />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
