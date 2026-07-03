'use client'
import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import type { Profile } from '@/types/database'

const EXPERIENCE_LEVELS = [
  { value: '', label: 'Select level…' },
  { value: 'novice', label: 'Novice' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'experienced', label: 'Experienced' },
  { value: 'instructor', label: 'Instructor' },
]

const RELATIONSHIPS = [
  { value: '', label: 'Select relationship…' },
  { value: 'Spouse', label: 'Spouse' },
  { value: 'Partner', label: 'Partner' },
  { value: 'Parent', label: 'Parent' },
  { value: 'Sibling', label: 'Sibling' },
  { value: 'Friend', label: 'Friend' },
  { value: 'Other', label: 'Other' },
]

export default function ProfilePage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [ryaNumber, setRyaNumber] = useState('')
  const [experienceLevel, setExperienceLevel] = useState('')
  const [emergencyContactName, setEmergencyContactName] = useState('')
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('')
  const [emergencyContactRelation, setEmergencyContactRelation] = useState('')
  const [medicalNotes, setMedicalNotes] = useState('')
  const [profileComplete, setProfileComplete] = useState(false)

  useEffect(() => {
    if (!user) return
    async function load() {
      const supabase = getBrowserClient()
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .maybeSingle()

      if (data) {
        const p = data as Profile
        setFullName(p.full_name ?? '')
        setPhone(p.phone ?? '')
        setRyaNumber(p.rya_number ?? '')
        setExperienceLevel(p.experience_level ?? '')
        setEmergencyContactName(p.emergency_contact_name ?? '')
        setEmergencyContactPhone(p.emergency_contact_phone ?? '')
        setEmergencyContactRelation(p.emergency_contact_relation ?? '')
        setMedicalNotes(p.medical_notes ?? '')
        setProfileComplete(p.profile_complete ?? false)
      }
      setDirty(false)
      setSaved(false)
      setLoading(false)
    }
    load()
  }, [user])

  const isComplete = fullName.trim() !== '' && emergencyContactName.trim() !== '' && emergencyContactPhone.trim() !== ''

  // Mark the form dirty (and clear the saved state) whenever a field changes.
  function markDirty() {
    setDirty(true)
    setSaved(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    setError(null)
    setSaved(false)

    const supabase = getBrowserClient()
    const { error: err } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
        rya_number: ryaNumber.trim() || null,
        experience_level: experienceLevel || null,
        emergency_contact_name: emergencyContactName.trim() || null,
        emergency_contact_phone: emergencyContactPhone.trim() || null,
        emergency_contact_relation: emergencyContactRelation || null,
        medical_notes: medicalNotes.trim() || null,
        profile_complete: isComplete,
      })
      .eq('id', user.id)

    setSaving(false)
    if (err) {
      setError(err.message)
    } else {
      setProfileComplete(isComplete)
      setSaved(true)
      setDirty(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400 text-sm">Loading profile…</div>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500 mt-1">Keep your details up to date for race entries and safety.</p>
      </div>

      {!profileComplete && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          ⚠️ Complete your profile to enter races
        </div>
      )}

      {saved && !dirty && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
          ✅ Profile saved successfully
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          ❌ {error}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {/* Personal Details */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Details</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <Input
              label="Full name"
              required
              value={fullName}
              onChange={e => { setFullName(e.target.value); markDirty() }}
              placeholder="Your full name"
            />
            <Input
              label="Phone number"
              type="tel"
              value={phone}
              onChange={e => { setPhone(e.target.value); markDirty() }}
              placeholder="+44 7700 000000"
            />
            <Input
              label="RYA membership number"
              value={ryaNumber}
              onChange={e => { setRyaNumber(e.target.value); markDirty() }}
              placeholder="Optional"
            />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Experience level</label>
              <select
                value={experienceLevel}
                onChange={e => { setExperienceLevel(e.target.value); markDirty() }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {EXPERIENCE_LEVELS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {/* Emergency Contact */}
        <Card>
          <CardHeader>
            <CardTitle>Emergency Contact</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <Input
              label="Contact name"
              value={emergencyContactName}
              onChange={e => { setEmergencyContactName(e.target.value); markDirty() }}
              placeholder="Full name"
            />
            <Input
              label="Contact phone"
              type="tel"
              value={emergencyContactPhone}
              onChange={e => { setEmergencyContactPhone(e.target.value); markDirty() }}
              placeholder="+44 7700 000000"
            />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Relationship</label>
              <select
                value={emergencyContactRelation}
                onChange={e => { setEmergencyContactRelation(e.target.value); markDirty() }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {RELATIONSHIPS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Medical notes</label>
              <textarea
                value={medicalNotes}
                onChange={e => { setMedicalNotes(e.target.value); markDirty() }}
                rows={3}
                placeholder="Allergies, conditions the safety team should know about"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
              <p className="text-xs text-gray-500">Only visible to race officers and safety team</p>
            </div>
          </div>
        </Card>

        <Button
          type="submit"
          disabled={saving || (saved && !dirty)}
          className={`w-full ${saved && !dirty ? 'bg-green-600 hover:bg-green-600' : ''}`}
        >
          {saving ? 'Saving…' : saved && !dirty ? '✓ Profile Saved' : 'Save profile'}
        </Button>
      </form>
    </div>
  )
}
