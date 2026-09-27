import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useRestaurant } from '@/context/restaurant'
import { useConfirm } from '@/context/confirm'
import { can, MANAGERS } from '@/lib/access'
import { stampDateTime } from '@/lib/dates'
import { friendlyError } from '@/lib/errors'
import { badge, checkbox, primaryButton, rowButton } from '@/lib/controlStyles'
import { doneDay, doneDayLong, elementDone, leftLastTime, listTree, placeOf, roundOutcome, tickable } from '@/lib/checklists'
import ErrorBanner from '@/components/ui/ErrorBanner'
import BackButton from '@/components/ui/BackButton'
import GuidePicture from '@/components/checklists/GuidePicture'
import PhotoButton from '@/components/checklists/PhotoButton'
import PhotoStrip from '@/components/checklists/PhotoStrip'
import { signer } from '@/components/checklists/signPhotos'

// Working through one round of a list, on the phone.
//
// Tick as you go, then Submit. Until Submit a tick can be taken off again,
// which is what a mis-tap needs; after it nobody can change it, and that is
// the database's rule rather than this screen's (see checklist_tick_guard).
// His answer, 27 September. The time kept is when the box was ticked, not when
// Submit was pressed, so ten things done over an hour and saved at the end
// still say when each was done.
//
// Ticks not yet submitted are kept on this phone, so a page closed by mistake
// or a phone that went to sleep does not lose them. They are only this phone's:
// somebody else on another phone sees what has been submitted and nothing else.
//
// A photo is uploaded the moment it is taken, because that is where the waiting
// is, and only joined to its tick on Submit. One taken and never submitted is
// deleted by the nightly job after a day.
export default function ChecklistRoundPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const confirm = useConfirm()
    const { user } = useAuth()
    const { restaurants, activeRestaurant } = useRestaurant()
    const isManager = can(user, MANAGERS)

    const [round, setRound] = useState(null)
    const [list, setList] = useState(null)
    const [categories, setCategories] = useState([])
    const [tasks, setTasks] = useState([])
    const [saved, setSaved] = useState([])
    const [lastDone, setLastDone] = useState(new Map())
    const [pending, setPending] = useState(() => readDraft(`checklist-draft-${id}`))
    const [version, setVersion] = useState(0)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')
    const [before, setBefore] = useState({ round: null, ticks: [] })

    const draftKey = `checklist-draft-${id}`

    const load = useCallback(async () => {
        setError('')
        const { data: r, error: roundErr } = await supabase.from('checklist_rounds').select('*').eq('id', id).maybeSingle()
        if (roundErr || !r) {
            setError(roundErr ? friendlyError(roundErr) : 'That round could not be found.')
            setLoading(false)
            return
        }
        const [l, cats, tsk, ticks] = await Promise.all([
            supabase.from('checklists').select('*').eq('id', r.checklist_id).single(),
            supabase.from('checklist_categories').select('*').eq('checklist_id', r.checklist_id),
            supabase.from('checklist_tasks').select('*').eq('checklist_id', r.checklist_id),
            supabase.from('checklist_ticks').select('*').eq('round_id', id),
        ])
        const failed = l.error || cats.error || tsk.error || ticks.error
        if (failed) { setError(friendlyError(failed)); setLoading(false); return }

        const ids = tsk.data.map(t => t.id)
        const last = ids.length
            ? await supabase.from('checklist_last_done').select('task_id, done_at').in('task_id', ids)
            : { data: [] }

        // The round of this list before this one, for what it left undone.
        // Only a round a manager ended early leaves anything, so its ticks
        // are only read then.
        const { data: earlier } = await supabase.from('checklist_rounds').select('*')
            .eq('checklist_id', r.checklist_id).not('ended_at', 'is', null).lte('ended_at', r.started_at)
            .order('ended_at', { ascending: false }).limit(1)
        const prev = Array.isArray(earlier) ? earlier[0] || null : null
        const prevTicks = prev?.ended_by
            ? await supabase.from('checklist_ticks').select('round_id, task_id').eq('round_id', prev.id)
            : { data: [] }

        setRound(r)
        setList(l.data)
        setCategories(cats.data)
        setTasks(tsk.data)
        setSaved(ticks.data)
        setLastDone(new Map((last.data || []).map(x => [x.task_id, x.done_at])))
        setBefore({ round: prev, ticks: prevTicks.data || [] })
        setLoading(false)

        // A manager may have taken the last thing left off the list, which
        // leaves a round with nothing to tick and no tick to finish it.
        if (!r.ended_at) {
            const tree = listTree(cats.data, tsk.data)
            const done = new Set(ticks.data.map(t => t.task_id))
            if (tickable(tree).length && tickable(tree).every(t => done.has(t.id))) {
                const { data: finished } = await supabase.rpc('finish_checklist_round', { round: id })
                if (finished) setVersion(v => v + 1)
            }
        }
    }, [id])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load()
    }, [load, version])

    function keep(next) {
        setPending(next)
        try {
            if (Object.keys(next).length) localStorage.setItem(draftKey, JSON.stringify(next))
            else localStorage.removeItem(draftKey)
        } catch {
            // Storage is off. The ticks still work, they just do not survive
            // the page closing.
        }
    }

    // What the round shows. For one still going, the list as it is now. For
    // one that has ended, the list as it is now plus anything ticked on it
    // that has since been taken off, so the record keeps what was done.
    const tree = useMemo(() => {
        const ticked = new Set(saved.map(t => t.task_id))
        const parents = new Set(tasks.filter(t => ticked.has(t.id) && t.parent_id).map(t => t.parent_id))
        const shownTasks = tasks.map(t => (ticked.has(t.id) || parents.has(t.id) ? { ...t, is_active: true } : t))
        const holding = new Set(shownTasks.filter(t => ticked.has(t.id)).map(t => t.category_id))
        return listTree(categories.map(c => (holding.has(c.id) ? { ...c, is_active: true } : c)), shownTasks)
    }, [categories, tasks, saved])

    if (loading) return <p className="text-sm text-muted">Loading the list...</p>
    if (!round || !list) {
        return (
            <div>
                <ErrorBanner>{error || 'That round could not be found.'}</ErrorBanner>
                <BackButton to="/checklists" className="mt-4">Back to checklists</BackButton>
            </div>
        )
    }

    const open = !round.ended_at
    const byTask = new Map(saved.map(t => [t.task_id, t]))
    const all = tickable(tree)
    const allIds = new Set(all.map(t => t.id))
    const waiting = Object.keys(pending).filter(k => allIds.has(k) && !byTask.has(k))
    const done = all.filter(t => byTask.has(t.id)).length
    const outcome = roundOutcome(round)
    // Left undone last time and not ticked yet this time: High priority.
    const priority = leftLastTime(tree, before.round, before.ticks)
    const urgent = open ? all.filter(t => priority.has(t.id) && !byTask.has(t.id)) : []
    const where = placeOf(tree)

    function toggle(task) {
        if (!open || byTask.has(task.id)) return
        const next = { ...pending }
        if (next[task.id]) delete next[task.id]
        else next[task.id] = { at: new Date().toISOString(), photos: [] }
        keep(next)
    }

    function addPhoto(task, path) {
        setPending(before => {
            const entry = before[task.id] || { at: new Date().toISOString(), photos: [] }
            const next = { ...before, [task.id]: { ...entry, photos: [...entry.photos, path] } }
            try { localStorage.setItem(draftKey, JSON.stringify(next)) } catch { /* see keep */ }
            return next
        })
    }

    function removePhoto(task, path) {
        const entry = pending[task.id]
        if (!entry) return
        const photos = entry.photos.filter(p => p !== path)
        const next = { ...pending }
        // A thing that needs a photo is not ticked without one.
        if (task.needs_photo && !photos.length) delete next[task.id]
        else next[task.id] = { ...entry, photos }
        keep(next)
    }

    async function submit() {
        const rows = waiting.map(taskId => ({
            round_id: round.id, task_id: taskId, done_at: pending[taskId].at, photos: pending[taskId].photos || [],
        }))
        if (!rows.length) return
        setBusy(true)
        setError('')
        setNotice('')
        // Somebody on another phone may have ticked the same thing in the
        // meantime. Theirs stands, and this says so rather than failing.
        const { data, error: saveErr } = await supabase
            .from('checklist_ticks')
            .upsert(rows, { onConflict: 'round_id,task_id', ignoreDuplicates: true })
            .select('task_id')
        setBusy(false)
        if (saveErr) { setError(friendlyError(saveErr)); load(); return }
        const got = new Set((data || []).map(d => d.task_id))
        const theirs = rows.length - got.size
        keep({})
        setNotice(theirs
            ? `${got.size} saved. ${theirs === 1 ? 'One was' : `${theirs} were`} already done by somebody else, so theirs stands.`
            : `${got.size === 1 ? '1 tick' : `${got.size} ticks`} saved.`)
        load()
    }

    // What is left comes back on the next round as High priority. No reason is
    // asked for: his call, 27 September, it goes in a comment on the report or
    // is said to whoever needs to know.
    async function endEarly() {
        const left = all.length - done
        const ok = await confirm({
            title: 'End this round?',
            message: `${left === 1 ? 'One thing is' : `${left} things are`} not done. `
                + `${left === 1 ? 'It comes' : 'They come'} back on the next round as High priority, and the weekly report shows ${left === 1 ? 'it' : 'them'} as not done.`,
            confirmLabel: 'End the round',
            tone: 'danger',
            dangerNote: 'A round cannot be opened again once it has ended.',
        })
        if (!ok) return
        setBusy(true)
        const { error: endErr } = await supabase.from('checklist_rounds').update({ ended_at: new Date().toISOString() }).eq('id', round.id)
        setBusy(false)
        if (endErr) { setError(friendlyError(endErr)); return }
        keep({})
        load()
    }

    function jumpTo(taskId) {
        document.getElementById(`row-${taskId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }

    async function deleteRound() {
        const ok = await confirm({
            title: 'Delete this round?',
            message: 'Nothing on it has been ticked, so nothing is lost. Use this for a round started by mistake.',
            confirmLabel: 'Delete it',
            tone: 'danger',
        })
        if (!ok) return
        const { error: delErr } = await supabase.from('checklist_rounds').delete().eq('id', round.id)
        if (delErr) { setError(friendlyError(delErr)); return }
        keep({})
        navigate('/checklists')
    }

    async function downloadPdf() {
        setBusy(true)
        try {
            const { roundPdf, loadPictures } = await import('@/lib/checklistPdf')
            const kept = saved.filter(t => !t.photos_gone_at).flatMap(t => t.photos || [])
            const pictures = await loadPictures(kept, signer)
            const restaurant = restaurants.find(r => r.id === round.restaurant_id) || activeRestaurant
            await roundPdf({ restaurant, list, tree, round, ticks: saved, pictures, generatedBy: user?.full_name })
        } catch (err) {
            setError(friendlyError(err))
        } finally {
            setBusy(false)
        }
    }

    return (
        // One screen tall on a computer, with only the list scrolling, the way
        // the stock take count is. The page used to scroll as a whole, and a
        // bar stuck to the top of a scroller stops short of it by the
        // scroller's padding, so the list showed through above the bar and
        // slid out under it. On a phone it is an ordinary tall page and the
        // bars stick to the top and bottom of the screen.
        <div className="-mx-4 md:-mx-7 -my-4 md:-my-7 flex flex-col md:h-[calc(100vh-4rem)]">
            {/* The same bar the stock take counts under, sticky on a phone so
                where you are up to never scrolls away. z-20, under the menu. */}
            <div className="flex-shrink-0 sticky top-0 md:static z-20 bg-white border-b border-border shadow-sm px-4 md:px-7">
                <div className="py-3 flex items-center gap-3">
                    <button type="button" onClick={() => navigate('/checklists')} className="text-gray-500 hover:text-gray-700 flex-shrink-0" aria-label="Back to checklists">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="font-semibold text-gray-900 truncate">{list.name}</h1>
                        <p className="text-xs text-muted">
                            {done} of {all.length} done
                            {waiting.length > 0 && <span className="text-accent-ink font-semibold"> · {waiting.length} not saved yet</span>}
                        </p>
                    </div>
                    {isManager && (
                        <button type="button" onClick={downloadPdf} disabled={busy} className={`${rowButton('plain')} flex-shrink-0`}>PDF</button>
                    )}
                </div>
                <div className="w-full bg-gray-200 h-1">
                    <div className="bg-accent h-full transition-all" style={{ width: all.length ? `${(done / all.length) * 100}%` : '0%' }} />
                </div>
            </div>

            {/* No padding on top of the scroller itself, for the same reason:
                the category headings stick to its top edge. */}
            <div className="flex-1 md:overflow-y-auto px-4 md:px-7 pb-32 md:pb-8">
                <div className="max-w-3xl pt-4">
                    <p className="text-sm text-muted">
                        Started {doneDayLong(round.started_at)}{round.started_by_name && ` by ${round.started_by_name}`}.
                    </p>
                    {!open && (
                        <div className={`mt-3 text-sm px-4 py-3 rounded-lg border ${outcome === 'finished' ? 'bg-green-50 border-green-200 text-green-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                            {outcome === 'finished'
                                ? `Finished ${stampDateTime(round.ended_at)}. Everything on the list was done.`
                                : `Ended ${stampDateTime(round.ended_at)}${round.ended_by_name ? ` by ${round.ended_by_name}` : ''} with ${all.length - done} not done.`}
                            {' '}Nothing on it can be changed now.
                        </div>
                    )}
                    {urgent.length > 0 && (
                        <div className="mt-4 rounded-xl border-2 border-red-300 bg-red-50 p-4" role="note">
                            <div className="flex items-center justify-between gap-3">
                                <p className="font-semibold text-red-900">High priority</p>
                                <span className={`${badge} bg-red-700 text-white`}>{urgent.length}</span>
                            </div>
                            <p className="text-sm text-red-900 mt-1">
                                {urgent.length === 1 ? 'This was' : 'These were'} not done last time, so do {urgent.length === 1 ? 'it' : 'them'} first.
                                {before.round?.ended_by_name && ` ${before.round.ended_by_name} ended that round on ${doneDayLong(before.round.ended_at)}.`}
                            </p>
                            <ul className="mt-2 space-y-1.5">
                                {urgent.map(t => (
                                    <li key={t.id}>
                                        <button type="button" onClick={() => jumpTo(t.id)} className="text-left text-sm font-semibold text-red-900 underline underline-offset-2 decoration-red-300 hover:decoration-red-700">
                                            {where.get(t.id)?.label}
                                        </button>
                                        <span className="block text-xs text-red-800">{where.get(t.id)?.category}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {open && (
                        <p className="text-xs text-muted mt-1">
                            Tick things as you do them, then press Submit. Once submitted, a tick cannot be changed.
                        </p>
                    )}

                    <ErrorBanner className="mt-3">{error}</ErrorBanner>
                    {notice && <p role="status" className="mt-3 text-sm text-green-900 bg-green-50 rounded-lg p-3">{notice}</p>}

                    {all.length === 0 && (
                        <p className="text-sm text-muted mt-6">There is nothing on this list yet.</p>
                    )}

                    {tree.map(({ category, elements }) => {
                        if (!elements.length) return null
                        const leaves = elements.flatMap(e => (e.subs.length ? e.subs : [e.task]))
                        const catDone = leaves.filter(t => byTask.has(t.id)).length
                        return (
                            <section key={category.id} className="pt-5">
                                <div className="sticky top-[4.25rem] md:top-0 z-10 bg-sidebar rounded-lg px-3 py-2.5 mb-2 flex items-center justify-between shadow-md">
                                    <h2 className="font-serif text-base font-bold text-white">{category.name}</h2>
                                    <span className="text-xs font-semibold text-white bg-white/20 px-2 py-0.5 rounded-full">{catDone}/{leaves.length}</span>
                                </div>
                                <div className="bg-white border border-gray-300 rounded-xl overflow-hidden divide-y divide-border shadow-sm">
                                    {elements.map(element => {
                                        const { task, subs } = element
                                        const rowProps = t => ({
                                            key: t.id, task: t, tick: byTask.get(t.id), draft: pending[t.id], lastDone: lastDone.get(t.id),
                                            open, restaurantId: round.restaurant_id, roundId: round.id,
                                            onToggle: () => toggle(t), onAddPhoto: path => addPhoto(t, path),
                                            onRemovePhoto: path => removePhoto(t, path), onError: setError,
                                        urgent: open && priority.has(t.id) && !byTask.has(t.id),
                                        })
                                        if (!subs.length) return <TickRow {...rowProps(task)} />
                                        const subDone = subs.filter(s => byTask.has(s.id)).length
                                        const complete = elementDone(element, new Set(byTask.keys()))
                                        return (
                                            <div key={task.id} className={complete ? 'bg-green-50/60' : ''}>
                                                <div className="px-4 pt-3 pb-1">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <p className="font-semibold text-gray-900">{task.name}</p>
                                                        <span className={`text-xs font-semibold flex-shrink-0 ${complete ? 'text-green-800' : 'text-muted'}`}>
                                                            {complete ? 'Done' : `${subDone} of ${subs.length}`}
                                                        </span>
                                                    </div>
                                                    {task.how_to && <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-line">{task.how_to}</p>}
                                                    {task.guide_photos?.length > 0 && <GuidePicture paths={task.guide_photos} name={task.name} />}
                                                </div>
                                                <div className="pl-4 divide-y divide-border">
                                                    {subs.map(s => <TickRow {...rowProps(s)} />)}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </section>
                        )
                    })}

                    {isManager && open && (
                        <div className="mt-8 pt-4 border-t border-border flex flex-wrap gap-2">
                            {saved.length === 0
                                ? <button type="button" onClick={deleteRound} className={rowButton('danger')}>Delete this round</button>
                                : <button type="button" onClick={endEarly} disabled={busy} className={rowButton('danger')}>End this round now</button>}
                            <p className="text-xs text-muted basis-full">
                                {saved.length === 0
                                    ? 'For a round started by mistake. Only a manager can do this.'
                                    : 'Ends it with what is left marked as not done, and that comes back as High priority next time. Only a manager can do this.'}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {open && waiting.length > 0 && (
                <div className="flex-shrink-0 sticky bottom-0 md:static z-20 bg-white border-t border-border shadow-[0_-4px_12px_rgba(0,0,0,0.08)] px-4 md:px-7 py-3">
                    <div className="max-w-3xl flex items-center gap-3">
                        <p className="text-sm text-gray-700 flex-1 min-w-0">
                            {waiting.length === 1 ? '1 tick' : `${waiting.length} ticks`} not saved yet.
                        </p>
                        <button type="button" onClick={submit} disabled={busy} className={primaryButton('lg')}>
                            {busy ? 'Saving...' : 'Submit'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

// One thing to tick. The whole name is the label, so a thumb landing anywhere
// on the words ticks it rather than having to find the box.
function TickRow({ task, tick, draft, lastDone, open, urgent, restaurantId, roundId, onToggle, onAddPhoto, onRemovePhoto, onError }) {
    const photos = draft?.photos || []
    const needsOne = task.needs_photo && !tick && !photos.length
    const inputId = `tick-${task.id}`

    return (
        <div
            id={`row-${task.id}`}
            className={`flex items-start gap-3 px-4 py-3 min-h-[56px] scroll-mt-32 ${tick ? 'bg-green-50' : urgent ? 'bg-red-50 shadow-[inset_4px_0_0_#b91c1c]' : draft ? 'bg-accent-light/50' : ''}`}
        >
            {/* A submitted tick is a solid green mark rather than a box. A
                disabled box is drawn grey by the browser, which reads as "you
                cannot tick this" when what it means is "done". The box is still
                there for a screen reader, just not drawn. */}
            {tick && (
                <span aria-hidden="true" className="w-6 h-6 mt-0.5 flex-shrink-0 rounded-md bg-green-700 text-white flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                </span>
            )}
            <input
                id={inputId}
                type="checkbox"
                className={tick ? 'sr-only' : `${checkbox} mt-0.5`}
                checked={Boolean(tick || draft)}
                disabled={!open || Boolean(tick) || (task.needs_photo && !photos.length)}
                onChange={onToggle}
            />
            <div className="flex-1 min-w-0">
                {urgent && <span className={`${badge} bg-red-700 text-white mb-1`}>High priority</span>}
                <label htmlFor={inputId} className="block font-medium text-gray-900 cursor-pointer">{task.name}</label>
                {task.how_to && <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-line">{task.how_to}</p>}
                {task.guide_photos?.length > 0 && <GuidePicture paths={task.guide_photos} name={task.name} />}

                {tick ? (
                    <p className="text-xs text-green-900 mt-1.5">Done by {tick.done_by_name}, {stampDateTime(tick.done_at)}</p>
                ) : draft ? (
                    <p className="text-xs text-accent-ink font-semibold mt-1.5">Ticked, not saved yet</p>
                ) : (
                    <p className="text-xs text-muted mt-1.5">
                        {lastDone ? `Last done ${doneDay(lastDone)}` : 'Not done before'}
                        {!open && ' · Not done this round'}
                    </p>
                )}

                {tick && <PhotoStrip paths={tick.photos || []} gone={Boolean(tick.photos_gone_at)} />}
                {!tick && <PhotoStrip paths={photos} onRemove={open ? onRemovePhoto : undefined} />}

                {open && !tick && task.needs_photo && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <PhotoButton
                            restaurantId={restaurantId}
                            folder={roundId}
                            room={4 - photos.length}
                            onAdded={onAddPhoto}
                            onError={onError}
                        >
                            {photos.length ? 'Add another photo' : 'Take photo'}
                        </PhotoButton>
                        {needsOne && <span className="text-xs text-amber-800">Needs a photo before it can be ticked.</span>}
                    </div>
                )}
            </div>
        </div>
    )
}

// Ticks this phone has not submitted yet, if it kept any.
function readDraft(key) {
    try {
        const kept = JSON.parse(localStorage.getItem(key) || '{}')
        return kept && typeof kept === 'object' ? kept : {}
    } catch {
        // Nothing kept, or storage is off in this browser. Starts empty.
        return {}
    }
}
