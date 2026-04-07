import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import directorApi from '../lib/directorApi'

interface Player {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  gender?: 'm' | 'f' | null
  auth_user_id?: string | null
}

interface ClaimCode {
  code: string
  expires_at: string
}

const GENDER_COLOR: Record<string, string> = {
  m: 'bg-blue-100 text-blue-700',
  f: 'bg-pink-100 text-pink-700',
}

const emptyForm = { name: '', phone: '', email: '', gender: '' }

export default function DirectorPlayers() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add form
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState(emptyForm)
  const [adding, setAdding] = useState(false)

  // Edit state: player id -> form values
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Claim codes: player id -> generated code
  const [claimCodes, setClaimCodes] = useState<Record<string, ClaimCode>>({})
  const [generatingCodeFor, setGeneratingCodeFor] = useState<string | null>(null)

  useEffect(() => {
    directorApi.get('/api/players/').then(res => {
      setPlayers(res.data)
      setLoading(false)
    })
  }, [])

  async function addPlayer(e: React.FormEvent) {
    e.preventDefault()
    if (!addForm.name.trim()) return
    setAdding(true)
    setError(null)
    try {
      const res = await directorApi.post('/api/director/players', {
        name: addForm.name.trim(),
        phone: addForm.phone.trim() || null,
        email: addForm.email.trim() || null,
        gender: addForm.gender || null,
      })
      setPlayers(prev => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)))
      setAddForm(emptyForm)
      setShowAdd(false)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Failed to add player')
    } finally {
      setAdding(false)
    }
  }

  function startEdit(p: Player) {
    setEditingId(p.id)
    setEditForm({
      name: p.name,
      phone: p.phone ?? '',
      email: p.email ?? '',
      gender: p.gender ?? '',
    })
    setError(null)
  }

  async function saveEdit(playerId: string) {
    if (!editForm.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await directorApi.put(`/api/director/players/${playerId}`, {
        name: editForm.name.trim(),
        phone: editForm.phone.trim() || null,
        email: editForm.email.trim() || null,
        gender: editForm.gender || null,
      })
      setPlayers(prev =>
        prev.map(p => p.id === playerId ? res.data : p)
            .sort((a, b) => a.name.localeCompare(b.name))
      )
      setEditingId(null)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function generateClaimCode(playerId: string) {
    // Generates a one-time claim code for an unclaimed player and stores it locally.
    setGeneratingCodeFor(playerId)
    setError(null)
    try {
      const res = await directorApi.post(`/api/director/players/${playerId}/claim-code`)
      setClaimCodes(prev => ({ ...prev, [playerId]: res.data }))
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Failed to generate code')
    } finally {
      setGeneratingCodeFor(null)
    }
  }

  async function deletePlayer(playerId: string, name: string) {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return
    setDeletingId(playerId)
    setError(null)
    try {
      await directorApi.delete(`/api/director/players/${playerId}`)
      setPlayers(prev => prev.filter(p => p.id !== playerId))
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Cannot delete — player may have session history')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <Link to="/director" className="text-gray-600 hover:underline text-sm mb-4 block">← Back to Director</Link>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Players</h1>
          <button
            onClick={() => { setShowAdd(s => !s); setError(null) }}
            className="bg-white border-2 border-primary/20 text-primary font-medium px-4 py-2 rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
          >
            + Add Player
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {showAdd && (
        <form onSubmit={addPlayer} className="border rounded-xl p-5 bg-white space-y-4">
          <h2 className="font-semibold">New Player</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Name *</label>
              <input
                value={addForm.name}
                onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
                required
                className="border rounded-lg px-3 py-2 w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Phone</label>
              <input
                value={addForm.phone}
                onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="Optional"
                className="border rounded-lg px-3 py-2 w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email</label>
              <input
                type="email"
                value={addForm.email}
                onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                placeholder="Optional"
                className="border rounded-lg px-3 py-2 w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Gender</label>
              <select
                value={addForm.gender}
                onChange={e => setAddForm(f => ({ ...f, gender: e.target.value }))}
                className="border rounded-lg px-3 py-2 w-full text-sm"
              >
                <option value="">— unset —</option>
                <option value="m">M</option>
                <option value="f">F</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setShowAdd(false); setAddForm(emptyForm) }} className="text-gray-500 hover:text-gray-700 text-sm transition-colors">Cancel</button>
            <button type="submit" disabled={adding || !addForm.name.trim()} className="bg-primary text-white font-semibold px-4 py-2 rounded-lg shadow-sm hover:shadow hover:bg-primary-light transition-all disabled:opacity-50">
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>
      )}

      {players.length === 0 ? (
        <div className="text-center py-12 text-gray-400 border rounded-xl">No players yet.</div>
      ) : (
        <div className="border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-primary/5 text-primary uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Phone</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-center">Gender</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {players.map(p => (
                editingId === p.id ? (
                  <tr key={p.id} className="bg-cream">
                    <td className="px-3 py-2">
                      <input
                        value={editForm.name}
                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        className="border rounded px-2 py-1 w-full text-sm"
                        autoFocus
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={editForm.phone}
                        onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="—"
                        className="border rounded px-2 py-1 w-full text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="—"
                        className="border rounded px-2 py-1 w-full text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={editForm.gender}
                        onChange={e => setEditForm(f => ({ ...f, gender: e.target.value }))}
                        className="border rounded px-2 py-1 text-sm w-full"
                      >
                        <option value="">—</option>
                        <option value="m">M</option>
                        <option value="f">F</option>
                      </select>
                    </td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => saveEdit(p.id)}
                          disabled={saving || !editForm.name.trim()}
                          className="bg-primary text-white font-semibold px-3 py-1.5 rounded-lg text-sm shadow-sm hover:bg-primary-light transition-colors disabled:opacity-50"
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 transition-colors">Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id} className="bg-white hover:bg-cream-light">
                    <td className="px-4 py-3 font-medium">
                      <Link to={`/players/${p.id}`} className="hover:text-primary">{p.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{p.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{p.email ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {p.gender ? (
                        <span className={`text-xs px-2 py-0.5 rounded font-semibold ${GENDER_COLOR[p.gender]}`}>
                          {p.gender.toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-xs text-orange-400">unset</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.auth_user_id ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                          Claimed
                        </span>
                      ) : claimCodes[p.id] ? (
                        <div className="text-center">
                          <span className="font-mono text-sm font-bold text-primary tracking-widest">
                            {claimCodes[p.id].code}
                          </span>
                          <p className="text-xs text-gray-400 mt-0.5">Share with player</p>
                        </div>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full font-medium">
                          Unclaimed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3 justify-end">
                        <button onClick={() => startEdit(p)} className="text-sm text-primary/70 hover:text-primary font-medium transition-colors">Edit</button>
                        {!p.auth_user_id && !claimCodes[p.id] && (
                          <button
                            onClick={() => generateClaimCode(p.id)}
                            disabled={generatingCodeFor === p.id}
                            className="text-sm text-gray-500 hover:text-primary transition-colors disabled:opacity-50"
                          >
                            {generatingCodeFor === p.id ? 'Generating…' : 'Get code'}
                          </button>
                        )}
                        <button
                          onClick={() => deletePlayer(p.id, p.name)}
                          disabled={deletingId === p.id}
                          className="text-sm text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
