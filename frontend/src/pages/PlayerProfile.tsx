import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../lib/api'
import { groupBySeries, PlayerSeriesCard } from '../components/PlayerSeriesCard'
import type { SeriesGroup } from '../components/PlayerSeriesCard'

interface PlayerData {
  id: string
  name: string
  last_name?: string | null
  avatar_url?: string | null
  instagram_handle?: string | null
  orgs?: { id: string; name: string; slug: string; role: string }[]
}

export default function PlayerProfile() {
  const { id } = useParams<{ id: string }>()
  const [player, setPlayer] = useState<PlayerData | null>(null)
  const [seriesGroups, setSeriesGroups] = useState<SeriesGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    api.get(`/api/players/${id}/profile`)
      .then(res => {
        setPlayer(res.data.player)
        setSeriesGroups(groupBySeries(res.data.history))
      })
      .catch(() => setError('Could not load player profile.'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>
  if (error)   return <div className="p-8 text-center text-red-500">{error}</div>
  if (!player) return null

  const displayName = [player.name, player.last_name].filter(Boolean).join(' ')

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">

      {/* ── Header ── */}
      <div>
        <Link to={-1 as unknown as string} className="text-gray-500 hover:underline text-sm mb-4 block">
          ← Back
        </Link>

        <div className="flex items-start gap-5">

          {/* Avatar */}
          <div className="w-20 h-20 rounded-full overflow-hidden bg-primary/10 border-2 border-primary/20 shrink-0 flex items-center justify-center">
            {player.avatar_url ? (
              <img src={player.avatar_url} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-primary/40">
                {player.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          {/* Name + instagram + orgs */}
          <div className="pt-1">
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
        </div>
      </div>

      {/* ── Series cards ── */}
      {seriesGroups.length === 0 ? (
        <div className="text-center py-12 text-gray-400 border rounded-xl">
          No sessions on record yet.
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

    </div>
  )
}
