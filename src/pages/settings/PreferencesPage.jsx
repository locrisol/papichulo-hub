import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { friendlyError } from '@/lib/errors'
import { landingChoices, landingFor, pageLabel } from '@/lib/nav'
import { homeFor } from '@/lib/access'
import { card, pageTitle, labelClass, hintClass, fieldClass, primaryButton } from '@/lib/controlStyles'
import ErrorBanner from '@/components/ui/ErrorBanner'

// Your own settings, not the restaurant's.
//
// One thing on it today. It has a page rather than a corner of Restaurant
// settings because it is a different kind of thing: Restaurant is how the shop
// is set up and this is how you like the app, and an owner sees no Restaurant
// page at all. It will get longer.
export default function PreferencesPage() {
    const { user, refreshUser } = useAuth()

    const choices = landingChoices(user)
    const [landing, setLanding] = useState(user?.landing_page || '')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState('')
    const [error, setError] = useState('')

    // The sections in the order the sidebar has them, because that is the order
    // somebody knows the app in.
    const sections = [...new Set(choices.map(c => c.section))]

    async function save(e) {
        e.preventDefault()
        setSaving(true)
        setSaved('')
        setError('')

        // A function rather than an update, and it is the only way this can be
        // written. The table's update policy is one sided on purpose: you may
        // write the rows below you and never your own, because your own row is
        // where your role is kept. See migration 010.
        const { error: err } = await supabase.rpc('set_my_landing_page', { page: landing || null })

        setSaving(false)
        if (err) { setError(friendlyError(err)); return }

        // The context holds the row every permission check reads, so it has to
        // be told. Without this the setting is saved and the app goes on
        // believing the old one until the next sign in, which is the one moment
        // it would have mattered.
        await refreshUser?.()
        setSaved('Saved.')
    }

    return (
        <div className="space-y-6">
            <h1 className={pageTitle}>Preferences</h1>

            {error && <ErrorBanner>{error}</ErrorBanner>}

            <form onSubmit={save} className={`${card} p-6 max-w-xl space-y-4`}>
                <div>
                    <label className={labelClass} htmlFor="landing">Open the Hub on</label>
                    <select
                        id="landing"
                        value={landing}
                        onChange={e => { setLanding(e.target.value); setSaved('') }}
                        className={fieldClass}
                    >
                        {/* What choosing nothing means, and nothing more than
                            that. It said "what it does now", which was true
                            until somebody chose something else and then sat
                            there claiming the Hub still opened on the dashboard
                            while it opened on the calendar. What it does now is
                            a fact about the account, not about this option, so
                            it is said once beside the button and read from the
                            row that was saved. */}
                        <option value="">{pageLabel(homeFor(user))} (nothing chosen)</option>
                        {sections.map(section => (
                            <optgroup key={section} label={section}>
                                {choices.filter(c => c.section === section).map(c => (
                                    <option key={c.path} value={c.path}>{c.label}</option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                    <p className={hintClass}>
                        Only pages your account can open are on the list, and it is checked
                        again every time you sign in, so this can never leave you landing on
                        a page that refuses you.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button type="submit" disabled={saving} className={primaryButton()}>
                        {saving ? 'Saving...' : 'Save'}
                    </button>
                    {saved && <span className="text-sm text-green-700">{saved}</span>}
                </div>

                {/* Read off the saved row rather than off the box above it, so
                    it says what the Hub does and not what you have picked but
                    not saved yet. Those are different sentences and only one of
                    them is true. */}
                <p className="text-sm text-muted">
                    Signing in takes you to{' '}
                    <strong className="text-gray-900">{pageLabel(landingFor(user))}</strong>.
                </p>
            </form>
        </div>
    )
}
