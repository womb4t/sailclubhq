'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

interface ClubResult {
  id: string
  name: string
  member_count?: number
}

export default function OnboardingPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ClubResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [vhfChannel, setVhfChannel] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  // Debounced search
  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([])
      setSearched(false)
      setShowCreate(false)
      return
    }

    setSearching(true)
    setError('')

    const supabase = getBrowserClient()
    const { data, error: err } = await supabase
      .from('clubs')
      .select('id, name')
      .ilike('name', `%${q.trim()}%`)
      .limit(5)

    if (err) {
      setError(err.message)
    } else {
      setResults(data ?? [])
    }
    setSearching(false)
    setSearched(true)
    setShowCreate(false)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300)
    return () => clearTimeout(timer)
  }, [query, search])

  async function handleJoin(clubId: string) {
    setError('')
    setLoading(true)

    const supabase = getBrowserClient()
    if (!user) { router.push('/login'); return }

    const { error: err } = await supabase
      .from('profiles')
      .update({ club_id: clubId, role: 'competitor' })
      .eq('id', user.id)

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    window.location.href = '/dashboard'
  }

  async function handleCreate() {
    if (!query.trim()) return

    setError('')
    setLoading(true)

    const supabase = getBrowserClient()
    if (!user) { router.push('/login'); return }

    const { data: club, error: clubErr } = await supabase
      .from('clubs')
      .insert({
        name: query.trim(),
        vhf_channel: vhfChannel.trim() || null,
      })
      .select()
      .single()

    if (clubErr) {
      setError(clubErr.message)
      setLoading(false)
      return
    }

    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ club_id: club.id, role: 'admin' })
      .eq('id', user.id)

    if (profileErr) {
      setError(profileErr.message)
      setLoading(false)
      return
    }

    window.location.href = '/dashboard'
  }

  const exactMatch = results.some(r => r.name.toLowerCase() === query.trim().toLowerCase())

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-4xl">⛵</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-3">Join or create your sailing club</h1>
          <p className="text-sm text-gray-500 mt-1">
            Start typing your club name to search
          </p>
        </div>

        <Card className="p-5">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Club name</label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Medway Yacht Club"
                autoFocus
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searching && (
                <p className="text-xs text-gray-400 mt-1">Searching...</p>
              )}
            </div>

            {/* Search results */}
            {searched && results.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Existing clubs</p>
                {results.map((club) => (
                  <button
                    key={club.id}
                    onClick={() => handleJoin(club.id)}
                    disabled={loading}
                    className="w-full text-left flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{club.name}</p>
                      <p className="text-xs text-gray-400">Tap to join</p>
                    </div>
                    <span className="text-blue-600 text-sm font-medium">Join →</span>
                  </button>
                ))}
              </div>
            )}

            {/* Create new option */}
            {searched && query.trim().length >= 2 && !exactMatch && (
              <div className="border-t border-gray-100 pt-3">
                {!showCreate ? (
                  <button
                    onClick={() => setShowCreate(true)}
                    className="w-full text-left flex items-center justify-between p-3 rounded-lg border border-dashed border-gray-300 hover:border-blue-300 hover:bg-blue-50 transition-all"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Create &ldquo;{query.trim()}&rdquo;
                      </p>
                      <p className="text-xs text-gray-400">
                        {results.length === 0 ? 'No clubs found — create yours' : 'Not listed? Create a new club'}
                      </p>
                    </div>
                    <span className="text-green-600 text-sm font-medium">+ New</span>
                  </button>
                ) : (
                  <div className="space-y-3 bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm font-medium text-green-800">
                      Create &ldquo;{query.trim()}&rdquo;
                    </p>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Default VHF channel (optional)</label>
                      <input
                        type="text"
                        value={vhfChannel}
                        onChange={(e) => setVhfChannel(e.target.value)}
                        placeholder="M2"
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <Button
                      onClick={handleCreate}
                      loading={loading}
                      className="w-full"
                      size="lg"
                    >
                      Create club
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* No results, too short */}
            {!searched && query.trim().length > 0 && query.trim().length < 2 && (
              <p className="text-xs text-gray-400 text-center">Keep typing to search...</p>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>
            )}
          </div>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-6">
          Have an invite code? Ask your club admin for the join link.
        </p>
      </div>
    </div>
  )
}
