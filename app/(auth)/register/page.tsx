'use client'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { WaypointFooter } from '@/components/WaypointFooter'

function RegisterForm() {
  const searchParams = useSearchParams()
  const joinCode = searchParams.get('join')
  const raceToken = searchParams.get('race')

  // Step: 'account' → 'details' → done
  const [step, setStep] = useState<'account' | 'details'>('account')

  // Account step
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Details step
  const [phone, setPhone] = useState('')
  const [emergencyName, setEmergencyName] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')
  const [emergencyRelation, setEmergencyRelation] = useState('Spouse')

  // Boat (optional)
  const [ownsBoat, setOwnsBoat] = useState<boolean | null>(null)
  const [boatName, setBoatName] = useState('')
  const [boatClass, setBoatClass] = useState('')
  const [sailNumber, setSailNumber] = useState('')

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = getBrowserClient()

    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (signUpErr) {
      setError(signUpErr.message)
      setLoading(false)
      return
    }

    // If signUp already created a session (email confirmation disabled), skip signIn
    if (signUpData.session) {
      setLoading(false)
      setStep('details')
      return
    }

    // Otherwise try signing in
    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
    if (signInErr) {
      setError(signInErr.message)
      setLoading(false)
      return
    }
    if (!signInData.session) {
      setError('Account created but could not sign in. Try signing in manually.')
      setLoading(false)
      return
    }

    setLoading(false)
    setStep('details')
  }

  async function handleFinish() {
    setError('')
    setLoading(true)
    const supabase = getBrowserClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not logged in'); setLoading(false); return }

    // Update profile with details
    const profileComplete = !!(fullName.trim() && emergencyName.trim() && emergencyPhone.trim())
    const { error: profileErr } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        emergency_contact_name: emergencyName.trim() || null,
        emergency_contact_phone: emergencyPhone.trim() || null,
        emergency_contact_relation: emergencyRelation || null,
        profile_complete: profileComplete,
      })
      .eq('id', user.id)

    if (profileErr) {
      setError(profileErr.message)
      setLoading(false)
      return
    }

    // Create boat if provided
    if (ownsBoat && boatName.trim()) {
      // Get club_id from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('club_id')
        .eq('id', user.id)
        .maybeSingle()

      if (profile?.club_id) {
        await supabase.from('boats').insert({
          club_id: profile.club_id,
          owner_id: user.id,
          owner_name: fullName.trim(),
          boat_name: boatName.trim(),
          class: boatClass.trim() || null,
          sail_number: sailNumber.trim() || null,
        })
      }
    }

    // Invited via a race link: add them to that race's club (as a member) if
    // they aren't already in a club. This is how participants get into the
    // club backend without any admin action.
    if (raceToken) {
      try {
        await supabase.rpc('join_club_via_race', { p_token: raceToken })
      } catch {
        /* best-effort; entry still works even if club link fails */
      }
    }

    // Claim any anonymous race entry made on this device (from /race/go) so the
    // racer keeps the result they already sailed under a device participant_id.
    if (raceToken) {
      try {
        const participantId =
          typeof window !== 'undefined' ? localStorage.getItem('scq-participant-id') : null
        if (participantId) {
          const { data: race } = await supabase
            .from('races')
            .select('id')
            .eq('entry_token', raceToken)
            .maybeSingle()
          if (race) {
            // Reassign the device's anonymous entry to this account.
            await supabase
              .from('race_entries')
              .update({ user_id: user.id, participant_id: null })
              .eq('race_id', race.id)
              .eq('participant_id', participantId)
            // Re-point any queued/synced positions to the account too.
            await supabase
              .from('live_positions')
              .update({ user_id: user.id, participant_id: null })
              .eq('race_id', race.id)
              .eq('participant_id', participantId)
          }
        }
      } catch {
        /* best-effort claim; never block registration */
      }
    }

    setLoading(false)
    // Redirect — straight to the race centre when they came from a race link.
    window.location.href = raceToken ? `/race/centre/${raceToken}` : joinCode ? `/join/${joinCode}` : '/dashboard'
  }

  if (step === 'details') {
    return (
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-2xl mb-2">⛵</div>
          <h1 className="text-xl font-bold text-gray-900">Welcome, {fullName.split(' ')[0]}!</h1>
          <p className="text-sm text-gray-500 mt-1">A few more details so you&apos;re ready to race</p>
        </div>

        <div className="space-y-4">
          {/* Emergency Contact */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">📞 Emergency Contact</h3>
            <p className="text-xs text-gray-500">Required for race safety — the safety team sees this on race day</p>
            <Input
              label="Your phone number"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="07700 900000"
              type="tel"
            />
            <Input
              label="Emergency contact name"
              value={emergencyName}
              onChange={e => setEmergencyName(e.target.value)}
              placeholder="Their full name"
              required
            />
            <Input
              label="Emergency contact phone"
              value={emergencyPhone}
              onChange={e => setEmergencyPhone(e.target.value)}
              placeholder="Their phone number"
              type="tel"
              required
            />
            <div>
              <label className="text-sm font-medium text-gray-700">Relationship</label>
              <select
                value={emergencyRelation}
                onChange={e => setEmergencyRelation(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option>Spouse</option>
                <option>Partner</option>
                <option>Parent</option>
                <option>Sibling</option>
                <option>Friend</option>
                <option>Other</option>
              </select>
            </div>
          </div>

          {/* Boat */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">⛵ Do you own a boat?</h3>
            <p className="text-xs text-gray-500">You can add boats later too — this just speeds up race entry</p>

            {ownsBoat === null ? (
              <div className="flex gap-3">
                <button
                  onClick={() => setOwnsBoat(true)}
                  className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-medium text-gray-700 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                >
                  🚤 Yes
                </button>
                <button
                  onClick={() => setOwnsBoat(false)}
                  className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-colors"
                >
                  👋 No / Later
                </button>
              </div>
            ) : ownsBoat ? (
              <div className="space-y-3">
                <Input
                  label="Boat name"
                  value={boatName}
                  onChange={e => setBoatName(e.target.value)}
                  placeholder="e.g. Sea Breeze"
                  required
                />
                <Input
                  label="Class"
                  value={boatClass}
                  onChange={e => setBoatClass(e.target.value)}
                  placeholder="e.g. Laser, RS200, Topper"
                />
                <div>
                  <Input
                    label="Sail number"
                    value={sailNumber}
                    onChange={e => setSailNumber(e.target.value)}
                    placeholder="e.g. 12345"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Optional — not all boats have one</p>
                </div>
                <button
                  onClick={() => { setOwnsBoat(null); setBoatName(''); setBoatClass(''); setSailNumber('') }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  ← Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">No worries — you can add one any time from your dashboard.</p>
                <button onClick={() => setOwnsBoat(null)} className="text-xs text-blue-600 hover:text-blue-700 shrink-0 ml-2">Change</button>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <Button
            onClick={handleFinish}
            loading={loading}
            className="w-full"
            size="lg"
          >
            {raceToken ? '🏁 Continue to race entry' : '🎉 Get started'}
          </Button>

          <button
            onClick={() => {
              window.location.href = raceToken ? `/race/join/${raceToken}` : joinCode ? `/join/${joinCode}` : '/dashboard'
            }}
            className="w-full text-center text-xs text-gray-400 hover:text-gray-600 py-1"
          >
            Skip for now →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <Link href="/" className="inline-block text-2xl mb-3">⛵</Link>
        <h1 className="text-2xl font-bold text-gray-900">Create account</h1>
        <p className="text-sm text-gray-500 mt-1">Join Waypoint Racing</p>
      </div>
      <form onSubmit={handleCreateAccount} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <Input label="Full name" type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" autoComplete="name" required />
        <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
        <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" minLength={8} required />
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <Button type="submit" loading={loading} className="w-full" size="lg">Create account</Button>
      </form>
      <p className="text-center text-sm text-gray-500 mt-4">
        Already have an account? <Link href={joinCode ? `/login?join=${joinCode}${raceToken ? `&race=${raceToken}` : ''}` : '/login'} className="text-blue-600 font-medium hover:underline">Sign in</Link>
      </p>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 relative">
      <Suspense fallback={<div className="text-gray-400 text-sm">Loading...</div>}>
        <RegisterForm />
      </Suspense>
      <WaypointFooter tone="light" className="absolute bottom-0 inset-x-0" />
    </div>
  )
}
