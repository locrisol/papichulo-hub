import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRestaurant } from '../../context/RestaurantContext'
import { secondaryButton, card, cardEdge } from '../../lib/controlStyles'
import { useAuth } from '../../context/AuthContext'
import { can, MANAGERS } from '../../lib/access'
import { todayISO, weekStartOf, addDays, monthStart } from '../../lib/dates'
import { syncEvents, syncIsDue, markSynced } from '../../lib/ticketmaster'
import { friendlyError } from '../../lib/errors'
import { byDate as groupByDate } from '../../lib/events'
import EventModal from '../../components/EventModal'
import EventMonth from '../../components/EventMonth'
import EventWeek from '../../components/EventWeek'
import EventAgenda from '../../components/EventAgenda'

// What is on at 3Arena.
//
// Knowing there is a concert on Thursday changes how you staff it, so this is
// useful on its own without any prediction behind it.
//
// It also quietly builds the history. Ticketmaster forgets an event once it has
// happened, so every sync writes what it finds into our own table and never
// deletes. Given a few months that becomes something a model could learn from.
//
// The calendar is one screen with two shapes. A phone opens on the week because
// a week is what you roster, and a laptop opens on the month because that is
// what you plan against. Either can be switched to the other, and the choice is
// only about which one you land on.

// The width at which a month grid stops being useless. Below this a cell is
// about fifty pixels and cannot hold a word, which is why the phone version of
// the month drops to dots. Matches Tailwind's lg, where the layout goes to two
// columns anyway.
const WIDE = '(min-width: 1024px)'

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
    const [openEvent, setOpenEvent] = useState(null)

    const today = todayISO()

    // Which shape the calendar is in. Worked out once, when the page first
    // opens, rather than watched: somebody who switches to the month and then
    // turns their phone should stay on the month.
    const [view, setView] = useState(
        () => (typeof window !== 'undefined' && window.matchMedia?.(WIDE).matches ? 'month' : 'week'),
    )

    const [viewMonth, setViewMonth] = useState(monthStart(today))
    const [weekStart, setWeekStart] = useState(weekStartOf(today))
    const [selectedDay, setSelectedDay] = useState(today)

    // What to fetch. Both shapes are asked for at once, so switching between
    // them is instant and does not go back to the database for something it
    // could already have had. It is at most eight weeks of a small table.
    const monthFrom = weekStartOf(viewMonth)
    const monthTo = addDays(monthFrom, 41)
    const from = weekStart < monthFrom ? weekStart : monthFrom
    const to = addDays(weekStart, 6) > monthTo ? addDays(weekStart, 6) : monthTo

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
                .gte('event_date', from)
                .lte('event_date', to)
                .order('event_date', { ascending: true })

            if (e1) { setError(friendlyError(e1)); setLoading(false); return }
            setEvents(data || [])

            // Everything still to come, whatever the calendar is showing. The
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
    }, [activeRestaurant, from, to, refresh])

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

    const byDate = groupByDate(events)

    // Switching to the week from the month lands on the week you were looking
    // at rather than back on today, and the other way round. Nothing is more
    // annoying than a view that throws away where you were.
    function switchTo(next) {
        if (next === 'week' && view === 'month') setWeekStart(weekStartOf(selectedDay))
        if (next === 'month' && view === 'week') {
            setViewMonth(monthStart(weekStart))
            setSelectedDay(weekStart)
        }
        setView(next)
    }

    const viewToggle = value => (
        <button
            type="button"
            onClick={() => switchTo(value)}
            aria-pressed={view === value}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors capitalize ${
                view === value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
        >
            {value}
        </button>
    )

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
            <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="font-serif text-2xl font-bold text-gray-900">Events at 3Arena</h2>
                    <p className="text-sm text-muted mt-1">
                        {activeRestaurant?.name} is a few minutes' walk away, so a full arena is a busy night here.
                    </p>
                </div>
                {canSync && (
                    <button onClick={forceSync} disabled={syncing} className={secondaryButton}>
                        {syncing ? 'Checking...' : 'Check for new events'}
                    </button>
                )}
            </div>

            {error && <div className="bg-amber-50 text-amber-700 text-sm rounded-lg p-3 mb-4">{error}</div>}
            {note && <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3 mb-4">{note}</div>}

            {/* Month or week. The arrows that move through them belong to the
                calendar itself and sit on its heading bar, so this row only
                holds the one choice and does not turn into a control panel. */}
            <div className={`${cardEdge} bg-white p-2 mb-4 flex justify-center`}>
                <div className="inline-flex bg-gray-100 rounded-lg p-1 gap-1" role="group" aria-label="Calendar view">
                    {viewToggle('week')}
                    {viewToggle('month')}
                </div>
            </div>

            {loading ? (
                <p className="text-sm text-gray-400">Loading...</p>
            ) : (
                // The calendar takes two thirds on a laptop and the list sits
                // beside it. items-start stops each being stretched to whichever
                // is taller, which is what left the big empty gap under the
                // calendar when the list had thirty events in it.
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                    <div className="lg:col-span-2">
                        {view === 'month' ? (
                            <EventMonth
                                viewMonth={viewMonth}
                                setViewMonth={setViewMonth}
                                today={today}
                                byDate={byDate}
                                selected={selectedDay}
                                onSelect={setSelectedDay}
                                onOpenEvent={setOpenEvent}
                            />
                        ) : (
                            <EventWeek
                                weekStart={weekStart}
                                setWeekStart={setWeekStart}
                                today={today}
                                byDate={byDate}
                                onOpenEvent={setOpenEvent}
                            />
                        )}
                    </div>

                    <EventAgenda
                        events={upcoming}
                        today={today}
                        onOpenEvent={setOpenEvent}
                        footnote={canSync
                            ? 'Ticket numbers and how many people will attend are not in the free Ticketmaster API, so we cannot show them. Events are saved here as they are found, so once there are a few months of them we can start comparing event nights against what we actually sold.'
                            : 'Events come from Ticketmaster and are updated a couple of times a day.'}
                    />
                </div>
            )}

            {openEvent && <EventModal event={openEvent} onClose={() => setOpenEvent(null)} />}
        </div>
    )
}
