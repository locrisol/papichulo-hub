import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { friendlyError } from '../../lib/errors'
import { todayISO, addDays, fullDate } from '../../lib/dates'
import { dateField, pageTitle } from '../../lib/controlStyles'
import { whoWords, tableWords } from '../../lib/changeLog'
import ChangeLog from '../../components/settings/ChangeLog'

// Everything that has changed, and who changed it.
//
// The rows come from a table the app cannot write to, filled by a trigger in
// the database, so this is a window onto something rather than a screen that
// does anything. Super Admin only, and the policy on the table refuses everyone
// else, so this page showing nothing to somebody who reached it another way is
// the database's doing rather than a check here.
//
// A run of days at a time rather than everything ever. Loading the lot would be
// slow within a year and useless within two, and the question is nearly always
// about a particular week.

// Enough that a normal week comes back whole, which is what lets the two
// dropdowns filter what is already here instead of asking the database again.
const MOST = 500

export default function ChangesPage() {
    const [from, setFrom] = useState(addDays(todayISO(), -6))
    const [to, setTo] = useState(todayISO())

    const [entries, setEntries] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [capped, setCapped] = useState(false)

    const [who, setWho] = useState('')
    const [what, setWhat] = useState('')

    // The fetch lives inside the effect because the dates are the only thing
    // it depends on, and having it out here as a named function meant either a
    // stale copy in the effect or a lint rule turned off to hide that.
    useEffect(() => {
        let dropped = false

        async function fetchChanges() {
            setLoading(true)
            setError('')

            // The two days are the reader's days, not the database's. Local
            // midnight to local midnight, or a change made at half eleven at
            // night lands in the wrong one.
            const start = new Date(`${from}T00:00:00`)
            const end = new Date(`${to}T23:59:59.999`)

            const { data, error: e } = await supabase
                .from('change_log')
                .select('*')
                .gte('changed_at', start.toISOString())
                .lte('changed_at', end.toISOString())
                .order('changed_at', { ascending: false })
                .limit(MOST)

            // Two changes to the dates in quick succession can come back out
            // of order, and the slower one would win.
            if (dropped) return

            if (e) setError(friendlyError(e))
            else {
                setEntries(data || [])
                setCapped((data || []).length === MOST)
            }

            setLoading(false)
        }

        fetchChanges()
        return () => { dropped = true }
    }, [from, to])

    // Built from what came back rather than from a list written down here, so
    // the two only ever offer something there is an answer for.
    const people = [...new Set(entries.map(whoWords))].sort()
    const things = [...new Set(entries.map(e => e.table_name))]
        .sort((a, b) => tableWords(a).localeCompare(tableWords(b)))

    const shown = entries.filter(e =>
        (!who || whoWords(e) === who) && (!what || e.table_name === what))

    return (
        <div>
            <div className="mb-6">
                <h2 className={pageTitle}>Changes</h2>
                <p className="text-sm text-gray-500 mt-1">
                    Every edit, addition and deletion, written by the database itself
                </p>
            </div>

            {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                    {error}
                </div>
            )}

            {/* Wraps to two lines on a phone rather than scrolling sideways.
                The dates come first because they are the ones that always get
                touched; the other two are for narrowing what came back. */}
            <div className="flex flex-wrap items-end gap-3 mb-5">
                <div>
                    <label htmlFor="from" className="block text-xs font-semibold text-muted mb-1">From</label>
                    <input
                        id="from" type="date" value={from} max={to}
                        onChange={e => setFrom(e.target.value)}
                        className={dateField}
                    />
                </div>
                <div>
                    <label htmlFor="to" className="block text-xs font-semibold text-muted mb-1">To</label>
                    <input
                        id="to" type="date" value={to} min={from} max={todayISO()}
                        onChange={e => setTo(e.target.value)}
                        className={dateField}
                    />
                </div>
                <div>
                    <label htmlFor="who" className="block text-xs font-semibold text-muted mb-1">Who</label>
                    <select
                        id="who" value={who} onChange={e => setWho(e.target.value)}
                        className={dateField}
                    >
                        <option value="">Anyone</option>
                        {people.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="what" className="block text-xs font-semibold text-muted mb-1">What</label>
                    <select
                        id="what" value={what} onChange={e => setWhat(e.target.value)}
                        className={dateField}
                    >
                        <option value="">Everything</option>
                        {things.map(t => <option key={t} value={t}>{tableWords(t)}</option>)}
                    </select>
                </div>
            </div>

            {/* Saying it plainly rather than quietly showing the first five
                hundred. A list that has been cut off without saying so is worse
                than no list, because it reads as the whole answer. */}
            {capped && (
                <p className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
                    More than {MOST} changes in these days, so only the most recent {MOST} are
                    here. Narrow the dates to see the rest.
                </p>
            )}

            {loading ? (
                <p className="text-sm text-gray-400">Loading...</p>
            ) : (
                <>
                    <p className="text-xs text-muted mb-3">
                        {shown.length === entries.length
                            ? `${entries.length} change${entries.length === 1 ? '' : 's'}`
                            : `${shown.length} of ${entries.length} changes`}
                        {' between '}{fullDate(from)} and {fullDate(to)}. Newest first.
                    </p>

                    <ChangeLog entries={shown} />
                </>
            )}
        </div>
    )
}
