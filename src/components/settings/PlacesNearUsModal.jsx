import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useConfirm } from '@/context/confirm'
import { useRestaurant } from '@/context/restaurant'
import { friendlyError, functionError } from '@/lib/errors'
import { todayISO } from '@/lib/dates'
import {
    modalFooter, secondaryButton, fieldClass, labelClass, checkbox, checkRow, primaryButton,
} from '@/lib/controlStyles'
import { ModalSectionBar } from '@/components/ui/ModalSection'
import Modal from '@/components/ui/Modal'
import ErrorBanner from '@/components/ui/ErrorBanner'
import {
    CITY_CAPACITY, CITY_RADIUS_KM, WALKABLE_MINUTES,
    walkWords, sourceWords, placeTag, readWords, pastWalking, cityProblem, samePlace,
    couldBeSamePlace, placeName, PAIRING_COLUMNS,
} from '@/lib/nearby'

const BLANK = {
    name: '', walk_minutes: '', page_url: '', ticketmaster_venue_id: '', capacity: '',
    reading_key: 'date', page_depth: '1', relation: 'walk', own_row: false,
}

const TAG_LOOK = {
    on: 'bg-green-50 text-green-900 border-green-300',
    quiet: 'bg-app-bg text-muted border-border',
    off: 'bg-app-bg text-muted border-border',
}

