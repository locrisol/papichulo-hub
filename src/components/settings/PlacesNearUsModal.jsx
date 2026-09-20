import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRestaurant } from '@/context/restaurant'
import { friendlyError } from '@/lib/errors'
import { todayISO } from '@/lib/dates'
import {
    modalFooter, secondaryButton, fieldClass, labelClass, checkbox, primaryButton,
} from '@/lib/controlStyles'
import { ModalSectionBar } from '@/components/ui/ModalSection'
import Modal from '@/components/ui/Modal'
import ErrorBanner from '@/components/ui/ErrorBanner'
import {
    CITY_CAPACITY, CITY_RADIUS_KM, WALKABLE_MINUTES,
    walkWords, sourceWords, placeTag, readWords, pastWalking,
} from '@/lib/nearby'

const BLANK = { name: '', walk_minutes: '', page_url: '', ticketmaster_venue_id: '', capacity: '' }

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
    const { activeRestaurant, setActiveRestaurant } = useRestaurant()
    const today = todayISO()

    const [rows, setRows] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)

    const [adding, setAdding] = useState(false)
    const [form, setForm] = useState(BLANK)
    const [editingId, setEditingId] = useState(null)

    const [address, setAddress] = useState('')
    const [searching, setSearching] = useState(false)
    const [candidates, setCandidates] = useState(null)

    const cityOn = activeRestaurant?.watch_city_events !== false

    const load = useCallback(async () => {
        setLoading(true)
        const { data, error: failed } = await supabase.from('restaurant_places')
            .select('id, relation, walk_minutes, distance_km, is_active, sort_order, place:places(*)')
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
        }
        const minutes = figure(form.walk_minutes)

        if (editingId) {
            const row = rows.find(r => r.id === editingId)
            const [one, two] = await Promise.all([
                supabase.from('places').update(patch).eq('id', row.place.id),
                supabase.from('restaurant_places')
                    .update({ walk_minutes: minutes, sort_order: minutes ?? 0 })
                    .eq('id', editingId),
            ])
            setBusy(false)
            const failed = [one, two].find(r => r.error)
            if (failed) { setError(friendlyError(failed.error)); return }
        } else {
            const { data: made, error: e1 } = await supabase.from('places')
                .insert(patch).select().single()
            if (e1) { setBusy(false); setError(friendlyError(e1)); return }

            const { error: e2 } = await supabase.from('restaurant_places').insert({
                restaurant_id: activeRestaurant.id,
                place_id: made.id,
                relation: 'walk',
                walk_minutes: minutes ?? WALKABLE_MINUTES,
                sort_order: minutes ?? WALKABLE_MINUTES,
            })
            setBusy(false)
            if (e2) { setError(friendlyError(e2)); return }
        }

        setForm(BLANK)
        setAdding(false)
        setEditingId(null)
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
        })
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

        if (failed) { setError(friendlyError(failed)); return }
        if (data?.error) { setError(data.error); return }
        setCandidates(data?.places || [])
    }

    async function takeOn(found) {
        setBusy(true)
        const { data: made, error: e1 } = await supabase.from('places')
            .upsert({
                name: found.name,
                ticketmaster_venue_id: found.ticketmaster_venue_id || null,
                latitude: found.latitude ?? null,
                longitude: found.longitude ?? null,
            }, { onConflict: 'ticketmaster_venue_id' })
            .select().single()

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
                                <div className="sm:col-span-2 flex gap-2">
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
                                </div>
                            </form>
                        )}

                        <ModalSectionBar>Look for what is near us</ModalSectionBar>
                        <form onSubmit={findNearby} className="py-3 flex flex-wrap gap-2 items-end">
                            <div className="flex-1 min-w-[12rem]">
                                <label className={labelClass} htmlFor="place-address">
                                    The restaurant&apos;s address
                                </label>
                                <input
                                    id="place-address"
                                    className={fieldClass}
                                    value={address}
                                    onChange={e => setAddress(e.target.value)}
                                    placeholder={activeRestaurant?.location || '12 Marine Road, Dun Laoghaire'}
                                />
                            </div>
                            <button type="submit" disabled={searching} className={secondaryButton}>
                                {searching ? 'Looking...' : 'Look'}
                            </button>
                        </form>

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
    const far = row.relation === 'city'
        ? pastWalking(row.distance_km, row.place.capacity)
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
                    TAG_LOOK[row.is_active ? tag.tone : 'off']
                }`}
            >
                {row.is_active ? tag.text : 'Off'}
            </span>
        </div>
    )
}

