import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useRestaurant } from '@/context/restaurant'
import { can, MANAGERS } from '@/lib/access'
import { todayISO, weekStartOf, addDays, monthStart, addMonths, monthLabel, weekMonthLabel } from '@/lib/dates'
import { friendlyError } from '@/lib/errors'
import { syncEvents, syncIsDue, markSynced } from '@/lib/ticketmaster'
import { watchesVenue } from '@/lib/events'
import {
    LAYERS, layerOf, calendarItems, itemsByDate, kindLabel, kindDot, atRestaurant,
} from '@/lib/diary'
import {
    card, pageTitle, secondaryButton, segmentTrack, segmentButton, jumpButton, jumpLabel,
} from '@/lib/controlStyles'
import ErrorBanner from '@/components/ui/ErrorBanner'
import DiaryMonth from '@/components/diary/DiaryMonth'
import DiaryWeek from '@/components/diary/DiaryWeek'
import DiaryList from '@/components/diary/DiaryList'
import DiaryDialog from '@/components/diary/DiaryDialog'
import DiaryEntryModal from '@/components/diary/DiaryEntryModal'
import WeekExtrasModal from '@/components/roster/WeekExtrasModal'
import EventModal from '@/components/forecast/EventModal'

// One screen for what is coming up.
//
// This replaces the Events screen rather than sitting beside it. Events showed
// the 3Arena and nothing else, and only at Point Campus, because it was gated
// on forecasting. The same question asked about the rest of the business is
// this screen, so the Arena became one layer on it instead of the whole of it.
//
// Three sources are drawn together and none of them moves house to get here.
// The diary is its own table. The Arena stays in events and is still filled by
// the Ticketmaster sync. The deliveries stay in day_notes.extras where the
// roster has always kept them, and this only reads them.

const VIEWS = [
    { id: 'month', label: 'Month' },
    { id: 'week', label: 'Week' },
    { id: 'list', label: 'List' },
]

// Everything on, everywhere. The corporate orders were off in the month and
// the list to start with, on the grounds that the schedule for three weeks out
// does not exist yet so the far end would look emptier than it is. He asked for
// them on, and the near fortnight is what he opens the month for, so the reason
// was answering a question nobody was asking.
const OFF_BY_DEFAULT = { month: [], list: [], week: [] }

const WIDE = '(min-width: 1024px)'

