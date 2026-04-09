/**
 * Director hub — PIN-gated entry point for tournament directors.
 *
 * Layout:
 *   - Series section: create / view / delete tournament series
 *   - Session section: create sessions within a series, view and navigate all sessions
 *
 * Note: Director currently has global access. When org-scoped roles are introduced,
 * series and session lists will be filtered to the director's organization.
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import directorApi from '../lib/directorApi'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SessionRow {
  id: string
  date: string
  status: string
  tournament_series: { name: string; competition_type_id?: string } | null
}

interface SeriesRow {
  id: string
  name: string
  location?: string
  active: boolean
  competition_type_id?: string
  game_format_id?: string
  level_id?: string
  surface_id?: string
  division_id?: string
  game_formats?: { id: string; name: string } | null
  competition_types?: { id: string; name: string } | null
  levels?: { id: string; name: string } | null
  surfaces?: { id: string; name: string } | null
  divisions?: { id: string; name: string } | null
}

interface Lookups {
  game_formats:      { id: string; name: string }[]
  competition_types: { id: string; name: string }[]
  levels:            { id: string; name: string }[]
  surfaces:          { id: string; name: string }[]
  divisions:         { id: string; name: string }[]
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-500',
  active:    'bg-green-100 text-green-700',
  completed: 'bg-primary/10 text-primary',
}

const POOL_TYPES = ['pool_playoff_single_elim', 'pool_playoff_double_elim']

// ── PIN gate ───────────────────────────────────────────────────────────────────

function PinEntry({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setChecking(true)
    setError('')
    try {
      await api.get('/api/director/sessions', { headers: { 'X-Director-Pin': pin } })
      localStorage.setItem('director_pin', pin)
      onSuccess()
    } catch {
      setError('Wrong PIN')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <form onSubmit={submit} className="bg-white border rounded-xl p-8 w-80 space-y-4 shadow">
        <h2 className="text-xl font-bold text-center">Director Login</h2>
        <input
          type="password"
          placeholder="Enter PIN"
          value={pin}
          onChange={e => setPin(e.target.value)}
          className="w-full border rounded-lg px-4 py-2 text-center text-2xl tracking-widest"
          autoFocus
        />
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        <button
          type="submit"
          disabled={!pin || checking}
          className="w-full bg-primary text-white rounded-lg py-2 font-medium hover:bg-primary-light disabled:opacity-50"
        >
          {checking ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </div>
  )
}

// ── Series metadata badge strip ────────────────────────────────────────────────

/**
 * Small colored badges showing the key metadata for a series row.
 * Reused in both the series list and the sessions list.
 */
function SeriesBadges({ series }: { series: SeriesRow }) {
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {series.divisions?.name && (
        <span className="bg-blue-50 text-blue-700 text-xs px-1.5 py-0.5 rounded-full font-medium">
          {series.divisions.name}
        </span>
      )}
      {series.levels?.name && (
        <span className="bg-purple-50 text-purple-700 text-xs px-1.5 py-0.5 rounded-full font-medium">
          {series.levels.name}
        </span>
      )}
      {series.surfaces?.name && (
        <span className="bg-green-50 text-green-700 text-xs px-1.5 py-0.5 rounded-full font-medium">
          {series.surfaces.name}
        </span>
      )}
      {series.game_formats?.name && (
        <span className="bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded-full font-medium">
          {series.game_formats.name}
        </span>
      )}
      {series.competition_types?.name && (
        <span className="bg-primary/10 text-primary text-xs px-1.5 py-0.5 rounded-full font-medium">
          {series.competition_types.name}
        </span>
      )}
      {!series.active && (
        <span className="bg-gray-100 text-gray-400 text-xs px-1.5 py-0.5 rounded-full">
          inactive
        </span>
      )}
    </div>
  )
}

// ── New series form ────────────────────────────────────────────────────────────

/**
 * Expandable form for creating a new tournament series.
 * Calls onCreated with the new series row on success.
 */
