import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/ui/Modal'
import ErrorBanner from '@/components/ui/ErrorBanner'
import { roleLabel } from '@/lib/access'
import { functionError } from '@/lib/errors'
import { modalFooter, secondaryButton, primaryButton, labelClass, fieldClass, hintClass } from '@/lib/controlStyles'
import { todayISO } from '@/lib/dates'

const ROLES = ['employee', 'store_manager', 'owner', 'super_admin']

// Giving somebody an account, from Users. Super admin only, which the
// invite-user function checks again because it runs with the service key.
//
// It sends an invite: an email with a link to choose their own password. No
// password is typed here, so none passes through anybody else. The person on
// the team list it belongs to can be linked at the same time, which is what
// gives them My shifts.
export default function AddUserModal({ restaurants, onClose, onAdded }) {
    const [fullName, setFullName] = useState('')
    const [email, setEmail] = useState('')
    const [role, setRole] = useState('employee')
    const [restaurantId, setRestaurantId] = useState(restaurants.length === 1 ? restaurants[0].id : '')
    const [employeeId, setEmployeeId] = useState('')
    const [people, setPeople] = useState([])
    const [error, setError] = useState('')
    const [sending, setSending] = useState(false)

    // People at that restaurant with no account yet, still working there. The
    // first choice also fills the name, because it is nearly always theirs.
    useEffect(() => {
        let alive = true
        if (!restaurantId) return () => { alive = false }
        supabase.from('employees')
            .select('id, full_name, user_id, ended_on')
            .eq('restaurant_id', restaurantId)
            .is('user_id', null)
            .order('full_name')
            .then(({ data }) => {
                if (!alive) return
                const today = todayISO()
                setPeople((data || []).filter(p => !p.ended_on || p.ended_on >= today))
            })
        return () => { alive = false }
    }, [restaurantId])

    function pickPerson(id) {
        setEmployeeId(id)
        const person = people.find(p => p.id === id)
        if (person && !fullName.trim()) setFullName(person.full_name)
    }

    async function send(e) {
        e.preventDefault()
        setError('')
        setSending(true)
        const { data, error: failed } = await supabase.functions.invoke('invite-user', {
            body: {
                fullName,
                email,
                role,
                restaurantId: restaurantId || null,
                employeeId: employeeId || null,
                origin: window.location.origin,
            },
        })
        setSending(false)
        if (failed) { setError(await functionError(failed)); return }
        if (data?.error) { setError(data.error); return }
        onAdded(`Invite sent to ${email.trim()}. They choose their own password from the email. The link `
            + 'expires after an hour; after that they can use Forgot your password on the sign in screen.')
    }

    return (
        <Modal title="Add an account" onClose={onClose}>
            <form onSubmit={send}>
                <div className="px-6 py-4 space-y-4">
                    {error && <ErrorBanner>{error}</ErrorBanner>}

                    <div>
                        <label className={labelClass} htmlFor="add-restaurant">Restaurant</label>
                        <select
                            id="add-restaurant"
                            value={restaurantId}
                            onChange={e => { setRestaurantId(e.target.value); setEmployeeId(''); setPeople([]) }}
                            className={fieldClass}
                        >
                            <option value="">{role === 'super_admin' ? 'None, they see every restaurant' : 'Pick a restaurant'}</option>
                            {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>

                    {restaurantId && (
                        <div>
                            <label className={labelClass} htmlFor="add-person">Person on the team</label>
                            <select
                                id="add-person"
                                value={employeeId}
                                onChange={e => pickPerson(e.target.value)}
                                className={fieldClass}
                            >
                                <option value="">Nobody, or link them later on Team</option>
                                {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                            </select>
                            <p className={hintClass}>Linking gives them My shifts. Only people with no account are listed.</p>
                        </div>
                    )}

                    <div>
                        <label className={labelClass} htmlFor="add-name">Name</label>
                        <input id="add-name" value={fullName} onChange={e => setFullName(e.target.value)} required className={fieldClass} />
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="add-email">Email address</label>
                        <input
                            id="add-email"
                            type="email"
                            autoComplete="off"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            className={fieldClass}
                        />
                        <p className={hintClass}>
                            Their own address. Anybody who reads the inbox can reset the password.
                        </p>
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="add-role">Role</label>
                        <select id="add-role" value={role} onChange={e => setRole(e.target.value)} className={fieldClass}>
                            {ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                        </select>
                    </div>
                </div>

                <div className={modalFooter}>
                    <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                    <button type="submit" disabled={sending} className={primaryButton()}>
                        {sending ? 'Sending...' : 'Send the invite'}
                    </button>
                </div>
            </form>
        </Modal>
    )
}
