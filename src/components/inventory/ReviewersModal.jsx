import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useConfirm } from '@/context/confirm'
import { friendlyError } from '@/lib/errors'
import { reviewerSummary } from '@/lib/productRequests'
import { modalFooter, secondaryButton } from '@/lib/controlStyles'
import Modal from '@/components/ui/Modal'
import ErrorBanner from '@/components/ui/ErrorBanner'
import Recipients from '@/components/reports/Recipients'

// Who gets an email when a store manager sends something for review.
//
// The same list the weekly report and the hours mail use, so there is one way
// of choosing who gets an email across the Hub. The super admin is always on
// it and shown by name, where the report has the owners; anybody else is an
// address typed in. It belongs to the brand rather than to one restaurant,
// so it is kept in brand_settings.
export default function ReviewersModal({ onClose }) {
    const confirm = useConfirm()
    const [fixed, setFixed] = useState([])
    const [extras, setExtras] = useState([])
    const [read, setRead] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        let alive = true
        async function load() {
            const [settings, admins] = await Promise.all([
                supabase.from('brand_settings').select('review_recipients').maybeSingle(),
                // Not a test account: a developer's login holds a real role.
                supabase.from('users').select('id, full_name')
                    .eq('role', 'super_admin').eq('is_active', true).eq('is_test', false)
                    .order('full_name'),
            ])
            if (!alive) return
            const failed = settings.error || admins.error
            if (failed) { setError(friendlyError(failed)); return }
            setExtras(settings.data?.review_recipients || [])
            // An owner reads only the accounts at their own restaurant, so the
            // super admin may not be one they can see. Still always on it.
            setFixed(admins.data?.length
                ? admins.data.map(a => ({ ...a, label: 'super admin' }))
                : [{ id: 'super-admin', full_name: 'The super admin', label: 'always on' }])
            setRead(true)
        }
        load()
        return () => { alive = false }
    }, [])

    async function change(list) {
        const gone = extras.filter(a => !list.includes(a))
        if (gone.length > 0) {
            const ok = await confirm({
                title: 'Remove from the list?',
                message: `${gone.join(', ')} will stop getting an email when something is sent for review.`,
                confirmLabel: 'Remove',
            })
            if (!ok) return
        }
        setSaving(true)
        setError('')
        const { error: e1 } = await supabase.from('brand_settings')
            .update({ review_recipients: list, updated_at: new Date().toISOString() })
            .eq('id', true)
        setSaving(false)
        if (e1) { setError(friendlyError(e1)); return }
        setExtras(list)
    }

    return (
        <Modal title="Reviewers" onClose={onClose} width="max-w-lg">
            <div className="px-6 py-4 space-y-3">
                <ErrorBanner>{error}</ErrorBanner>
                <Recipients
                    title="Reviewers"
                    owners={fixed}
                    extras={extras}
                    canEdit={read}
                    busy={saving}
                    onChange={change}
                    summary={reviewerSummary({ fixed, extras })}
                    note={'Who gets an email when a store manager sends something for review. The super admin '
                        + 'is always on it. It is answered on Products: by the super admin, or by an owner '
                        + 'of the restaurant that sent it, so add an owner here for them to hear about it.'}
                />
            </div>
            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>Done</button>
            </div>
        </Modal>
    )
}