export default function CalendarPage() {
    const { user } = useAuth()
    const { activeRestaurant } = useRestaurant()
    const today = todayISO()

    const canWrite = can(user, MANAGERS)

    // A laptop lands on the month because that is what you plan against, a
    // phone on the list because that is the question you opened it to ask and a
    // month cell on a phone cannot hold a word. Worked out once rather than
    // watched, so turning the phone does not throw away what you switched to.
    const firstView = () => (
        typeof window !== 'undefined' && window.matchMedia?.(WIDE).matches ? 'month' : 'list'
    )
    const [view, setView] = useState(firstView)

    const [viewMonth, setViewMonth] = useState(monthStart(today))
    const [weekStart, setWeekStart] = useState(weekStartOf(today))
    // Nothing open until somebody opens something. Today's row was expanded on
    // arrival, which pushed the rest of the month down before anybody had asked
    // it a question, and on a phone it answered a tap nobody had made.
    const [selected, setSelected] = useState(null)

    const [entries, setEntries] = useState([])
    const [arena, setArena] = useState([])
    const [dayNotes, setDayNotes] = useState([])
    const [restaurants, setRestaurants] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [refresh, setRefresh] = useState(0)

    const [editing, setEditing] = useState(null)
    const [viewing, setViewing] = useState(null)
    const [openEvent, setOpenEvent] = useState(null)
    const [weekExtrasOpen, setWeekExtrasOpen] = useState(false)
    const [syncing, setSyncing] = useState(false)
    const [note, setNote] = useState('')

    // Switched off, and it starts at whatever the view thinks is sensible. A
    // press after that is yours and the view stops deciding, which is why
    // changing view sets it rather than being read alongside it: two things
    // both deciding whether a layer is on is how a press appears to do nothing.
    const [hidden, setHidden] = useState(() => new Set(OFF_BY_DEFAULT[firstView()]))
    const layers = useMemo(() => LAYERS.filter(l => !hidden.has(l)), [hidden])

    function showView(next) {
        setView(next)
        setHidden(new Set(OFF_BY_DEFAULT[next]))
    }

    // The range every view could want, fetched once. The list reaches furthest,
    // and it is a small table, so asking for the lot beats going back to the
    // database every time somebody switches.
    const from = view === 'list' ? today : (view === 'week' ? weekStart : weekStartOf(viewMonth))
    const to = view === 'list'
        ? addDays(today, 120)
        : (view === 'week' ? addDays(weekStart, 6) : addDays(weekStartOf(viewMonth), 41))

    // Whether this restaurant watches a venue, not whether it forecasts.
    // Knowing there are nine thousand people next door at half six is a
    // rostering fact and should not go away because somebody turned a
    // forecast off. It is the same test the roster uses now, which it was
    // not: that screen asked for the events with no test at all.
    const arenaOn = watchesVenue(activeRestaurant)

    useEffect(() => {
        if (!activeRestaurant) return undefined
        let alive = true

        async function load() {
            setLoading(true)
            setError('')

            // Ticketmaster at most twice a day. The Arena listing does not
            // change often enough to justify a call every time somebody opens
            // the page, and the free tier is generous rather than infinite.
            //
            // This came over from the Events screen along with everything else.
            // Deleting that page without carrying the sync would have left the
            // Arena layer quietly frozen on whatever was last fetched.
            // The restaurant, never the venue. The function reads the venue
            // off that restaurant's own row, so nothing the browser says can
            // point the quota at a venue of somebody else's choosing.
            if (canWrite && arenaOn && syncIsDue()) {
                try {
                    setSyncing(true)
                    const r = await syncEvents(supabase, activeRestaurant.id)
                    markSynced()
                    if (r.added > 0) {
                        setNote(`Found ${r.added} new ${r.added === 1 ? 'event' : 'events'} at the Arena.`)
                    }
                } catch (e) {
                    // A failed sync is not a failed page. What is already in the
                    // table is still worth drawing.
                    setError(`Could not check Ticketmaster: ${friendlyError(e)}`)
                } finally {
                    setSyncing(false)
                }
            }

            const [diary, events, notes, places] = await Promise.all([
                supabase.from('diary_entries').select('*')
                    .lte('starts_on', to)
                    .or(`ends_on.gte.${from},and(ends_on.is.null,starts_on.gte.${from})`)
                    .order('starts_on'),
                arenaOn
                    ? supabase.from('events').select('*')
                        .gte('event_date', from).lte('event_date', to).order('event_date')
                    : Promise.resolve({ data: [], error: null }),
                supabase.from('day_notes').select('note_date, extras')
                    .eq('restaurant_id', activeRestaurant.id)
                    .gte('note_date', from).lte('note_date', to),
                supabase.from('restaurants').select('id, name, google_calendar_id, sort_order')
                    .eq('is_active', true).order('sort_order'),
            ])

            if (!alive) return

            const failed = [diary, events, notes, places].find(r => r.error)
            if (failed) setError(friendlyError(failed.error))

            // Only this restaurant's. The policy answers whether you may
            // read an entry and a super admin may read every site's, which
            // is not the same as them belonging on the restaurant you have
            // switched to. See atRestaurant.
            setEntries((diary.data || []).filter(e => atRestaurant(e, activeRestaurant.id)))
            setArena(events.data || [])
            setDayNotes(notes.data || [])
            setRestaurants(places.data || [])
            setLoading(false)
        }

        load()
        return () => { alive = false }
    }, [activeRestaurant, arenaOn, canWrite, from, to, refresh])

    const items = useMemo(
        () => calendarItems({ entries, arena, dayNotes }),
        [entries, arena, dayNotes],
    )
    const byDate = useMemo(() => itemsByDate(items, layers), [items, layers])

    // A layer with nothing in it anywhere is not worth a switch to turn off.
    // The Arena one is simply absent where forecasting is off, which is why it
    // is not a special case here.
    const present = useMemo(() => {
        const seen = new Set(items.map(layerOf))
        return LAYERS.filter(l => seen.has(l))
    }, [items])

    function toggle(layer) {
        setHidden(was => {
            const next = new Set(was)
            if (next.has(layer)) next.delete(layer)
            else next.add(layer)
            return next
        })
    }

    function step(by) {
        if (view === 'month') setViewMonth(m => addMonths(m, by))
        else if (view === 'week') setWeekStart(w => addDays(w, by * 7))
    }

    // Pressing a thing opens it to be read, whatever it is.
    //
    // A diary entry used to drop you straight into a form with a Save button,
    // which is a strange thing to be handed when all you did was press a chip
    // to find out what it was. An Arena listing opened and told you about
    // itself. Two answers to the same gesture, and only one of them was right.
    function open(thing) {
        if (thing?.ticketmaster_id || thing?.event_date) setOpenEvent(thing)
        else setViewing(thing)
    }

    // Press the same day again and it shuts. The same gesture My Shifts uses
    // for its day card, rather than a second pattern for the same thing, and it
    // is safe here because the day opens below its own row so the square you
    // pressed does not move out from under you.
    const pickDay = date => setSelected(was => (was === date ? null : date))

    // And Escape, because it is what people try.
    useEffect(() => {
        if (!selected) return undefined
        const onKey = e => { if (e.key === 'Escape') setSelected(null) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [selected])

    function openAdd(date) {
        setEditing({ entry: null, date: date || selected || today })
    }

    function saved() {
        setEditing(null)
        setRefresh(n => n + 1)
    }

    // The jump says what pressing it does, and only says where you are when
    // you are already there. Which unit it talks about follows the view: a
    // month view offering to take you to this week would be answering a
    // question you did not ask.
    const unit = view === 'month' ? 'month' : 'week'
    const atNow = view === 'month'
        ? viewMonth === monthStart(today)
        : weekStart === weekStartOf(today)

    const heading = view === 'month'
        ? monthLabel(viewMonth)
        : (view === 'week' ? weekMonthLabel(weekStart) : 'The next four months')

    return (
        <div className="pb-24 sm:pb-6">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
                <div>
                    <h1 className={pageTitle}>Calendar</h1>
                    <p className="text-sm text-muted mt-0.5">
                        {activeRestaurant?.name}
                        {heading ? ` · ${heading}` : ''}
                    </p>
                </div>

                {/* Full width rows on a phone, their own widths on a
                    computer.
                    Left to wrap on their own these came out as three ragged
                    lines with a big empty arrow at the end of one and a lone
                    button on the next, which is what he meant by odd. Each
                    group takes the whole line instead, so the stack reads as
                    three deliberate rows rather than a spill. */}
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <div className={`${segmentTrack} w-full sm:w-auto`}>
                        {VIEWS.map(v => (
                            <button
                                key={v.id}
                                type="button"
                                onClick={() => showView(v.id)}
                                className={segmentButton(view === v.id)}
                            >
                                {v.label}
                            </button>
                        ))}
                    </div>

                    {view !== 'list' && (
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <button
                                type="button"
                                onClick={() => step(-1)}
                                className={`${secondaryButton} flex-none w-11`}
                                aria-label="Back"
                            >
                                &#8249;
                            </button>
                            {/* The one that says something takes the room the
                                two arrows do not need. */}
                            <button
                                type="button"
                                className={`${jumpButton(atNow)} flex-1 sm:flex-none`}
                                onClick={() => {
                                    setViewMonth(monthStart(today))
                                    setWeekStart(weekStartOf(today))
                                }}
                            >
                                {jumpLabel(atNow, unit)}
                            </button>
                            <button
                                type="button"
                                onClick={() => step(1)}
                                className={`${secondaryButton} flex-none w-11`}
                                aria-label="Forward"
                            >
                                &#8250;
                            </button>
                        </div>
                    )}

                    {canWrite && (
                        <>
                            {/* The corporate orders arrive as a schedule for a
                                week, so they go in as a week. He looked for this
                                here before he looked for it on the roster, which
                                settles where it belongs. */}
                            <button
                                type="button"
                                onClick={() => setWeekExtrasOpen(true)}
                                className={`${secondaryButton} w-full sm:w-auto`}
                            >
                                Corporate schedule
                            </button>
                            <button
                                type="button"
                                onClick={() => openAdd()}
                                className="hidden sm:inline-flex px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg transition-colors hover:bg-orange-600"
                            >
                                + Add
                            </button>
                        </>
                    )}
                </div>
            </div>

            {error && <ErrorBanner className="mb-3">{error}</ErrorBanner>}
            {note && <p className="mb-3 text-sm text-green-700 bg-green-50 rounded-lg p-3">{note}</p>}
            {syncing && <p className="mb-3 text-sm text-muted">Checking Ticketmaster...</p>}

            {/* The switches. Pressing one only changes what is drawn, so this is
                never a thing you can get wrong by pressing. */}
            <div className="flex flex-wrap gap-1.5 mb-3">
                {present.map(layer => {
                    const off = hidden.has(layer)
                    return (
                        <button
                            key={layer}
                            type="button"
                            onClick={() => toggle(layer)}
                            aria-pressed={!off}
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border transition-colors ${
                                off
                                    ? 'bg-white border-gray-300 text-muted'
                                    : 'bg-white border-gray-400 text-gray-800 shadow-sm'
                            }`}
                        >
                            <span className={`w-2 h-2 rounded-sm ${off ? 'bg-gray-300' : kindDot(layer)}`} />
                            {layer === 'private' ? 'Just me' : kindLabel(layer)}
                        </button>
                    )
                })}
            </div>

            <div className={`${card} overflow-hidden`}>
                {loading ? (
                    <p className="p-6 text-sm text-muted">Loading the calendar...</p>
                ) : view === 'month' ? (
                    <DiaryMonth
                        viewMonth={viewMonth}
                        today={today}
                        byDate={byDate}
                        selected={selected}
                        onSelect={pickDay}
                        onOpen={open}
                        canEdit={canWrite}
                        restaurants={restaurants}
                    />
                ) : view === 'week' ? (
                    <DiaryWeek
                        weekStart={weekStart}
                        today={today}
                        byDate={byDate}
                        onOpen={open}
                        onAdd={openAdd}
                        canEdit={canWrite}
                    />
                ) : (
                    <DiaryList
                        items={items}
                        today={today}
                        restaurants={restaurants}
                        layers={layers}
                        onOpen={open}
                        canEdit={canWrite}
                    />
                )}
            </div>

            {/* On a phone Add floats, so it is there whether you are at the top
                of a hundred entries or the bottom. It sits above where
                BackToTop appears, which only turns up on the way back up. */}
            {canWrite && (
                <button
                    type="button"
                    onClick={() => openAdd()}
                    aria-label="Add to the calendar"
                    className="sm:hidden fixed bottom-4 right-4 z-40 w-14 h-14 rounded-full bg-accent text-white text-2xl leading-none shadow-lg flex items-center justify-center transition-colors hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-sidebar"
                >
                    +
                </button>
            )}

            {openEvent && <EventModal event={openEvent} onClose={() => setOpenEvent(null)} />}

            {viewing && (
                <DiaryEntryModal
                    entry={viewing}
                    restaurants={restaurants}
                    canEdit={canWrite}
                    onEdit={() => { setEditing({ entry: viewing, date: viewing.starts_on }); setViewing(null) }}
                    onClose={() => setViewing(null)}
                />
            )}

            {weekExtrasOpen && (
                <WeekExtrasModal
                    startOn={view === 'week' ? weekStart : (selected || today)}
                    restaurant={activeRestaurant}
                    onClose={() => setWeekExtrasOpen(false)}
                    onSaved={() => { setWeekExtrasOpen(false); setRefresh(n => n + 1) }}
                />
            )}

            {editing && (
                <DiaryDialog
                    entry={editing.entry}
                    date={editing.date}
                    restaurants={restaurants}
                    onClose={() => setEditing(null)}
                    onSaved={saved}
                />
            )}
        </div>
    )
}
