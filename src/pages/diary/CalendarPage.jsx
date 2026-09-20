import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useRestaurant } from '@/context/restaurant'
import { can, MANAGERS } from '@/lib/access'
import { todayISO, weekStartOf, addDays, monthStart, addMonths, monthLabel, weekMonthLabel } from '@/lib/dates'
import { friendlyError } from '@/lib/errors'
import { syncEvents, syncIsDue, markSynced } from '@/lib/nearbySync'
import {
    nearbyRows, waiting, eventName, headlinePlaces, placeName, PAIRING_COLUMNS,
} from '@/lib/nearby'
import FoundNearby from '@/components/nearby/FoundNearby'
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
    const [events, setEvents] = useState([])
    // Everything still waiting on somebody, whatever month is on screen.
    //
    // **Kept apart from the events above and that is the whole point.** Those
    // are fetched for the window the view is showing, about six weeks for a
    // month, so a conference on 25 October was simply not loaded while
    // September was open and could not appear in the list. On a phone, which
    // opens on the list view and its 120 days, the same five were waiting.
    // A decision waiting on somebody must not appear and disappear depending
    // on which month they happen to be looking at.
    const [pending, setPending] = useState([])
    const [pairings, setPairings] = useState([])
    const [deciding, setDeciding] = useState(false)
    // How many dates carry the open listing's name at the same place. Counted
    // rather than taken from what is loaded, because a residency runs past the
    // end of whatever window is on screen and offering to rename five when
    // there are eleven would be a lie in the label.
    const [sameName, setSameName] = useState(0)
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
            //
            // The restaurant, never the venue. The function reads the venue
            // off that restaurant's own row, so nothing the browser says can
            // point the quota at a venue of somebody else's choosing.
            if (canWrite && syncIsDue()) {
                try {
                    setSyncing(true)
                    const r = await syncEvents(supabase, activeRestaurant.id)
                    markSynced()
                    if (r.added > 0) {
                        setNote(`Found ${r.added} new ${r.added === 1 ? 'thing' : 'things'} happening nearby.`)
                    }
                } catch (e) {
                    // A failed sync is not a failed page. What is already in the
                    // table is still worth drawing.
                    setError(`Could not check Ticketmaster: ${friendlyError(e)}`)
                } finally {
                    setSyncing(false)
                }
            }

            const [diary, eventRes, notes, places, nearRes, pendRes] = await Promise.all([
                supabase.from('diary_entries').select('*')
                    .lte('starts_on', to)
                    .or(`ends_on.gte.${from},and(ends_on.is.null,starts_on.gte.${from})`)
                    .order('starts_on'),
                // Everything in the window. Which of it belongs to this
                // restaurant is decided by which places it is near, once, in
                // lib/nearby, rather than by a clause repeated on four screens.
                //
                // Overlapping rather than starting in the window, the same as
                // the diary above: a market that began last week still covers
                // Monday.
                supabase.from('events').select('*')
                    .lte('event_date', to)
                    .or(`ends_on.gte.${from},and(ends_on.is.null,event_date.gte.${from})`)
                    .order('event_date'),
                supabase.from('day_notes').select('note_date, extras')
                    .eq('restaurant_id', activeRestaurant.id)
                    .gte('note_date', from).lte('note_date', to),
                supabase.from('restaurants').select('id, name, google_calendar_id, sort_order')
                    .eq('is_active', true).order('sort_order'),
                supabase.from('restaurant_places')
                    .select(PAIRING_COLUMNS)
                    .eq('restaurant_id', activeRestaurant.id)
                    .order('sort_order'),
                // Not bounded by the view. Anything unchecked that has not
                // happened yet, however far out it is.
                supabase.from('events').select('*')
                    .eq('review', 'found')
                    .or(`ends_on.gte.${today},and(ends_on.is.null,event_date.gte.${today})`)
                    .order('event_date'),
            ])

            if (!alive) return

            const failed = [diary, eventRes, notes, places, nearRes, pendRes].find(r => r.error)
            if (failed) setError(friendlyError(failed.error))

            // Only this restaurant's. The policy answers whether you may
            // read an entry and a super admin may read every site's, which
            // is not the same as them belonging on the restaurant you have
            // switched to. See atRestaurant.
            setEntries((diary.data || []).filter(e => atRestaurant(e, activeRestaurant.id)))
            setEvents(eventRes.data || [])
            setPairings(nearRes.data || [])
            setPending(pendRes.data || [])
            setDayNotes(notes.data || [])
            setRestaurants(places.data || [])
            setLoading(false)
        }

        load()
        return () => { alive = false }
    }, [activeRestaurant, canWrite, from, to, today, refresh])

    // One pass, so this screen and the roster cannot disagree about which
    // listing belongs to which shop. See lib/nearby.
    const nearby = useMemo(
        () => nearbyRows(events, pairings, activeRestaurant),
        [events, pairings, activeRestaurant],
    )

    // The ones nobody has settled, and only what is still to come. A reading of
    // something that has already happened is not a decision anybody needs to
    // make, and offering it is how a list stops being opened.
    //
    // Off its own list rather than off what the calendar is drawing, so what is
    // waiting does not change when somebody steps to another month.
    const found = useMemo(
        () => waiting(nearbyRows(pending, pairings, activeRestaurant), today),
        [pending, pairings, activeRestaurant, today],
    )

    // The switch for the one place on its own scale says its name.
    //
    // Every other layer is a kind of thing and names itself, and this one is a
    // particular building: at Point Campus it is the 3Arena and saying "Next
    // door" would be a word nobody would look for. Only this screen knows which
    // place it is, so only this screen can say.
    const headline = useMemo(
        () => placeName(headlinePlaces(pairings, activeRestaurant)[0], { short: true }),
        [pairings, activeRestaurant],
    )

    const items = useMemo(
        () => calendarItems({ entries, nearby, dayNotes }),
        [entries, nearby, dayNotes],
    )
    const byDate = useMemo(() => itemsByDate(items, layers), [items, layers])

    // A layer with nothing in it anywhere is not worth a switch to turn off.
    // The nearby ones are simply absent where a restaurant is near nothing,
    // which is why they are not a special case here.
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
        if (thing?.ticketmaster_id || thing?.event_date) {
            // The row rather than the bare event, so the modal can say where
            // it is, how far, and whether anybody has checked it. The chip
            // hands over what it was given, which is the event itself.
            setOpenEvent(nearby.find(r => r.event.id === thing.id) || { event: thing })
            countSameName(thing)
            return
        }
        setViewing(thing)
    }

    // A tour is one name on six nights. Asked once when the listing opens, so
    // the offer to rename the lot can say how many the lot is.
    async function countSameName(event) {
        setSameName(0)
        if (!event?.place_id || !event?.name) return

        const { count } = await supabase.from('events')
            .select('id', { count: 'exact', head: true })
            .eq('place_id', event.place_id)
            .eq('name', event.name)

        setSameName(count || 0)
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

    // Renaming one that has already been kept.
    //
    // He asked for this having kept three conferences and then wanted the month
    // and the year off them, which the review list could no longer offer because
    // they were settled. So the listing itself carries it, which is also where
    // somebody looking at a name they do not like already is.
    //
    // Emptying the field puts the original back rather than leaving a blank
    // name, which is the only sensible reading of clearing it.
    // all renames every date carrying the same name at the same place, which
    // is what a residency is: "Westlife 25 - The Anniversary World Tour" on six
    // nights is one decision, not six.
    //
    // Matched on the name that arrived rather than on the one we chose, so it
    // still finds them after the first rename, and on the place as well as the
    // name, because two venues can have a night called the same thing and only
    // one of them is being talked about.
    //
    // Past dates are renamed too. A week that has been and gone reading
    // differently from the same thing next month is a worse answer than
    // consistency nobody will look at.
    async function rename(event, to, all = false, until) {
        const name = String(to ?? '').trim()
        const display_name = name && name !== event.name ? name : null
        const ends_on = String(until ?? '').trim() || null

        // The name can go to every date of a residency. **An end date never
        // does**: six nights of a tour are six one night things, and giving
        // them all the same last day would draw one band over the lot.
        const change = { display_name }
        const mine = { display_name, ends_on }

        const where = supabase.from('events')
        const { data, error: failed } = all
            ? await where.update(change).eq('place_id', event.place_id).eq('name', event.name).select('id')
            : await where.update(mine).eq('id', event.id).select('id')

        if (failed) { setError(friendlyError(failed)); return }
        // The same trap the keep fell into: no rows changed reads as success.
        if (!data?.length) {
            setError('That could not be saved, so nothing has changed.')
            return
        }

        // The end date only ever lands on the one that was open, so it is
        // written on its own when the name went to the others.
        if (all && ends_on !== (event.ends_on ?? null)) {
            await where.update({ ends_on }).eq('id', event.id)
        }

        const hits = e => (all
            ? e.place_id === event.place_id && e.name === event.name
            : e.id === event.id)
        const patch = e => ({
            ...e,
            display_name,
            ...(e.id === event.id ? { ends_on } : {}),
        })

        setEvents(was => was.map(e => (hits(e) ? patch(e) : e)))
        setPending(was => was.map(e => (hits(e) ? patch(e) : e)))
        setOpenEvent(was => (was?.event && hits(was.event)
            ? { ...was, event: patch(was.event) }
            : was))
    }

    // Keeping one or saying no to it.
    //
    // The row is already there either way. What this writes is whether it is
    // ours, and a dismissal stays in the table on purpose: the next read of the
    // same page lands on that row and does not offer it again.
    //
    // A corrected name rides along with a keep, into display_name rather than
    // over the name that arrived. It is only written when it has actually
    // changed and is not blank, so keeping forty rows does not rewrite forty
    // names with what they already said. See migration 015 for why the two are
    // kept apart.
    //
    // Written straight into the list as well as to the database, rather than
    // waiting for a reload. Pressing Keep on four things in a row and watching
    // the whole calendar blink four times is the sort of thing that makes
    // somebody stop pressing it.
    async function decide(event, review, renamed) {
        const name = String(renamed ?? '').trim()
        const change = {
            review,
            reviewed_at: new Date().toISOString(),
            reviewed_by: user?.id || null,
            ...(review === 'kept' && name && name !== eventName(event)
                ? { display_name: name }
                : {}),
        }

        setDeciding(true)
        // **select, so the answer says what it actually did.** An update that
        // matches no rows comes back 204 with no error, which is
        // indistinguishable from one that worked, and the screen then empties
        // the row out of its own list and looks right. He kept five things on
        // the computer, opened the calendar on his phone, and all five were
        // still waiting: the list had emptied locally and nothing had been
        // written. A write nobody can tell failed is worse than one that fails
        // loudly.
        const { data, error: failed } = await supabase.from('events')
            .update(change).eq('id', event.id).select('id')
        setDeciding(false)

        if (failed) { setError(friendlyError(failed)); return }
        if (!data?.length) {
            setError('That could not be saved. Nothing was changed, so it is still waiting.')
            return
        }
        setEvents(was => was.map(e => (e.id === event.id ? { ...e, ...change } : e)))
        // Settled, so it leaves the waiting list whether or not the calendar
        // happens to be drawing it.
        setPending(was => was.filter(e => e.id !== event.id))
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

            {/* Everything behind this is already saved. What a person decides
                here is not whether a thing exists, it is whether it is ours. */}
            {canWrite && (
                <FoundNearby
                    rows={found}
                    today={today}
                    restaurantName={activeRestaurant?.name}
                    onDecide={decide}
                    busy={deciding}
                />
            )}
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
                            {layer === 'private'
                                ? 'Just me'
                                : (layer === 'arena' && headline) || kindLabel(layer)}
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

            {openEvent && (
                <EventModal
                    row={openEvent}
                    canEdit={canWrite}
                    sameName={sameName}
                    onRename={rename}
                    onClose={() => setOpenEvent(null)}
                />
            )}

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
