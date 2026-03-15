import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Sessions from './pages/Sessions'
import SessionDetail from './pages/SessionDetail'

function Nav() {
  return (
    <nav className="bg-blue-600 text-white px-6 py-4 flex items-center gap-6 shadow">
      <Link to="/" className="text-xl font-bold tracking-tight">⚡ Setpoint</Link>
      <Link to="/sessions" className="text-sm hover:underline">Tournaments</Link>
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
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/sessions/:id" element={<SessionDetail />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
