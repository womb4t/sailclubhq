'use client'
import { useEffect, useState, useCallback } from 'react'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import type { Boat, Profile } from '@/types/database'

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  laid_up: 'Laid up',
  for_sale: 'For sale',
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  laid_up: 'bg-amber-100 text-amber-800',
  for_sale: 'bg-blue-100 text-blue-800',
}

interface BoatFormData {
  boat_name: string
  class: string
  sail_number: string
  hull_colour: string
  length_m: string
  py_handicap: string
  status: string
}

const EMPTY_FORM: BoatFormData = {
  boat_name: '',
  class: '',
  sail_number: '',
  hull_colour: '',
  length_m: '',
  py_handicap: '',
  status: 'active',
}

export default function MyBoatsPage() {
  const { user } = useAuth()
  const [myBoats, setMyBoats] = useState<Boat[]>([])
  const [unclaimedBoats, setUnclaimedBoats] = useState<Boat[]>([])
  const [loading, setLoading] = useState(true)
  const [clubId, setClubId] = useState<string | null>(null)

  // Claim search
  const [claimSearch, setClaimSearch] = useState('')
  const [claimLoading, setClaimLoading] = useState(false)

  // Add/Edit form
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingBoat, setEditingBoat] = useState<Boat | null>(null)
  const [form, setForm] = useState<BoatFormData>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSaving, setFormSaving] = useState(false)

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  function showSuccess(msg: string) {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  const fetchBoats = useCallback(async () => {
    if (!user) return
    const supabase = getBrowserClient()

    // Get club_id from profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('club_id')
      .eq('id', user.id)
      .maybeSingle()

    const cid = (profileData as Pick<Profile, 'club_id'> | null)?.club_id ?? null
    setClubId(cid)

    // My boats
    const { data: mine } = await supabase
      .from('boats')
      .select('*')
      .eq('owner_id', user.id)
      .order('boat_name')

    setMyBoats((mine as Boat[]) ?? [])

    // Unclaimed boats in same club
    if (cid) {
      const { data: unclaimed } = await supabase
        .from('boats')
        .select('*')
        .eq('club_id', cid)
        .is('owner_id', null)
        .order('boat_name')
      setUnclaimedBoats((unclaimed as Boat[]) ?? [])
    }

    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchBoats()
  }, [fetchBoats])

  const filteredUnclaimed = unclaimedBoats.filter(b =>
    !claimSearch ||
    b.boat_name.toLowerCase().includes(claimSearch.toLowerCase()) ||
    (b.sail_number ?? '').toLowerCase().includes(claimSearch.toLowerCase()) ||
    (b.class ?? '').toLowerCase().includes(claimSearch.toLowerCase())
  )

  async function handleClaim(boat: Boat) {
    if (!user) return
    setClaimLoading(true)
    const supabase = getBrowserClient()
    const { error } = await supabase
      .from('boats')
      .update({ owner_id: user.id, owner_name: null })
      .eq('id', boat.id)
    setClaimLoading(false)
    if (!error) {
      showSuccess(`${boat.boat_name} claimed!`)
      fetchBoats()
    }
  }

  function openAdd() {
    setEditingBoat(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setShowAddForm(true)
  }

  function openEdit(boat: Boat) {
    setEditingBoat(boat)
    setForm({
      boat_name: boat.boat_name,
      class: boat.class ?? '',
      sail_number: boat.sail_number ?? '',
      hull_colour: boat.hull_colour ?? '',
      length_m: boat.length_m !== null ? String(boat.length_m) : '',
      py_handicap: boat.py_handicap !== null ? String(boat.py_handicap) : '',
      status: boat.status ?? 'active',
    })
    setFormError(null)
    setShowAddForm(true)
  }

  function closeForm() {
    setShowAddForm(false)
    setEditingBoat(null)
    setForm(EMPTY_FORM)
    setFormError(null)
  }

  async function handleFormSave(e: React.FormEvent) {
    e.preventDefault()
    // Boats belong to the person, not a club — no club required to add one.
    if (!user) return
    if (!form.boat_name.trim()) {
      setFormError('Boat name is required')
      return
    }
    setFormSaving(true)
    setFormError(null)
    const supabase = getBrowserClient()

    const payload = {
      boat_name: form.boat_name.trim(),
      class: form.class.trim() || null,
      sail_number: form.sail_number.trim() || null,
      hull_colour: form.hull_colour.trim() || null,
      length_m: form.length_m !== '' ? parseFloat(form.length_m) : null,
      py_handicap: form.py_handicap !== '' ? parseInt(form.py_handicap, 10) : null,
      status: form.status || 'active',
    }

    let error
    if (editingBoat) {
      ;({ error } = await supabase.from('boats').update(payload).eq('id', editingBoat.id))
    } else {
      ;({ error } = await supabase.from('boats').insert({
        ...payload,
        owner_id: user.id,
        club_id: clubId, // optional legacy link; boat is owned by owner_id
      }))
    }

    setFormSaving(false)
    if (error) {
      setFormError(error.message)
    } else {
      showSuccess(editingBoat ? 'Boat updated!' : 'Boat added!')
      closeForm()
      fetchBoats()
    }
  }

  async function handleDelete(boatId: string) {
    const supabase = getBrowserClient()
    const { error } = await supabase.from('boats').delete().eq('id', boatId)
    setDeletingId(null)
    if (!error) {
      showSuccess('Boat removed')
      fetchBoats()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400 text-sm">Loading boats…</div>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Boats</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your registered boats for race entries.</p>
        </div>
        <Button onClick={openAdd} className="shrink-0">+ Add boat</Button>
      </div>

      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
          ✅ {successMsg}
        </div>
      )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <Card className="border-blue-200">
          <CardHeader>
            <CardTitle>{editingBoat ? 'Edit boat' : 'Add new boat'}</CardTitle>
            <button onClick={closeForm} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
          </CardHeader>
          <form onSubmit={handleFormSave} className="space-y-4">
            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{formError}</div>
            )}
            <Input
              label="Boat name"
              required
              value={form.boat_name}
              onChange={e => setForm(f => ({ ...f, boat_name: e.target.value }))}
              placeholder="e.g. Seagull"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Class"
                value={form.class}
                onChange={e => setForm(f => ({ ...f, class: e.target.value }))}
                placeholder="e.g. Laser"
              />
              <Input
                label="Sail number"
                value={form.sail_number}
                onChange={e => setForm(f => ({ ...f, sail_number: e.target.value }))}
                placeholder="e.g. 12345"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Hull colour"
                value={form.hull_colour}
                onChange={e => setForm(f => ({ ...f, hull_colour: e.target.value }))}
                placeholder="e.g. White"
              />
              <Input
                label="Length (m)"
                type="number"
                min="0"
                step="0.1"
                value={form.length_m}
                onChange={e => setForm(f => ({ ...f, length_m: e.target.value }))}
                placeholder="e.g. 4.2"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="PY handicap"
                type="number"
                min="0"
                value={form.py_handicap}
                onChange={e => setForm(f => ({ ...f, py_handicap: e.target.value }))}
                placeholder="e.g. 1100"
              />
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="active">Active</option>
                  <option value="laid_up">Laid up</option>
                  <option value="for_sale">For sale</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={formSaving} className="flex-1">
                {formSaving ? 'Saving…' : editingBoat ? 'Save changes' : 'Add boat'}
              </Button>
              <Button type="button" variant="ghost" onClick={closeForm}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {/* My boats */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Your boats</h2>
        {myBoats.length === 0 ? (
          <Card className="text-center py-8">
            <p className="text-gray-400 text-sm">You have no boats registered yet.</p>
            <p className="text-gray-400 text-xs mt-1">Add a new boat or claim an unclaimed one below.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {myBoats.map(boat => (
              <Card key={boat.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{boat.boat_name}</span>
                      {boat.status && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[boat.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABELS[boat.status] ?? boat.status}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      {boat.class && <span>⛵ {boat.class}</span>}
                      {boat.sail_number && <span># {boat.sail_number}</span>}
                      {boat.hull_colour && <span>🎨 {boat.hull_colour}</span>}
                      {boat.py_handicap && <span>PY {boat.py_handicap}</span>}
                      {boat.length_m && <span>{boat.length_m}m</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => openEdit(boat)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                    {deletingId === boat.id ? (
                      <div className="flex gap-1 items-center">
                        <button
                          onClick={() => handleDelete(boat.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="text-xs text-gray-400 hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingId(boat.id)}
                        className="text-xs text-red-400 hover:underline"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Claim a boat */}
      {clubId && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Claim an unclaimed boat</h2>
          <div className="mb-3">
            <Input
              placeholder="Search by boat name, class or sail number…"
              value={claimSearch}
              onChange={e => setClaimSearch(e.target.value)}
            />
          </div>
          {filteredUnclaimed.length === 0 ? (
            <Card className="text-center py-6">
              <p className="text-gray-400 text-sm">
                {claimSearch ? 'No unclaimed boats match your search.' : 'No unclaimed boats in your club.'}
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredUnclaimed.map(boat => (
                <Card key={boat.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-medium text-gray-900 text-sm">{boat.boat_name}</span>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-0.5">
                      {boat.class && <span>⛵ {boat.class}</span>}
                      {boat.sail_number && <span># {boat.sail_number}</span>}
                      {boat.owner_name && <span>Previously: {boat.owner_name}</span>}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => handleClaim(boat)}
                    disabled={claimLoading}
                    className="shrink-0 text-sm"
                  >
                    Claim
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