function NewSeriesForm({
  lookups,
  onCreated,
  onCancel,
}: {
  lookups: Lookups
  onCreated: (series: SeriesRow) => void
  onCancel: () => void
}) {
  const [name,              setName]              = useState('')
  const [location,          setLocation]          = useState('')
  const [gameFormatId,      setGameFormatId]      = useState('')
  const [competitionTypeId, setCompetitionTypeId] = useState('')
  const [levelId,           setLevelId]           = useState('')
  const [surfaceId,         setSurfaceId]         = useState('')
  const [divisionId,        setDivisionId]        = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await directorApi.post('/api/director/series', {
        name:                name.trim(),
        location:            location.trim() || null,
        game_format_id:      gameFormatId      || null,
        competition_type_id: competitionTypeId || null,
        level_id:            levelId           || null,
        surface_id:          surfaceId         || null,
        division_id:         divisionId        || null,
      })
      onCreated(res.data)
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Failed to create series.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="border rounded-xl p-5 bg-white space-y-4">
      <h2 className="font-semibold text-lg">New Series</h2>

      {/* Name + Location */}
      <div className="flex gap-4 flex-wrap">
        <div className="flex-1 min-w-48">
          <label className="block text-xs text-gray-500 mb-1">Series Name *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. NYC Grass Doubles 2026"
            required
            className="border rounded-lg px-3 py-2 w-full"
          />
        </div>
        <div className="flex-1 min-w-40">
          <label className="block text-xs text-gray-500 mb-1">Location</label>
          <input
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="e.g. Central Park"
            className="border rounded-lg px-3 py-2 w-full"
          />
        </div>
      </div>

      {/* Metadata dropdowns — two rows of three */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Game Format</label>
          <select
            value={gameFormatId}
            onChange={e => setGameFormatId(e.target.value)}
            className="border rounded-lg px-3 py-2 w-full text-sm"
          >
            <option value="">— select —</option>
            {lookups.game_formats.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Competition Type</label>
          <select
            value={competitionTypeId}
            onChange={e => setCompetitionTypeId(e.target.value)}
            className="border rounded-lg px-3 py-2 w-full text-sm"
          >
            <option value="">— select —</option>
            {lookups.competition_types.map(ct => (
              <option key={ct.id} value={ct.id}>{ct.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Level</label>
          <select
            value={levelId}
            onChange={e => setLevelId(e.target.value)}
            className="border rounded-lg px-3 py-2 w-full text-sm"
          >
            <option value="">— select —</option>
            {lookups.levels.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Surface</label>
          <select
            value={surfaceId}
            onChange={e => setSurfaceId(e.target.value)}
            className="border rounded-lg px-3 py-2 w-full text-sm"
          >
            <option value="">— select —</option>
            {lookups.surfaces.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Division</label>
          <select
            value={divisionId}
            onChange={e => setDivisionId(e.target.value)}
            className="border rounded-lg px-3 py-2 w-full text-sm"
          >
            <option value="">— select —</option>
            {lookups.divisions.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="text-gray-500 hover:text-gray-700 text-sm transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="bg-primary text-white font-semibold px-4 py-2 rounded-lg shadow-sm hover:shadow hover:bg-primary-light transition-all disabled:opacity-50"
        >
          {saving ? 'Creating…' : 'Create Series'}
        </button>
      </div>
    </form>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Director() {
  const navigate = useNavigate()

  // Auth
  const [authed, setAuthed] = useState(!!localStorage.getItem('director_pin'))

  // Data
  const [sessions,   setSessions]   = useState<SessionRow[]>([])
  const [seriesList, setSeriesList] = useState<SeriesRow[]>([])
  const [lookups,    setLookups]    = useState<Lookups | null>(null)
  const [loading,    setLoading]    = useState(true)

  // UI state
  const [showNewSeries,  setShowNewSeries]  = useState(false)
  const [showNewSession, setShowNewSession] = useState(false)
  const [newDate,        setNewDate]        = useState('')
  const [newSeriesId,    setNewSeriesId]    = useState('')
  const [creating,       setCreating]       = useState(false)
  const [deletingId,     setDeletingId]     = useState<string | null>(null)

  // Load everything when authed
  useEffect(() => {
    if (!authed) return
    Promise.all([
      directorApi.get('/api/director/sessions'),
      directorApi.get('/api/director/series'),
      api.get('/api/sessions/lookups'),
    ])
      .then(([sessRes, seriesRes, lookupsRes]) => {
        setSessions(sessRes.data)
        setSeriesList(seriesRes.data)
        setLookups(lookupsRes.data)
      })
      .catch(() => {
        // Show empty state on error rather than infinite spinner
      })
      .finally(() => setLoading(false))
  }, [authed])

  // ── Series actions ────────────────────────────────────────────────────────────

  /** Called when the new series form succeeds — prepend to list and close form. */
  function onSeriesCreated(series: SeriesRow) {
    setSeriesList(prev => [series, ...prev])
    setShowNewSeries(false)
  }

  /** Delete a series and all its sessions after user confirms. */
  async function deleteSeries(series: SeriesRow) {
    const confirmed = window.confirm(
      `Delete "${series.name}"?\n\nThis will permanently delete the series and ALL linked sessions and their data. This cannot be undone.`
    )
    if (!confirmed) return
    setDeletingId(series.id)
    try {
      const res = await directorApi.delete(`/api/director/series/${series.id}`)
      // Remove deleted series from list
      setSeriesList(prev => prev.filter(s => s.id !== series.id))
      // Remove sessions that belonged to this series
      setSessions(prev => prev.filter(s => s.tournament_series?.name !== series.name))
    } finally {
      setDeletingId(null)
    }
  }

  // ── Session actions ───────────────────────────────────────────────────────────

  /** Create a new session, then route to the correct director page. */
  async function createSession(e: React.FormEvent) {
    e.preventDefault()
    if (!newDate) return
    setCreating(true)
    const res = await directorApi.post('/api/director/sessions', {
      date:      newDate,
      series_id: newSeriesId || null,
    })
    const newSession = res.data
    setShowNewSession(false)
    setNewDate('')
    setNewSeriesId('')
    setCreating(false)

    // Redirect to pool+playoff director for pool sessions
    const selectedSeries = seriesList.find(s => s.id === newSeriesId)
    const competitionType = selectedSeries?.competition_type_id
    if (competitionType && POOL_TYPES.includes(competitionType)) {
      navigate(`/director/pool/${newSession.id}`)
    } else {
      setSessions(prev => [newSession, ...prev])
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!authed) return <PinEntry onSuccess={() => setAuthed(true)} />

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-bold">Director</h1>
        <div className="flex gap-2 flex-wrap">
          <Link
            to="/director/players"
            className="bg-white border-2 border-primary/20 text-primary font-medium px-4 py-2 rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
          >
            Players
          </Link>
          <button
            onClick={() => { setShowNewSeries(s => !s); setShowNewSession(false) }}
            className="bg-white border-2 border-primary/20 text-primary font-medium px-4 py-2 rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
          >
            + New Series
          </button>
          <button
            onClick={() => { setShowNewSession(s => !s); setShowNewSeries(false) }}
            className="bg-white border-2 border-primary/20 text-primary font-medium px-4 py-2 rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
          >
            + New Session
          </button>
          <button
            onClick={() => { localStorage.removeItem('director_pin'); setAuthed(false) }}
            className="text-gray-500 hover:text-gray-700 text-sm transition-colors px-2"
          >
            Log out
          </button>
        </div>
      </div>

      {/* New series form */}
      {showNewSeries && lookups && (
        <NewSeriesForm
          lookups={lookups}
          onCreated={onSeriesCreated}
          onCancel={() => setShowNewSeries(false)}
        />
      )}

      {/* New session form */}
      {showNewSession && (
        <form onSubmit={createSession} className="border rounded-xl p-5 bg-white space-y-4">
          <h2 className="font-semibold text-lg">New Session</h2>
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-36">
              <label className="block text-xs text-gray-500 mb-1">Date</label>
              <input
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                required
                className="border rounded-lg px-3 py-2 w-full"
              />
            </div>
            <div className="flex-1 min-w-48">
              <label className="block text-xs text-gray-500 mb-1">Series (optional)</label>
              <select
                value={newSeriesId}
                onChange={e => setNewSeriesId(e.target.value)}
                className="border rounded-lg px-3 py-2 w-full"
              >
                <option value="">— none —</option>
                {seriesList.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}{!s.active ? ' (inactive)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowNewSession(false)}
              className="text-gray-500 hover:text-gray-700 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="bg-primary text-white font-semibold px-4 py-2 rounded-lg shadow-sm hover:shadow hover:bg-primary-light transition-all disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create Session'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : (
        <>
          {/* ── Series section ── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Series</h2>
              <span className="text-sm text-gray-400">{seriesList.length} total</span>
            </div>

            {seriesList.length === 0 ? (
              <div className="text-center py-8 text-gray-400 border rounded-xl">
                No series yet. Create one to get started.
              </div>
            ) : (
              <div className="grid gap-2">
                {seriesList.map(series => (
                  <div
                    key={series.id}
                    className="flex items-start justify-between border rounded-xl px-5 py-4 bg-white gap-4"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{series.name}</p>
                      {series.location && (
                        <p className="text-xs text-gray-500 mt-0.5">📍 {series.location}</p>
                      )}
                      <SeriesBadges series={series} />
                    </div>
                    <button
                      onClick={() => deleteSeries(series)}
                      disabled={deletingId === series.id}
                      className="text-xs text-red-400 hover:text-red-600 font-medium shrink-0 disabled:opacity-40 transition-colors"
                    >
                      {deletingId === series.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Sessions section ── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Sessions</h2>
              <span className="text-sm text-gray-400">{sessions.length} total</span>
            </div>

            {sessions.length === 0 ? (
              <div className="text-center py-8 text-gray-400 border rounded-xl">
                No sessions yet.
              </div>
            ) : (
              <div className="grid gap-3">
                {sessions.map(s => {
                  const competitionType = s.tournament_series?.competition_type_id
                  const isPoolSession = competitionType ? POOL_TYPES.includes(competitionType) : false
                  const sessionPath = isPoolSession
                    ? `/director/pool/${s.id}`
                    : `/director/sessions/${s.id}`
                  return (
                    <Link
                      key={s.id}
                      to={sessionPath}
                      className="flex items-center justify-between border rounded-xl px-5 py-4 bg-white hover:shadow-md transition"
                    >
                      <div>
                        <p className="font-semibold">
                          {new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', {
                            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                          })}
                        </p>
                        {s.tournament_series && (
                          <p className="text-sm text-gray-500">{s.tournament_series.name}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${STATUS_BADGE[s.status] || ''}`}>
                          {s.status}
                        </span>
                        <span className="text-gold">→</span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
