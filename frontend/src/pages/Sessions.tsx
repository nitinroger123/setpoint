import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import { Session } from '../types'

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/sessions').then(res => {
      setSessions(res.data)
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="p-8 text-center">Loading sessions...</div>

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Past Tournaments</h1>
      <div className="grid gap-4">
        {sessions.map(s => (
          <Link
            key={s.id}
            to={`/sessions/${s.id}`}
            className="block border rounded-xl p-5 hover:shadow-md transition bg-white"
          >
            <div className="flex justify-between items-center">
              <div>
                <p className="text-lg font-semibold">
                  {new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                  })}
                </p>
                <p className="text-sm text-gray-500 capitalize">
                  {s.tournament_type.replace(/_/g, ' ')} · {s.num_rounds} rounds
                </p>
              </div>
              <span className="text-blue-500 font-medium">View →</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