// Which places a restaurant is near, and how near.
//
// **The one judgement here cannot be automated and is not.** No API can answer
// whether somebody at a thing would rather come to us than eat where they are,
// so the tick stays with a person. Everything else on the row is either read
// off a feed or worked out from a distance.
//
// Turning one off is one tap and needs no explanation. A place that stops being
// worth watching stops being watched, and nothing is deleted, because a place
// switched off in February is usually a place somebody wants back in June.
export default function PlacesNearUsModal({ onClose, onChange }) {
    const confirm = useConfirm()
    const { activeRestaurant, setActiveRestaurant } = useRestaurant()
    const today = todayISO()

    const [rows, setRows] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)

    const [adding, setAdding] = useState(false)
    const [form, setForm] = useState(BLANK)
    const [editingId, setEditingId] = useState(null)

    const [reading, setReading] = useState(false)
    const [read, setRead] = useState('')

    const [address, setAddress] = useState('')
    const [searching, setSearching] = useState(false)
    const [candidates, setCandidates] = useState(null)
    // Where it searched from. Shown because a lookup can succeed and be wrong:
    // "Papi Chulo Dublin" finds the Dun Laoghaire shop and "Papi Chulo" finds
    // one in Montreal, and neither of those announces itself as a mistake.
    const [lookedFrom, setLookedFrom] = useState(null)

    const cityOn = activeRestaurant?.watch_city_events !== false

    const load = useCallback(async () => {
        setLoading(true)
        const { data, error: failed } = await supabase.from('restaurant_places')
            .select(PAIRING_COLUMNS)
            .eq('restaurant_id', activeRestaurant.id)
            .order('sort_order')

        if (failed) setError(friendlyError(failed))
        else setRows((data || []).filter(r => r.place))
        setLoading(false)
    }, [activeRestaurant])

    useEffect(() => {
        // The fetch sets a loading state before it starts, which is one render
        // this rule would rather avoid. The alternative is to leave it, and
        // then the dialog opens on an empty list that reads as "this
        // restaurant is near nothing" until the answer arrives, which is a
        // worse thing to be told than "loading".
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (activeRestaurant) load()
    }, [activeRestaurant, load])

    function done() {
        onChange?.()
        load()
    }

    async function toggleRow(row) {
        setBusy(true)
        const { error: failed } = await supabase.from('restaurant_places')
            .update({ is_active: !row.is_active }).eq('id', row.id)
        setBusy(false)
        if (failed) setError(friendlyError(failed))
        else done()
    }

    async function toggleCity() {
        setBusy(true)
        const { data, error: failed } = await supabase.from('restaurants')
            .update({ watch_city_events: !cityOn })
            .eq('id', activeRestaurant.id).select().single()
        setBusy(false)
        if (failed) setError(friendlyError(failed))
        else { setActiveRestaurant(data); onChange?.() }
    }

    // A number, or nothing. An empty field means nobody has said, which is not
    // the same as zero and must not be saved as one.
    const figure = v => (String(v).trim() === '' ? null : Number(v))

    async function save(e) {
        e.preventDefault()
        setBusy(true)
        setError('')

        const patch = {
            name: form.name.trim(),
            page_url: form.page_url.trim() || null,
            ticketmaster_venue_id: form.ticketmaster_venue_id.trim() || null,
            capacity: figure(form.capacity),
            reading_key: form.reading_key === 'title' ? 'title' : 'date',
            // One unless somebody has said otherwise, and never more than the
            // dozen the database will accept: every page is a fetch and a slice
            // of what gets sent to be read.
            page_depth: Math.max(1, Math.min(12, Number(form.page_depth) || 1)),
        }
        const minutes = figure(form.walk_minutes)

        if (editingId) {
            const row = rows.find(r => r.id === editingId)
            const [one, two] = await Promise.all([
                supabase.from('places').update(patch).eq('id', row.place.id),
                supabase.from('restaurant_places')
                    .update({
                        walk_minutes: form.relation === 'city' ? null : minutes,
                        relation: form.relation === 'city' ? 'city' : 'walk',
                        own_row: form.own_row === true,
                        sort_order: minutes ?? 0,
                    })
                    .eq('id', editingId),
            ])
            setBusy(false)
            const failed = [one, two].find(r => r.error)
            if (failed) { setError(friendlyError(failed.error)); return }
        } else {
            const { data: made, error: e1 } = await supabase.from('places')
                .insert(patch).select().single()
            if (e1) { setBusy(false); setError(friendlyError(e1)); return }

            // Across town has no walking time, and saying one would be the
            // sort of small lie that ends up on a roster.
            const city = form.relation === 'city'
            const { error: e2 } = await supabase.from('restaurant_places').insert({
                restaurant_id: activeRestaurant.id,
                place_id: made.id,
                relation: city ? 'city' : 'walk',
                walk_minutes: city ? null : (minutes ?? WALKABLE_MINUTES),
                own_row: form.own_row === true,
                sort_order: city ? 99 : (minutes ?? WALKABLE_MINUTES),
            })
            setBusy(false)
            if (e2) { setError(friendlyError(e2)); return }
        }

        setForm(BLANK)
        setAdding(false)
        setEditingId(null)
        done()
    }

    // Taking one off this restaurant's list.
    //
    // The pairing goes and the place stays. A place is shared between
    // restaurants and carries the listings already read from it, and deleting
    // one takes its events with it, which is a great deal of damage for a row
    // somebody added by mistake. Switching it off is the softer answer and is
    // right for "not this year"; this is for "that is not us at all".
    async function stopWatching(row) {
        if (!await confirm({
            title: `Take ${row.place.name} off the list?`,
            message: 'It stops appearing on the roster and the calendar. Anything already read '
                + 'from it is kept, and you can add it again from the search.',
            confirmLabel: 'Take it off',
            tone: 'danger',
        })) return

        setBusy(true)
        const { error: failed } = await supabase.from('restaurant_places')
            .delete().eq('id', row.id)
        setBusy(false)

        if (failed) { setError(friendlyError(failed)); return }
        setEditingId(null)
        setAdding(false)
        done()
    }

    function edit(row) {
        setEditingId(row.id)
        setAdding(true)
        setForm({
            name: row.place.name || '',
            walk_minutes: row.walk_minutes ?? '',
            page_url: row.place.page_url || '',
            ticketmaster_venue_id: row.place.ticketmaster_venue_id || '',
            capacity: row.place.capacity ?? '',
            reading_key: row.place.reading_key || 'date',
            page_depth: String(row.place.page_depth ?? 1),
            relation: row.relation === 'city' ? 'city' : 'walk',
            own_row: row.own_row === true,
        })
    }

    // Reading the pages now rather than waiting for Monday.
    //
    // The schedule is what really keeps these up to date, once a week, because
    // a page that is read every time somebody opens a screen is a page whose
    // owner starts blocking us. This is here for the two moments a week is too
    // long to wait: the day a page is added, and the day somebody wants to know
    // whether it still works.
    //
    // It says what it found rather than just that it ran. A page that has
    // changed its layout goes quiet rather than going wrong, and "3 pages read,
    // nothing found" is the sentence that tells somebody to go and look.
    async function readPages() {
        setReading(true)
        setError('')
        setRead('')

        const { data, error: failed } = await supabase.functions.invoke('read-listings', {
            body: { restaurantId: activeRestaurant.id },
        })
        setReading(false)

        if (failed) { setError(await functionError(failed)); return }
        if (data?.error) { setError(data.error); return }

        const pages = data?.pages || []
        if (pages.length === 0) {
            setRead('No page is set up on any place this restaurant watches.')
            return
        }

        const broke = pages.filter(p => p.error)
        const found = pages.reduce((total, p) => total + (p.found || 0), 0)
        const added = pages.reduce((total, p) => total + (p.added || 0), 0)

        setRead([
            `${pages.length} ${pages.length === 1 ? 'page' : 'pages'} read.`,
            found === 0
                ? 'Nothing found on any of them.'
                : `${found} found, ${added} of them new. Keep or dismiss them on the calendar.`,
            broke.length ? `${broke.map(p => p.place).join(', ')} could not be read.` : '',
        ].filter(Boolean).join(' '))

        done()
    }

    // Type the address and the Hub asks what is near it.
    //
    // This is the answer to "do we design a plan for each restaurant": no, you
    // tick a list. The ticks are the only judgement and it is the right one to
    // leave to a person.
    async function findNearby(e) {
        e.preventDefault()
        setSearching(true)
        setError('')
        setCandidates(null)

        const { data, error: failed } = await supabase.functions.invoke('nearby-events', {
            body: { find: { restaurantId: activeRestaurant.id, address: address.trim() } },
        })
        setSearching(false)

        if (failed) { setError(await functionError(failed)); return }
        if (data?.error) { setError(data.error); return }
        setCandidates(data?.places || [])
        setLookedFrom(data?.point || null)
    }

    // Watching one the search turned up.
    //
    // **The place we already have, where we already have it.** The Convention
    // Centre was on the list with a page and no venue id, and Ticketmaster
    // calls it "The Convention Centre Dublin", so an upsert keyed on the venue
    // id made a second row for one building. Filling the id into the row that
    // exists is what gives a place a feed and a page at once, which is the
    // combination worth having: the feed knows the ticketed nights down to the
    // minute and the page knows the conferences nobody sells a ticket for.
    async function takeOn(found) {
        setBusy(true)

        const { data: all, error: e0 } = await supabase.from('places')
            .select('id, name, ticketmaster_venue_id, latitude, longitude')
        if (e0) { setBusy(false); setError(friendlyError(e0)); return }

        const already = (all || []).find(p => (
            (p.ticketmaster_venue_id && p.ticketmaster_venue_id === found.ticketmaster_venue_id)
            || samePlace(p.name, found.name)
        ))

        const patch = {
            ticketmaster_venue_id: found.ticketmaster_venue_id || null,
            // Only when we do not have one. A point typed by hand beats a
            // point off a venue's own listing, since the second is where the
            // box office is and the first is where somebody stood.
            ...(already?.latitude == null ? { latitude: found.latitude ?? null } : {}),
            ...(already?.longitude == null ? { longitude: found.longitude ?? null } : {}),
        }

        const { data: made, error: e1 } = already
            ? await supabase.from('places').update(patch).eq('id', already.id).select().single()
            : await supabase.from('places').insert({ name: found.name, ...patch }).select().single()

        if (e1) { setBusy(false); setError(friendlyError(e1)); return }

        const { error: e2 } = await supabase.from('restaurant_places').upsert({
            restaurant_id: activeRestaurant.id,
            place_id: made.id,
            relation: found.relation || 'walk',
            walk_minutes: found.relation === 'city' ? null : found.walkMinutes,
            distance_km: found.km ?? null,
            sort_order: found.walkMinutes ?? 0,
        }, { onConflict: 'restaurant_id,place_id' })

        setBusy(false)
        if (e2) { setError(friendlyError(e2)); return }
        setCandidates(was => (was || []).filter(c => c.ticketmaster_venue_id !== found.ticketmaster_venue_id))
        done()
    }

    const walkers = rows.filter(r => r.relation !== 'city')
    const city = rows.filter(r => r.relation === 'city')

    return (
        <Modal title="Places near us" onClose={onClose} width="max-w-2xl">
            <div className="px-4 sm:px-6 py-4">
                {error && <ErrorBanner className="mb-3">{error}</ErrorBanner>}

                {loading ? (
                    <p className="text-sm text-muted">Loading...</p>
                ) : (
                    <>
                        <ModalSectionBar>Within walking distance</ModalSectionBar>
                        {walkers.length === 0 && (
                            <p className="text-sm text-muted py-3">
                                Nothing yet. Add one below, or type the address and let the Hub
                                look.
                            </p>
                        )}
                        {walkers.map(row => (
                            <PlaceRow
                                key={row.id}
                                row={row}
                                today={today}
                                busy={busy}
                                onToggle={() => toggleRow(row)}
                                onEdit={() => edit(row)}
                            />
                        ))}

                        <ModalSectionBar>Big things in the city</ModalSectionBar>
                        <label className="flex items-start gap-3 py-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={cityOn}
                                disabled={busy}
                                onChange={toggleCity}
                                className={checkbox}
                            />
                            <span>
                                <span className="block text-sm font-semibold text-gray-900">
                                    Anything over {CITY_CAPACITY.toLocaleString('en-IE')} people,
                                    within {CITY_RADIUS_KM} km
                                </span>
                                {/* His point, and the best one in the design.
                                    Hotels do not publish what is on. They are
                                    affected by things that drag visitors in,
                                    and those guests eat near where they sleep. */}
                                <span className="block text-xs text-muted mt-0.5">
                                    Nobody walks from these. They are here because they fill the
                                    hotels beside us. A capacity has to be typed once per place,
                                    because no API publishes it.
                                </span>
                            </span>
                        </label>
                        {city.map(row => (
                            <PlaceRow
                                key={row.id}
                                row={row}
                                today={today}
                                busy={busy}
                                onToggle={() => toggleRow(row)}
                                onEdit={() => edit(row)}
                            />
                        ))}

                        <ModalSectionBar>
                            {editingId ? 'Change a place' : 'Add one by hand'}
                        </ModalSectionBar>
                        {!adding ? (
                            <button
                                type="button"
                                onClick={() => { setAdding(true); setEditingId(null); setForm(BLANK) }}
                                className={`${secondaryButton} my-3`}
                            >
                                Add a place
                            </button>
                        ) : (
                            <form onSubmit={save} className="grid gap-3 sm:grid-cols-2 py-3">
                                <div className="sm:col-span-2">
                                    <label className={labelClass} htmlFor="place-relation">
                                        Would somebody at this walk to us?
                                    </label>
                                    <select
                                        id="place-relation"
                                        className={fieldClass}
                                        value={form.relation}
                                        onChange={e => setForm({ ...form, relation: e.target.value })}
                                    >
                                        <option value="walk">Yes, it is a walk away</option>
                                        <option value="city">No, but it fills the hotels near us</option>
                                    </select>
                                    {/* The one judgement in the whole feature,
                                        and no API can make it. */}
                                    <p className="text-xs text-muted mt-1">
                                        The second one shows nothing until you type how many it
                                        holds, and only counts over{' '}
                                        {CITY_CAPACITY.toLocaleString('en-IE')}.
                                    </p>
                                </div>
                                <div className="sm:col-span-2">
                                    <label className={labelClass} htmlFor="place-name">Name</label>
                                    <input
                                        id="place-name"
                                        className={fieldClass}
                                        value={form.name}
                                        required
                                        onChange={e => setForm({ ...form, name: e.target.value })}
                                        placeholder="Pavilion Theatre"
                                    />
                                </div>
                                <div>
                                    <label className={labelClass} htmlFor="place-walk">Walk, in minutes</label>
                                    <input
                                        id="place-walk"
                                        className={fieldClass}
                                        inputMode="numeric"
                                        value={form.walk_minutes}
                                        onChange={e => setForm({ ...form, walk_minutes: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className={labelClass} htmlFor="place-capacity">
                                        How many it holds
                                    </label>
                                    <input
                                        id="place-capacity"
                                        className={fieldClass}
                                        inputMode="numeric"
                                        value={form.capacity}
                                        onChange={e => setForm({ ...form, capacity: e.target.value })}
                                        placeholder="Only for the city rule"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className={labelClass} htmlFor="place-page">
                                        Its listings page
                                    </label>
                                    <input
                                        id="place-page"
                                        className={fieldClass}
                                        value={form.page_url}
                                        onChange={e => setForm({ ...form, page_url: e.target.value })}
                                        placeholder="https://paviliontheatre.ie/events"
                                    />
                                    <p className="text-xs text-muted mt-1">
                                        Read once a week. Anything found waits on the calendar for
                                        somebody to keep it.
                                    </p>
                                    {/* Two words rather than a second field,
                                        because where the month or the page
                                        number goes is part of the address and
                                        only the address knows where. */}
                                    <p className="text-xs text-muted mt-1">
                                        Some sites hand over one month or a few events at a time.
                                        Put <code className="font-mono">{'{month}'}</code> or{' '}
                                        <code className="font-mono">{'{page}'}</code> in the address
                                        where the site puts them and it will be read right through.
                                    </p>
                                </div>
                                <div>
                                    <label className={labelClass} htmlFor="place-depth">
                                        How many pages to read
                                    </label>
                                    <input
                                        id="place-depth"
                                        className={fieldClass}
                                        inputMode="numeric"
                                        value={form.page_depth}
                                        onChange={e => setForm({ ...form, page_depth: e.target.value })}
                                    />
                                    <p className="text-xs text-muted mt-1">
                                        Only does anything when the address has{' '}
                                        <code className="font-mono">{'{page}'}</code> in it. One
                                        unless the site is stingy.
                                    </p>
                                </div>
                                <div className="sm:col-span-2">
                                    <label className={labelClass} htmlFor="place-reading">
                                        What that page lists
                                    </label>
                                    <select
                                        id="place-reading"
                                        className={fieldClass}
                                        value={form.reading_key}
                                        onChange={e => setForm({ ...form, reading_key: e.target.value })}
                                    >
                                        <option value="date">Things happening on a day</option>
                                        <option value="title">A running programme, like a cinema</option>
                                    </select>
                                    {/* A cinema lists the same film every day
                                        for a month. Read as days that is a
                                        hundred and thirty eight rows and the
                                        roster is unreadable; read as a
                                        programme it is one row per film, kept
                                        the first time it appears. */}
                                    <p className="text-xs text-muted mt-1">
                                        A programme keeps each thing once, the first time it turns
                                        up, so a film showing all month is one line rather than
                                        thirty.
                                    </p>
                                </div>
                                <div className="sm:col-span-2">
                                    <label className={labelClass} htmlFor="place-venue">
                                        Ticketmaster venue id
                                    </label>
                                    <input
                                        id="place-venue"
                                        className={fieldClass}
                                        value={form.ticketmaster_venue_id}
                                        onChange={e => setForm({ ...form, ticketmaster_venue_id: e.target.value })}
                                        placeholder="Leave empty unless it sells tickets"
                                    />
                                </div>
                                <label className={`${checkRow} sm:col-span-2 cursor-pointer`}>
                                    <input
                                        type="checkbox"
                                        checked={form.own_row}
                                        onChange={e => setForm({ ...form, own_row: e.target.checked })}
                                        className={checkbox}
                                    />
                                    <span>
                                        <span className="block text-sm font-medium text-gray-900">
                                            Give it a row of its own on the roster
                                        </span>
                                        {/* For the one place on its own scale.
                                            Nine thousand people two minutes
                                            away is not the same kind of fact as
                                            a sandwich delivery, and a week grid
                                            that lists them together buries it. */}
                                        <span className="block text-xs text-muted mt-0.5">
                                            For the one place big enough that it should not sit
                                            under a delivery. Everything else shares Also on.
                                        </span>
                                    </span>
                                </label>
                                <div className="sm:col-span-2 flex flex-wrap gap-2">
                                    <button type="submit" disabled={busy} className={primaryButton()}>
                                        {editingId ? 'Save' : 'Add it'}
                                    </button>
                                    <button
                                        type="button"
                                        className={secondaryButton}
                                        onClick={() => { setAdding(false); setEditingId(null); setForm(BLANK) }}
                                    >
                                        Cancel
                                    </button>
                                    {/* Only when editing one that exists, and
                                        last, because it is the one control here
                                        that cannot be undone by pressing it
                                        again. */}
                                    {editingId && (
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => stopWatching(rows.find(r => r.id === editingId))}
                                            className="ml-auto text-sm font-medium text-red-700 hover:text-red-800 px-3 py-2"
                                        >
                                            Take it off the list
                                        </button>
                                    )}
                                </div>
                            </form>
                        )}

                        <ModalSectionBar>What their pages say</ModalSectionBar>
                        <div className="py-3 flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                disabled={reading}
                                onClick={readPages}
                                className={secondaryButton}
                            >
                                {reading ? 'Reading...' : 'Read the pages now'}
                            </button>
                            <p className="text-xs text-muted flex-1 min-w-[12rem]">
                                Read once a week on their own. Anything found waits on the
                                calendar until somebody keeps it.
                            </p>
                        </div>
                        {read && <p className="text-sm text-green-700 bg-green-50 rounded-lg p-3 mb-3">{read}</p>}

                        <ModalSectionBar>Look for what is near us</ModalSectionBar>
                        <form onSubmit={findNearby} className="py-3 flex flex-wrap gap-2 items-end">
                            <div className="flex-1 min-w-[12rem]">
                                <label className={labelClass} htmlFor="place-address">
                                    The restaurant&apos;s address, or where it is
                                </label>
                                <input
                                    id="place-address"
                                    className={fieldClass}
                                    value={address}
                                    onChange={e => setAddress(e.target.value)}
                                    placeholder={activeRestaurant?.location || 'D01 V2K7, or 53.3486 N, 6.2285 W'}
                                />
                            </div>
                            <button type="submit" disabled={searching} className={secondaryButton}>
                                {searching ? 'Looking...' : 'Look'}
                            </button>
                            {/* The address lookup is the one part of this that
                                can refuse us and say nothing useful, so the box
                                takes a pair of numbers too. Right click the spot
                                in Google Maps and it hands you them. */}
                            <p className="text-xs text-muted w-full">
                                An Eircode, an address, or coordinates in any of the shapes
                                Google gives them:{' '}
                                <code className="font-mono">53.3486&deg; N, 6.2285&deg; W</code>.
                                Whatever you give it is remembered, so this is asked once.
                            </p>
                        </form>

                        {/* A lookup can succeed and be wrong. Saying where
                            it searched from is the only way anybody would
                            catch that, and the fix is to paste the right
                            point over it. */}
                        {lookedFrom && (
                            <p className="text-xs text-muted pb-3">
                                Looked from{' '}
                                <code className="font-mono">
                                    {lookedFrom.latitude}, {lookedFrom.longitude}
                                </code>
                                . If that is not where this restaurant is, paste the right
                                coordinates above and look again.
                            </p>
                        )}

                        {candidates && candidates.length === 0 && (
                            <p className="text-sm text-muted pb-3">
                                Nothing selling tickets within a walk of there. Add anything else
                                by hand above: a cinema, a park, a harbour, a college, a shopping
                                centre, the council&apos;s events page.
                            </p>
                        )}

                        {(candidates || []).map(found => (
                            <div
                                key={found.ticketmaster_venue_id || found.name}
                                className="flex flex-wrap items-center gap-3 py-2 border-t border-border"
                            >
                                <span className="flex-1 min-w-0">
                                    <span className="block text-sm font-semibold text-gray-900">
                                        {found.name}
                                    </span>
                                    {/* No rule will ever safely match "Odeon
                                        Point Square" to "Odeon Point Village",
                                        since the last word is the only thing
                                        that differs and it is also the only
                                        thing that differs between two real
                                        venues in one complex. So it is said
                                        rather than decided. */}
                                    {rows.some(r => couldBeSamePlace(r.place.name, found.name)) && (
                                        <span className="block text-xs text-amber-800 font-medium">
                                            Looks like{' '}
                                            {placeName(rows.find(
                                                r => couldBeSamePlace(r.place.name, found.name),
                                            ).place)}
                                            , which you already watch. Adding it makes a second one.
                                        </span>
                                    )}
                                    <span className="block text-xs text-muted">
                                        {found.relation === 'city'
                                            ? `${found.km} km away, big enough for the city rule`
                                            : `${walkWords(found.walkMinutes)} · ${found.km} km`}
                                        {found.listed != null && ` · ${found.listed} listed`}
                                    </span>
                                </span>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => takeOn(found)}
                                    className={`${secondaryButton} py-1 px-3 text-xs`}
                                >
                                    Watch it
                                </button>
                            </div>
                        ))}
                    </>
                )}
            </div>

            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>Done</button>
            </div>
        </Modal>
    )
}

