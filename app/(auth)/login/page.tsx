'use client'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

function LoginForm() {
  const searchParams = useSearchParams()
  const joinCode = searchParams.get('join')
  const raceToken = searchParams.get('race')
  const redirect = searchParams.get('redirect')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [magicSent, setMagicSent] = useState(false)

  function getRedirectUrl() {
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    if (raceToken) return `${base}/race/join/${raceToken}`
    if (joinCode) return `${base}/join/${joinCode}`
    if (redirect) return `${base}${redirect}`
    return `${base}/dashboard`
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = getBrowserClient()
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    if (!data.session) {
      setError('Sign in succeeded but no session was created. Please try again.')
      setLoading(false)
      return
    }
    await new Promise(r => setTimeout(r, 500))
    window.location.href = getRedirectUrl()
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) { setError('Enter your email address'); return }
    setError('')
    setLoading(true)
    const supabase = getBrowserClient()
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: getRedirectUrl() },
    })
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setMagicSent(true)
    setLoading(false)
  }

  if (magicSent) {
    return (
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">📧</div>
          <h1 className="text-2xl font-bold text-gray-900">Check your email</h1>
          <p className="text-sm text-gray-500 mt-2">
            We&apos;ve sent a magic link to <strong>{email}</strong>
          </p>
          <p className="text-sm text-gray-500 mt-1">Click the link in the email to sign in — no password needed.</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <p className="font-medium">Not seeing it?</p>
          <ul className="mt-1 space-y-1 text-amber-700">
            <li>• Check your spam/junk folder</li>
            <li>• The link expires in 1 hour</li>
            <li>• Make sure <strong>{email}</strong> is correct</li>
          </ul>
        </div>
        <div className="mt-4 text-center space-y-2">
          <button
            onClick={() => { setMagicSent(false); setLoading(false) }}
            className="text-sm text-blue-600 hover:underline"
          >
            ← Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <Link href="/" className="inline-block text-2xl mb-3">⛵</Link>
        <h1 className="text-2xl font-bold text-gray-900">Sign in</h1>
        <p className="text-sm text-gray-500 mt-1">to Waypoint Racing</p>
      </div>

      {mode === 'password' ? (
        <form onSubmit={handlePasswordLogin} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
          <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <Button type="submit" loading={loading} className="w-full" size="lg">Sign in</Button>
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400">or</span></div>
          </div>
          <button
            type="button"
            onClick={() => { setMode('magic'); setError('') }}
            className="w-full py-2.5 rounded-xl border-2 border-gray-200 text-sm font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 transition-colors"
          >
            ✉️ Send me a magic link
          </button>
        </form>
      ) : (
        <form onSubmit={handleMagicLink} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="text-center mb-2">
            <p className="text-sm text-gray-500">No password needed — we&apos;ll email you a link to sign in</p>
          </div>
          <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <Button type="submit" loading={loading} className="w-full" size="lg">✉️ Send magic link</Button>
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400">or</span></div>
          </div>
          <button
            type="button"
            onClick={() => { setMode('password'); setError('') }}
            className="w-full py-2.5 rounded-xl border-2 border-gray-200 text-sm font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors"
          >
            🔑 Sign in with password
          </button>
        </form>
      )}

      <p className="text-center text-sm text-gray-500 mt-4">
        No account? <Link href={joinCode ? `/register?join=${joinCode}${raceToken ? `&race=${raceToken}` : ''}` : '/register'} className="text-blue-600 font-medium hover:underline">Register here</Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <Suspense fallback={<div className="text-gray-400 text-sm">Loading...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
