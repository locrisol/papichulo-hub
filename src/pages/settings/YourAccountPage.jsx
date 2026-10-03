import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useConfirm } from '@/context/confirm'
import { friendlyError } from '@/lib/errors'
import { landingChoices, landingFor, pageLabel } from '@/lib/nav'
import { homeFor } from '@/lib/access'
import { stampDate } from '@/lib/dates'
import { card, cardHeader, labelClass, hintClass, fieldClass, primaryButton, secondaryButton } from '@/lib/controlStyles'
import ErrorBanner from '@/components/ui/ErrorBanner'
import Notice from '@/components/ui/Notice'
import PageHeader from '@/components/ui/PageHeader'

// Your own settings, not the restaurant's. Every role has it.
//
// **Your password is changed by an emailed link, not typed here.** Supabase's
// one-off code is only checked on a session over a day old, so a screen asking
// for it would be pretending. The link is the same one Forgot your password
// sends, opening the same page, so there is one thing to build and test, and
// with Secure password change on Supabase insists on it: a phone left signed in
// is not enough to change the password.
//
// Changing it signs out every other phone and computer within the hour, which
// Supabase does by itself. Sign out on all devices is here for the other time
// that is wanted: a phone lost, or signed in on somebody else's.
//
// Open the Hub on is for managers, who have more than one page to choose from.
// It has a page rather than a corner of Restaurant settings because an owner
// sees no Restaurant page at all.
export default function YourAccountPage() {
    const { user, session, refreshUser } = useAuth()
    const confirm = useConfirm()
    const navigate = useNavigate()
    const email = session?.user?.email || ''

    const choices = landingChoices(user)
    const [landing, setLanding] = useState(user?.landing_page || '')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState('')
    const [error, setError] = useState('')
    const [sending, setSending] = useState(false)
    const [linkSent, setLinkSent] = useState(false)

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
        // where your role is kept. See set_my_landing_page in schema.sql.
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

    async function sendLink() {
        setError('')
        setSending(true)
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        setSending(false)
        if (err) { setError(friendlyError(err)); return }
        setLinkSent(true)
    }

    async function signOutEverywhere() {
        const ok = await confirm({
            title: 'Sign out on all devices?',
            message: 'Every phone and computer signed in as you, this one included, will need to sign in again.',
            confirmLabel: 'Sign out on all devices',
            cancelLabel: 'Go back',
        })
        if (!ok) return
        const { error: err } = await supabase.auth.signOut({ scope: 'global' })
        if (err) { setError(friendlyError(err)); return }
        navigate('/login')
    }

    return (
        <div className="space-y-6">
            <PageHeader title="Your account" subtitle={email} />

            {error && <ErrorBanner>{error}</ErrorBanner>}

            <section className={`${card} max-w-xl overflow-hidden`}>
                <h3 className={cardHeader}>Password</h3>
                <div className="p-6 space-y-4">
                    {user?.password_set_at && (
                        <p className="text-sm text-gray-700">
                            You chose this password on {stampDate(user.password_set_at)}.
                        </p>
                    )}
                    {linkSent ? (
                        <Notice tone="good">
                            We have sent a link to {email}. It works once and expires after an hour. Once you
                            have changed your password, any other phone or computer signed in as you is signed
                            out within the hour.
                        </Notice>
                    ) : (
                        <button type="button" disabled={sending} onClick={sendLink} className={primaryButton()}>
                            {sending ? 'Sending...' : 'Email me a link to change it'}
                        </button>
                    )}
                </div>
            </section>

            <section className={`${card} max-w-xl overflow-hidden`}>
                <h3 className={cardHeader}>Signed in</h3>
                <div className="p-6 space-y-3">
                    <p className="text-sm text-gray-700">
                        Sign out in the menu signs out this device only. If you lost a phone, or signed in
                        on somebody else&apos;s, sign out everywhere.
                    </p>
                    <button type="button" onClick={signOutEverywhere} className={secondaryButton}>
                        Sign out on all devices
                    </button>
                </div>
            </section>

            {choices.length > 0 && (
                <form onSubmit={save} className={`${card} max-w-xl overflow-hidden`}>
                    <h3 className={cardHeader}>Open the Hub on</h3>
                    <div className="p-6 space-y-4">
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
                                <option value="">{pageLabel(homeFor(user))} (default)</option>
                                {sections.map(section => (
                                    <optgroup key={section} label={section}>
                                        {choices.filter(c => c.section === section).map(c => (
                                            <option key={c.path} value={c.path}>{c.label}</option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                            <p className={hintClass}>
                                Only pages you can open are listed.
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
                    </div>
                </form>
            )}
        </div>
    )
}
