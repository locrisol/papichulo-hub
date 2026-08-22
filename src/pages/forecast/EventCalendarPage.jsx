import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRestaurant } from '../../context/RestaurantContext'
import { secondaryButton, card } from '../../lib/controlStyles'
import { useAuth } from '../../context/AuthContext'
import { can, MANAGERS } from '../../lib/access'
import { todayISO, weekStartOf, addDays, shortDate, monthStart, addMonths, monthLabel } from '../../lib/dates'
import { syncEvents, syncIsDue, markSynced } from '../../lib/ticketmaster'
import { fmtMoney } from '../../lib/format'
import { friendlyError } from '../../lib/errors'

// What is on at 3Arena.
//
// Knowing there is a concert on Thursday changes how you staff it, so this is
// useful on its own without any prediction behind it.
//
// It also quietly builds the history. Ticketmaster forgets an event once it has
// happened, so every sync writes what it finds into our own table and never
// deletes. Given a few months that becomes something a model could learn from,
// which is why #59 is deferred rather than dropped.

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Colour by the broad type, so a glance tells you what kind of night it is.
const CATEGORY_STYLE = {
    Music: 'bg-purple-50 text-purple-800 border-purple-200',
    Sports: 'bg-blue-50 text-blue-800 border-blue-200',
    Arts: 'bg-pink-50 text-pink-800 border-pink-200',
    'Arts & Theatre': 'bg-pink-50 text-pink-800 border-pink-200',
    Family: 'bg-amber-50 text-amber-800 border-amber-200',
}

function categoryStyle(category) {
    return CATEGORY_STYLE[category] || 'bg-gray-100 text-gray-700 border-gray-200'
}

