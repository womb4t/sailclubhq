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

  async function handleSubmit(e: React.FormEvent) {
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
    // Wait for cookies to be written before redirect
    await new Promise(r => setTimeout(r, 500))
    const dest = raceToken ? `/race/join/${raceToken}` : joinCode ? `/join/${joinCode}` : redirect || '/dashboard'
    window.location.href = dest
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <Link href="/" className="inline-block text-2xl mb-3">⛵</Link>
        <h1 className="text-2xl font-bold text-gray-900">Sign in</h1>
        <p className="text-sm text-gray-500 mt-1">to Sail Club HQ</p>
      </div>
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
        <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <Button type="submit" loading={loading} className="w-full" size="lg">Sign in</Button>
      </form>
      <p className="text-center text-sm text-gray-500 mt-4">
        No account? <Link href={joinCode ? `/register?join=${joinCode}` : '/register'} className="text-blue-600 font-medium hover:underline">Register here</Link>
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
