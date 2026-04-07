import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import playerApi from '../lib/playerApi'
import api from '../lib/api'
import { groupBySeries, PlayerSeriesCard } from '../components/PlayerSeriesCard'
import type { SeriesGroup } from '../components/PlayerSeriesCard'

interface UpcomingSession {
  id: string
  date: string
  status: string
  series_name: string | null
  is_today: boolean
}

const STATUS_LABEL: Record<string, string> = {
  draft:     'Upcoming',
  active:    'In progress',
  completed: 'Completed',
}

const STATUS_COLOR: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-500',
  active:    'bg-green-100 text-green-700',
  completed: 'bg-primary/10 text-primary',
}

export default function PlayerDashboard() {
  const { session, player, loading: authLoading, signOut, refreshPlayer } = useAuth()
  const navigate = useNavigate()

  const [seriesGroups, setSeriesGroups] = useState<SeriesGroup[]>([])
  const [statsLoading, setStatsLoading] = useState(true)
  const [upcoming, setUpcoming] = useState<UpcomingSession[]>([])
  const [upcomingLoading, setUpcomingLoading] = useState(true)

  // Edit profile state
  const [editingProfile, setEditingProfile] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '',
    last_name: '',
    phone: '',
    email: '',
    instagram_handle: '',
  })
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Avatar upload state
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // No redirect — show a sign-in prompt if not authenticated (see early return below)

  // Redirect to claim if logged in but profile not yet linked
  useEffect(() => {
    if (!authLoading && session && player === null) navigate('/claim')
  }, [authLoading, session, player, navigate])

  // Load session history and group by series
  useEffect(() => {
    if (!player) return
    setStatsLoading(true)
    api.get(`/api/players/${player.id}/profile`)
      .then(res => setSeriesGroups(groupBySeries(res.data.history)))
      .finally(() => setStatsLoading(false))
  }, [player])

  // Load upcoming sessions for this week
  useEffect(() => {
    if (!player || !session) return
    setUpcomingLoading(true)
    playerApi(session).get('/api/me/upcoming')
      .then(res => setUpcoming(res.data))
      .catch(() => setUpcoming([]))
      .finally(() => setUpcomingLoading(false))
  }, [player, session])

  function startEditingProfile() {
    setEditForm({
      name: player?.name ?? '',
      last_name: player?.last_name ?? '',
      phone: player?.phone ?? '',
      email: player?.email ?? '',
      instagram_handle: player?.instagram_handle ?? '',
    })
    setProfileError(null)
    setEditingProfile(true)
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!session) return
    setSavingProfile(true)
    setProfileError(null)
    try {
      await playerApi(session).put('/api/me/', {
        name: editForm.name.trim() || null,
        last_name: editForm.last_name.trim() || null,
        phone: editForm.phone.trim() || null,
        email: editForm.email.trim() || null,
        instagram_handle: editForm.instagram_handle.trim().replace(/^@/, '') || null,
      })
      await refreshPlayer()
      setEditingProfile(false)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setProfileError(detail ?? 'Failed to save profile')
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !session) return
    setUploadingAvatar(true)
    setAvatarError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      await playerApi(session).put('/api/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      await refreshPlayer()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setAvatarError(detail ?? 'Failed to upload photo')
    } finally {
      setUploadingAvatar(false)
    }
  }

  // Still determining auth state
  if (authLoading) {
    return <div className="p-8 text-center text-gray-400">Loading…</div>
  }

  // Not signed in — show a prompt instead of a silent redirect
  if (!session) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-2xl font-bold">Your Dashboard</p>
          <p className="text-gray-500">Sign in to see your stats, session history, and teammate chemistry.</p>
          <Link
            to="/login"
            className="inline-block bg-primary text-white font-semibold px-6 py-3 rounded-lg hover:bg-primary-light transition-colors"
          >
            Sign in
          </Link>
          <p className="text-xs text-gray-400">
            New here? Ask the setpoint admin for a claim code after signing in.
          </p>
        </div>
      </div>
    )
  }

  // Signed in but hasn't claimed a profile yet
  if (!player) {
    return <div className="p-8 text-center text-gray-400">Loading…</div>
  }

  const displayName = [player.name, player.last_name].filter(Boolean).join(' ')

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">

      {/* ── Header ── */}
      <div className="flex items-start gap-5">

        {/* Avatar with upload */}
        <div className="relative shrink-0">
          <div
            className="w-20 h-20 rounded-full overflow-hidden bg-primary/10 border-2 border-primary/20 cursor-pointer"
            onClick={() => avatarInputRef.current?.click()}
            title="Change photo"
          >
            {player.avatar_url ? (
              <img src={player.avatar_url} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-primary/40">
                {player.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <button
            onClick={() => avatarInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="absolute -bottom-1 -right-1 bg-white border border-gray-200 rounded-full px-2 py-0.5 text-xs text-gray-500 hover:text-primary shadow-sm transition-colors disabled:opacity-50"
          >
            {uploadingAvatar ? '…' : 'Edit'}
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>

        {/* Name + instagram + orgs */}
        <div className="flex-1 min-w-0 pt-1">
          <h1 className="text-2xl font-bold leading-tight">{displayName}</h1>
          {player.instagram_handle && (
            <a
              href={`https://instagram.com/${player.instagram_handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-400 hover:text-primary transition-colors"
            >
              @{player.instagram_handle}
            </a>
          )}
          {(player.orgs ?? []).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {(player.orgs ?? []).map(org => (
                <span key={org.id} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                  {org.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions — consistent size and alignment */}
        <div className="flex flex-col items-stretch gap-2 pt-1 shrink-0">
          <button
            onClick={startEditingProfile}
            className="bg-white border-2 border-primary/20 text-primary font-medium px-4 py-2 rounded-lg hover:border-primary hover:bg-primary/5 transition-colors text-sm whitespace-nowrap text-center"
          >
            Edit profile
          </button>
          <button
            onClick={signOut}
            className="bg-white border-2 border-gray-200 text-gray-500 font-medium px-4 py-2 rounded-lg hover:border-gray-400 hover:text-gray-700 transition-colors text-sm whitespace-nowrap text-center"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Avatar error */}
      {avatarError && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">
          {avatarError}
        </div>
      )}

      {/* ── Edit profile form ── */}
      {editingProfile && (
        <form onSubmit={saveProfile} className="border rounded-xl bg-white overflow-hidden">
          {/* Header row: title + action buttons always visible */}
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h2 className="font-semibold">Edit profile</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditingProfile(false)}
                className="text-sm px-4 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingProfile}
                className="appearance-none text-sm px-4 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#122A1C', color: '#ffffff' }}
              >
                {savingProfile ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

          {/* Form fields */}
          <div className="p-5 space-y-4">
            {profileError && (
              <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-2 text-sm">
                {profileError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">First name</label>
                <input
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Your first name"
                  className="border rounded-lg px-3 py-2 w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Last name</label>
                <input
                  value={editForm.last_name}
                  onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))}
                  placeholder="Your last name"
                  className="border rounded-lg px-3 py-2 w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Phone</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+1 (917) 555-1234"
                  className="border rounded-lg px-3 py-2 w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="you@example.com"
                  className="border rounded-lg px-3 py-2 w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Instagram</label>
                <input
                  value={editForm.instagram_handle}
                  onChange={e => setEditForm(f => ({ ...f, instagram_handle: e.target.value }))}
                  placeholder="@yourhandle"
                  className="border rounded-lg px-3 py-2 w-full text-sm"
                />
              </div>
            </div>
          </div>
        </form>
      )}

      {/* ── This week ── */}
      <div className="border rounded-xl overflow-hidden bg-white">
        <div className="bg-primary/5 px-5 py-3 border-b">
          <h2 className="font-bold text-primary">This Week</h2>
        </div>

        {upcomingLoading ? (
          <div className="px-5 py-4 text-sm text-gray-400">Loading…</div>
        ) : upcoming.length === 0 ? (
          <div className="px-5 py-5 text-sm text-gray-400">
            You have no sessions scheduled this week.
          </div>
        ) : (
          <ul className="divide-y">
            {upcoming.map(s => (
              <li key={s.id} className="flex items-center justify-between px-5 py-4 gap-4">
                <div className="flex items-center gap-3">
                  {/* Today badge */}
                  {s.is_today && (
                    <span className="bg-gold text-white text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                      Today
                    </span>
                  )}
                  <div>
                    <p className="font-medium text-sm">
                      {new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', {
                        weekday: 'long', month: 'short', day: 'numeric',
                      })}
                    </p>
                    {s.series_name && (
                      <p className="text-xs text-gray-400">{s.series_name}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_COLOR[s.status] ?? ''}`}>
                    {STATUS_LABEL[s.status] ?? s.status}
                  </span>
                  {/* Show link on tournament day or if session is already active */}
                  {(s.is_today || s.status === 'active') && (
                    <Link
                      to={`/sessions/${s.id}`}
                      className="bg-primary text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-primary-light transition-colors whitespace-nowrap"
                    >
                      View session →
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Series grouped results ── */}
      {statsLoading ? (
        <div className="text-center py-12 text-gray-400">Loading results…</div>
      ) : seriesGroups.length === 0 ? (
        <div className="text-center py-12 text-gray-400 border rounded-xl">
          No sessions yet. Results will appear here after you play.
        </div>
      ) : (
        <div className="space-y-6">
          {seriesGroups.map(group => (
            <PlayerSeriesCard
              key={group.series_id ?? '__none__'}
              group={group}
              playerId={player.id}
            />
          ))}
        </div>
      )}

      {/* Public profile link */}
      <div className="text-center pb-2">
        <Link
          to={`/players/${player.id}`}
          className="text-sm text-gray-400 underline underline-offset-2 hover:text-primary transition-colors"
        >
          View your public profile →
        </Link>
      </div>

    </div>
  )
}