export default function EventCalendarPage() {
    const { activeRestaurant } = useRestaurant()
    const { user } = useAuth()

    // Only managers write to the events table, so only they trigger a sync.
    // An employee opening the page just reads what is already there, which is
    // fine: somebody looks at this most days.
    const canSync = can(user, MANAGERS)

    const [events, setEvents] = useState([])
    const [upcoming, setUpcoming] = useState([])
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(false)
    const [error, setError] = useState('')
    const [note, setNote] = useState('')
    const [refresh, setRefresh] = useState(0)

    const today = todayISO()

    // Which month the grid is showing. Starts on this one, and you can move
    // either way from there.
    const [viewMonth, setViewMonth] = useState(monthStart(todayISO()))

    // Six weeks always, so the grid does not change height as you move between
    // months. It starts on the Sunday before the first, so the columns line up.
    const gridStart = weekStartOf(viewMonth)
    const gridEnd = addDays(gridStart, 41)

    const venueId = activeRestaurant?.forecasting_venue_id
    const enabled = activeRestaurant?.forecasting_enabled

    useEffect(() => {
        if (!activeRestaurant || !enabled) { setLoading(false); return }

        async function load() {
            setLoading(true)
            setError('')

            // Fetch from Ticketmaster at most twice a day. The calendar does not
            // change often enough to justify a network call every time someone
            // opens the page, and the free tier is generous but not infinite.
            if (canSync && syncIsDue() && venueId) {
                try {
                    setSyncing(true)
                    const r = await syncEvents(supabase, venueId)
                    markSynced()
                    if (r.added > 0) {
                        setNote(`Found ${r.added} new ${r.added === 1 ? 'event' : 'events'}.`)
                    }
                } catch (e) {
                    // A failed sync is not a failed page. Whatever is already in
                    // the table is still worth showing.
                    setError(`Could not check Ticketmaster: ${friendlyError(e)}`)
                } finally {
                    setSyncing(false)
                }
            }

            const { data, error: e1 } = await supabase
                .from('events')
                .select('*')
                .gte('event_date', gridStart)
                .lte('event_date', gridEnd)
                .order('event_date', { ascending: true })

            if (e1) { setError(friendlyError(e1)); setLoading(false); return }
            setEvents(data || [])

            // Everything still to come, whatever month the grid is showing. The
            // list is for planning ahead, so it should not change when you look
            // back at last month.
            const { data: ahead } = await supabase
                .from('events')
                .select('*')
                .gte('event_date', today)
                .order('event_date', { ascending: true })
                .limit(30)

            setUpcoming(ahead || [])
            setLoading(false)
        }

        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeRestaurant, viewMonth, refresh])

    async function forceSync() {
        if (!venueId) return
        setSyncing(true)
        setError('')
        setNote('')
        try {
            const r = await syncEvents(supabase, venueId)
            markSynced()
            setNote(`Checked Ticketmaster: ${r.total} events, ${r.added} new.`)
            setRefresh(n => n + 1)
        } catch (e) {
            setError(`Could not check Ticketmaster: ${friendlyError(e)}`)
        } finally {
            setSyncing(false)
        }
    }

    // Events grouped by the day they are on, so the grid can look each day up.
    const byDate = {}
    for (const e of events) {
        if (!byDate[e.event_date]) byDate[e.event_date] = []
        byDate[e.event_date].push(e)
    }

    // The whole grid as a flat list of dates.
    const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))

    if (!enabled) {
        return (
            <div className="w-full">
                <div className="mb-6">
                    <h2 className="font-serif text-2xl font-bold text-gray-900">Events</h2>
                </div>
                <div className={`${card} p-10 text-center`}>
                    <h3 className="font-serif text-lg font-bold text-gray-900 mb-2">Not turned on here</h3>
                    <p className="text-sm text-muted max-w-md mx-auto">
                        Events are only tracked for restaurants near a large venue. {activeRestaurant?.name} does not
                        have one, so there is nothing to show.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="w-full">
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="font-serif text-2xl font-bold text-gray-900">Events at 3Arena</h2>
                    <p className="text-sm text-muted mt-1">
                        {activeRestaurant?.name} is a few minutes' walk away, so a full arena is a busy night here.
                    </p>
                </div>
                {canSync && (
                    <button
                        onClick={forceSync}
                        disabled={syncing}
                        className={secondaryButton}
                    >
                        {syncing ? 'Checking...' : 'Check for new events'}
                    </button>
                )}
            </div>

            {error && <div className="bg-amber-50 text-amber-700 text-sm rounded-lg p-3 mb-4">{error}</div>}
            {note && <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3 mb-4">{note}</div>}

            {/* Month navigation.

                The buttons carry a whole month name, so "‹ July 2026" and
                "September 2026 ›" together are far wider than a phone. Wrapping
                let them fall onto three lines with the month you are actually
                looking at stuck in the middle of them.

                On a phone the month you are on goes on top where it belongs, and
                the two buttons sit side by side underneath, each taking half the
                row. From the small breakpoint up it goes back to one row with
                the month between the buttons. */}
            <div className={`${card} p-3 mb-4`}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <p className="font-serif text-lg font-bold text-gray-900 sm:hidden">
                        {monthLabel(viewMonth)}
                    </p>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setViewMonth(addMonths(viewMonth, -1))}
                            className={`${secondaryButton} flex-1 sm:flex-none`}>
                            ‹ {monthLabel(addMonths(viewMonth, -1))}
                        </button>
                        <span className="hidden sm:block font-serif text-lg font-bold text-gray-900 px-2">
                            {monthLabel(viewMonth)}
                        </span>
                        <button type="button" onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                            className={`${secondaryButton} flex-1 sm:flex-none`}>
                            {monthLabel(addMonths(viewMonth, 1))} ›
                        </button>
                    </div>
                    {viewMonth !== monthStart(today) && (
                        <button type="button" onClick={() => setViewMonth(monthStart(today))}
                            className="sm:ml-2 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium text-left sm:text-center">
                            This month
                        </button>
                    )}
                </div>
            </div>

            {loading ? (
                <p className="text-sm text-gray-400">Loading...</p>
            ) : (
                // Full width on a laptop: the calendar takes two thirds and the
                // list sits beside it. On anything narrower they stack.
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

                    <div className={`xl:col-span-2 ${card} overflow-hidden`}>
                        <div className="grid grid-cols-7 border-b border-border bg-gray-50">
                            {DAY_NAMES.map(d => (
                                <div key={d} className="px-2 py-2 text-center text-xs font-semibold text-muted uppercase tracking-wider">
                                    {d}
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-7">
                            {days.map(date => {
                                const dayEvents = byDate[date] || []
                                const isToday = date === today
                                const isPast = date < today
                                // Days either side of the month being shown are
                                // greyed, so the month you are looking at stands out.
                                const inMonth = date.slice(0, 7) === viewMonth.slice(0, 7)
                                const d = new Date(date + 'T00:00:00')

                                return (
                                    <div
                                        key={date}
                                        className={`min-h-24 border-b border-r border-border p-1.5 ${
                                            !inMonth ? 'bg-gray-50' : isPast ? 'bg-gray-50/50' : 'bg-white'
                                        }`}
                                    >
                                        <div className={`text-xs mb-1 ${
                                            isToday ? 'font-bold text-accent'
                                                : !inMonth ? 'text-gray-300'
                                                    : isPast ? 'text-gray-400' : 'text-gray-500'
                                        }`}>
                                            {d.getDate()}
                                            {d.getDate() === 1 && (
                                                <span className="ml-1">{d.toLocaleDateString('en-IE', { month: 'short' })}</span>
                                            )}
                                        </div>

                                        <div className="space-y-1">
                                            {dayEvents.map(e => (
                                                <div
                                                    key={e.id}
                                                    title={`${e.name}${e.event_time ? ` at ${e.event_time.slice(0, 5)}` : ''}`}
                                                    className={`text-xs px-1.5 py-1 rounded border leading-tight ${categoryStyle(e.category)} ${
                                                        isPast || !inMonth ? 'opacity-50' : ''
                                                    }`}
                                                >
                                                    <div className="truncate font-medium">{e.name}</div>
                                                    {e.event_time && (
                                                        <div className="opacity-70">{e.event_time.slice(0, 5)}</div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <div className={`${card} p-5`}>
                        <h3 className="font-serif text-base font-bold text-gray-900 mb-1">Coming up</h3>
                        <p className="text-xs text-muted mb-4">
                            {upcoming.length === 0
                                ? 'Nothing scheduled yet.'
                                : `The next ${upcoming.length} ${upcoming.length === 1 ? 'event' : 'events'}, whatever month you are looking at.`}
                        </p>

                        <div className="divide-y divide-border">
                            {upcoming.map(e => (
                                <div key={e.id} className="py-3">
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                        <p className="text-sm font-medium text-gray-900">{e.name}</p>
                                        <span className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${categoryStyle(e.category)}`}>
                                            {e.category || 'Other'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted">
                                        {shortDate(e.event_date)}
                                        {e.event_time && ` at ${e.event_time.slice(0, 5)}`}
                                    </p>
                                    {/* Off sale well before the date usually means it
                                        sold out, which says more about how busy we
                                        will be than the category does. */}
                                    {e.status === 'offsale' && (
                                        <p className="text-xs text-amber-700 mt-0.5">
                                            No longer on sale, so it has probably sold out
                                        </p>
                                    )}
                                    {(e.min_price != null || e.max_price != null) && (
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            Tickets {e.min_price != null ? fmtMoney(e.min_price) : '?'}
                                            {e.max_price != null && e.max_price !== e.min_price && ` to ${fmtMoney(e.max_price)}`}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>

                        <p className="text-xs text-gray-400 mt-4 pt-4 border-t border-border">
                            {canSync
                                ? 'Ticket numbers and how many people will attend are not in the free Ticketmaster API, so we cannot show them. Events are saved here as they are found, so once there are a few months of them we can start comparing event nights against what we actually sold.'
                                : 'Events come from Ticketmaster and are updated a couple of times a day.'}
                        </p>
                    </div>
                </div>
            )}
        </div>
    )
}