// One place, the way the settings screen reads it: a name, how far somebody
// would walk, and where its listings come from.
function PlaceRow({ row, today, busy, onToggle, onEdit }) {
    const tag = placeTag(row.place, row)
    const read = readWords(row.place, today)
    // A city place that is showing nothing says why, right here. Silence is
    // the worst thing a rule can do: somebody who ticks Croke Park and sees
    // nothing for a fortnight cannot tell whether it is quiet, broken, or
    // waiting on them.
    const stuck = cityProblem(row)
    const far = row.relation === 'city'
        ? (stuck || pastWalking(row.distance_km, row.place.capacity) || 'across town')
        : walkWords(row.walk_minutes)

    return (
        <div className="flex flex-wrap items-center gap-3 py-2.5 border-t border-border first:border-t-0">
            <input
                type="checkbox"
                checked={row.is_active}
                disabled={busy}
                onChange={onToggle}
                className={checkbox}
                aria-label={`Watch ${row.place.name}`}
            />
            <button type="button" onClick={onEdit} className="flex-1 min-w-0 text-left">
                <span className="block text-sm font-semibold text-gray-900">{row.place.name}</span>
                <span className="block text-xs text-muted">
                    {[far, sourceWords(row.place), read].filter(Boolean).join(' · ')}
                </span>
            </button>
            <span
                className={`text-[0.625rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded border whitespace-nowrap ${
                    TAG_LOOK[row.is_active && !stuck ? tag.tone : 'off']
                }`}
            >
                {!row.is_active ? 'Off' : (stuck ? 'Not counting' : tag.text)}
            </span>
        </div>
    )
}

