import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useRestaurant } from '@/context/restaurant'
import { useConfirm } from '@/context/confirm'
import { useRecountBadges } from '@/context/badges'
import { can, MANAGERS } from '@/lib/access'
import { stampDateTime } from '@/lib/dates'
import { friendlyError } from '@/lib/errors'
import { badge, card, checkbox, hintClass, primaryButton, rowButton } from '@/lib/controlStyles'
import { readStored, writeStored, forgetStored } from '@/lib/browserStore'
import { doneDay, doneDayLong, elementDone, leftLastTime, listTree, placeOf, roundOutcome, tickable } from '@/lib/checklists'
import ErrorBanner from '@/components/ui/ErrorBanner'
import BackButton from '@/components/ui/BackButton'
import CountingBar from '@/components/ui/CountingBar'
import Notice from '@/components/ui/Notice'
import PdfButton from '@/components/ui/PdfButton'
import GuidePicture from '@/components/checklists/GuidePicture'
import PhotoButton from '@/components/checklists/PhotoButton'
import PhotoStrip from '@/components/checklists/PhotoStrip'
import { signer } from '@/components/checklists/signPhotos'
import useKeepPlace from '@/components/checklists/useKeepPlace'

// Working through one round of a list, on the phone.
//
// Each tick is saved the moment it is made (his, 11 October). It used to wait
// on the phone for Submit, which was easy to leave without pressing. Once
// saved nobody can change it, and that is the database's rule rather than this
// screen's (see checklist_tick_guard), with one exception for a mis-tap: the
// one who ticked it can take it back for ten minutes while the round is open.
//
// A tick that could not be saved, on bad wifi say, is kept on this phone and
// tried again by itself every half minute, on coming back to the page and when
// the phone is back online, so a page closed or a phone gone to sleep loses
// nothing.
//
// A task that needs a photo has its photos taken first and is then ticked,
// which saves the tick with them. A photo is uploaded the moment it is taken;
// the nightly job keeps it while the round is open and deletes one never used
// once the round has ended. A list can say its photos are not needed for now
// (photos_required), and then a photo is offered but not asked for.
//
// Several people work one list at once (seven on a deep clean, 10 October), so
// what the others have saved is read again every half minute, on coming back
// to the page, and on every tick.

// Shorter than the stock take's minute: a tick is quicker than a count.
const REFRESH_EVERY = 30 * 1000

// How long a mis-tap can be taken back. The database holds the same number
// (checklist_ticks_delete).
const TAKE_BACK_MINUTES = 10

// A tick waiting on this phone. Kept from before saving was immediate, a tick
// with nothing saying otherwise is one waiting to be saved; ticked: false is
// photos taken for a task not ticked yet.
const isTick = entry => Boolean(entry) && entry.ticked !== false

export default function ChecklistRoundPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const confirm = useConfirm()
    // The sidebar counts a list running out of time until a round of it ends.
    const recountBadges = useRecountBadges()
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
    // The tasks being saved right now, so a second tap does not save twice.
    const [saving, setSaving] = useState(() => new Set())
    const savingRef = useRef(new Set())
    const pendingRef = useRef(pending)
    // Read on every refresh, for how long a tick can still be taken back.
    const [now, setNow] = useState(() => Date.now())
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')
    const [before, setBefore] = useState({ round: null, ticks: [] })
    // The categories open on this tab. All closed to start with (his, 11
    // October), and kept for the tab so a reload opens the same ones.
    const openKey = `checklist-open-${id}`
    const [openCats, setOpenCats] = useState(() => readOpen(openKey))
    const listRef = useRef(null)
    const keepAt = useKeepPlace(listRef, `checklist-place-${id}`, !loading && Boolean(round))

    const draftKey = `checklist-draft-${id}`

    // A note says so for a few seconds and goes. It sits in the bar at the
    // bottom, since the page no longer moves to show what is at the top.
    useEffect(() => {
        if (!notice) return
        const timer = setTimeout(() => setNotice(''), 6000)
        return () => clearTimeout(timer)
    }, [notice])

    function showOpen(next) {
        setOpenCats(next)
        writeStored('session', openKey, JSON.stringify([...next]))
    }

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

    // If storage is off the ticks still work, they just do not survive the
    // page closing.
    const keep = useCallback(next => {
        pendingRef.current = next
        setPending(next)
        if (Object.keys(next).length) writeStored('local', draftKey, JSON.stringify(next))
        else forgetStored('local', draftKey)
    }, [draftKey])

    // What waits on this phone, changed from what it is right now rather than
    // from what the screen last drew: two photos landing between two draws
    // would otherwise keep only the second.
    const change = useCallback(fn => keep(fn(pendingRef.current)), [keep])

    // The round, its ticks, and the list and its tasks, since a manager may
    // have changed whether a photo is needed while it is being worked. A read
    // that fails is left for the next one.
    const refresh = useCallback(async () => {
        const [r, ticks] = await Promise.all([
            supabase.from('checklist_rounds').select('*').eq('id', id).maybeSingle(),
            supabase.from('checklist_ticks').select('*').eq('round_id', id),
        ])
        setNow(Date.now())
        if (r.error || ticks.error || !r.data) return
        const [l, tsk] = await Promise.all([
            supabase.from('checklists').select('*').eq('id', r.data.checklist_id).single(),
            supabase.from('checklist_tasks').select('*').eq('checklist_id', r.data.checklist_id),
        ])
        setRound(r.data)
        setSaved(ticks.data)
        if (!l.error && l.data) setList(l.data)
        if (!tsk.error && tsk.data) setTasks(tsk.data)
        // Anything waiting here that is saved now, by this phone or another,
        // waits no longer.
        const done = new Set(ticks.data.map(t => t.task_id))
        const waitingHere = pendingRef.current
        if (Object.keys(waitingHere).some(k => done.has(k))) {
            keep(Object.fromEntries(Object.entries(waitingHere).filter(([k]) => !done.has(k))))
        }
    }, [id, keep])

    // Saves the ticks waiting on this phone, one at a time so one refused does
    // not hold up the rest. only names the ones to try; none means all.
    const save = useCallback(async only => {
        const waitingHere = pendingRef.current
        const ids = (only || Object.keys(waitingHere))
            .filter(k => isTick(waitingHere[k]) && !savingRef.current.has(k))
        if (!ids.length) return
        ids.forEach(k => savingRef.current.add(k))
        setSaving(new Set(savingRef.current))
        let theirs = 0
        let failed = null
        for (const k of ids) {
            const entry = pendingRef.current[k]
            if (!isTick(entry)) continue
            // Somebody on another phone may have ticked the same thing in the
            // meantime. Theirs stands, and this says so rather than failing.
            const { data, error: saveErr } = await supabase
                .from('checklist_ticks')
                .upsert([{ round_id: id, task_id: k, done_at: entry.at, photos: entry.photos || [] }],
                    { onConflict: 'round_id,task_id', ignoreDuplicates: true })
                .select('task_id')
            if (saveErr) { failed = saveErr; continue }
            if (!data?.length) theirs += 1
            const after = { ...pendingRef.current }
            delete after[k]
            keep(after)
        }
        ids.forEach(k => savingRef.current.delete(k))
        setSaving(new Set(savingRef.current))
        if (failed) setError(friendlyError(failed))
        else setError('')
        if (theirs) setNotice(`${theirs === 1 ? 'One was' : `${theirs} were`} already done by somebody else, so theirs stands.`)
        // After the read, which is what ends the round once everything is ticked.
        await refresh()
        recountBadges()
    }, [id, keep, refresh, recountBadges])

    const isOpen = Boolean(round && !round.ended_at)
    useEffect(() => {
        if (!isOpen) return
        const again = () => {
            if (document.visibilityState === 'hidden') return
            refresh()
            save()
        }
        // Anything left waiting from before goes as soon as the round is up.
        save()
        window.addEventListener('focus', again)
        window.addEventListener('online', again)
        document.addEventListener('visibilitychange', again)
        const timer = setInterval(again, REFRESH_EVERY)
        return () => {
            window.removeEventListener('focus', again)
            window.removeEventListener('online', again)
            document.removeEventListener('visibilitychange', again)
            clearInterval(timer)
        }
    }, [isOpen, refresh, save])

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
    const waiting = Object.keys(pending).filter(k => allIds.has(k) && !byTask.has(k) && isTick(pending[k]))
    // A task marked as needing a photo needs one unless the list says not.
    const photosRequired = list.photos_required !== false
    const needsPhoto = t => Boolean(t.needs_photo) && photosRequired
    const canTakeBack = tick => open && tick.done_by === user?.id
        && now - new Date(tick.saved_at).getTime() < TAKE_BACK_MINUTES * 60 * 1000
    const done = all.filter(t => byTask.has(t.id)).length
    const outcome = roundOutcome(round)
    // High priority until it is ticked: left undone last time, or marked on
    // the list as always High priority (his, 11 October).
    const lastTime = leftLastTime(tree, before.round, before.ticks)
    // Marked on an element with sub elements, every sub element under it is.
    const marked = new Set(tasks.filter(t => t.high_priority).map(t => t.id))
    const isMarked = t => marked.has(t.id) || Boolean(t.parent_id && marked.has(t.parent_id))
    const isUrgent = t => (lastTime.has(t.id) || isMarked(t)) && !byTask.has(t.id)
    const urgent = open ? all.filter(isUrgent) : []
    const fromLastTime = urgent.filter(t => lastTime.has(t.id)).length
    const bothKinds = fromLastTime > 0 && fromLastTime < urgent.length
    const where = placeOf(tree)
    const shown = tree.filter(c => c.elements.length).map(c => c.category.id)
    const allOpen = shown.length > 0 && shown.every(c => openCats.has(c))
    const urgentIn = new Map()
    for (const t of urgent) urgentIn.set(t.category_id, (urgentIn.get(t.category_id) || 0) + 1)

    // One category, opened or closed from its own heading. The heading stays
    // under the finger; the others are left as they are.
    function toggleCategory(categoryId, heading) {
        const next = new Set(openCats)
        if (next.has(categoryId)) next.delete(categoryId)
        else next.add(categoryId)
        keepAt(heading, () => showOpen(next))
    }

    function toggleAll(button) {
        keepAt(button, () => showOpen(allOpen ? new Set() : new Set(shown)))
    }

    // A tap saves it. A tap on one still waiting to be saved takes it off
    // again, keeping any photos, which is the mis-tap undo before it is saved.
    function toggle(task) {
        if (!open || byTask.has(task.id) || saving.has(task.id)) return
        let saveIt = false
        change(current => {
            const entry = current[task.id]
            const next = { ...current }
            if (isTick(entry)) {
                if (entry.photos?.length) next[task.id] = { ...entry, ticked: false }
                else delete next[task.id]
                return next
            }
            if (needsPhoto(task) && !entry?.photos?.length) return current
            saveIt = true
            next[task.id] = { at: new Date().toISOString(), photos: entry?.photos || [], ticked: true }
            return next
        })
        if (saveIt) save([task.id])
    }

    // A photo waits with its task until the task is ticked, so one to four
    // can be taken first.
    function addPhoto(task, path) {
        change(current => {
            const entry = current[task.id] || { at: null, photos: [], ticked: false }
            return { ...current, [task.id]: { ...entry, photos: [...entry.photos, path] } }
        })
        refresh()
    }

    function removePhoto(task, path) {
        change(current => {
            const entry = current[task.id]
            if (!entry || isTick(entry)) return current
            const photos = entry.photos.filter(x => x !== path)
            const next = { ...current }
            if (photos.length) next[task.id] = { ...entry, photos }
            else delete next[task.id]
            return next
        })
    }

    // A mis-tap taken back. The database says whether it still can be: only
    // the one who ticked it, within ten minutes, with the round still open.
    // Its photos come back to the phone, ready to tick it again.
    async function takeBack(tick) {
        setError('')
        const { data, error: delErr } = await supabase.from('checklist_ticks').delete().eq('id', tick.id).select('id')
        if (delErr) { setError(friendlyError(delErr)); return }
        if (!data?.length) {
            setError(`That tick can no longer be taken back: only for ${TAKE_BACK_MINUTES} minutes, and only by whoever made it.`)
            refresh()
            return
        }
        if (tick.photos?.length && !tick.photos_gone_at) {
            change(current => ({ ...current, [tick.task_id]: { at: null, photos: tick.photos, ticked: false } }))
        }
        await refresh()
        recountBadges()
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
        recountBadges()
    }

    // Opens the category it is in first, since they start closed. Straight
    // there rather than gliding, so a tick arriving on the way does not stop
    // it half way.
    function jumpTo(taskId) {
        const categoryId = all.find(t => t.id === taskId)?.category_id
        const next = new Set(openCats)
        if (categoryId) next.add(categoryId)
        keepAt(null, () => showOpen(next), () => {
            document.getElementById(`row-${taskId}`)?.scrollIntoView?.({ block: 'center' })
        })
    }

    async function deleteRound() {
        const ok = await confirm({
            title: 'Delete this round?',
            message: 'Nothing on it has been ticked, so nothing is lost. Use this for a round started by mistake.',
            confirmLabel: 'Delete',
            tone: 'danger',
        })
        if (!ok) return
        const { error: delErr } = await supabase.from('checklist_rounds').delete().eq('id', round.id)
        if (delErr) { setError(friendlyError(delErr)); return }
        keep({})
        recountBadges()
        navigate('/checklists')
    }

    async function downloadPdf() {
        const { roundPdf, loadPictures } = await import('@/lib/checklistPdf')
        const kept = saved.filter(t => !t.photos_gone_at).flatMap(t => t.photos || [])
        const pictures = await loadPictures(kept, signer)
        const restaurant = restaurants.find(r => r.id === round.restaurant_id) || activeRestaurant
        await roundPdf({ restaurant, list, tree, round, ticks: saved, pictures, generatedBy: user?.full_name })
    }

    return (
        // One screen tall on a computer, with only the list scrolling, the way
        // the stock take count is. The page used to scroll as a whole, and a
        // bar stuck to the top of a scroller stops short of it by the
        // scroller's padding, so the list showed through above the bar and
        // slid out under it. On a phone it is an ordinary tall page and the
        // bars stick to the top and bottom of the screen.
        //
        // The browser's own scroll anchoring is off here (overflow-anchor),
        // because useKeepPlace does that job on every browser and the two
        // together moved the page twice.
        <div className="-mx-4 md:-mx-7 -my-4 md:-my-7 flex flex-col md:h-[calc(100vh-4rem)] [overflow-anchor:none]">
            <CountingBar
                backTo="/checklists"
                backLabel="Back to checklists"
                title={list.name}
                subtitle={(
                    <>
                        {done} of {all.length} done
                        {waiting.length > 0 && <span className="text-accent-ink font-semibold"> · {waiting.length} not saved yet</span>}
                    </>
                )}
                progress={all.length ? done / all.length : 0}
                actions={isManager && (
                    <PdfButton make={downloadPdf} onError={err => setError(friendlyError(err))} className={rowButton('plain')}>
                        PDF
                    </PdfButton>
                )}
            />

            {/* No padding on top of the scroller itself, for the same reason:
                the category headings stick to its top edge.

                relative, so what is placed absolutely inside it is placed in
                here. A saved tick keeps its box for screen readers (sr-only,
                which is absolute), and with nothing positioned in between it
                was placed against the app's main area at its spot far down
                the list, stretching that area: a second scroll bar beside this
                one and a gap at the end once anything was ticked (his
                screenshot, 15 October). */}
            <div className="relative flex-1 md:overflow-y-auto px-4 md:px-7 pb-32 md:pb-8">
                <div ref={listRef} className="max-w-3xl pt-4">
                    <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-muted">
                            Started {doneDayLong(round.started_at)}{round.started_by_name && ` by ${round.started_by_name}`}.
                        </p>
                        {shown.length > 0 && (
                            <button
                                type="button"
                                onClick={e => toggleAll(e.currentTarget)}
                                aria-expanded={allOpen}
                                className={`${rowButton('plain')} flex-shrink-0 inline-flex items-center gap-1.5`}
                            >
                                {/* Both words in the same place and only one
                                    showing, so the button is the width of the
                                    longer one whichever it says. */}
                                <span className="grid">
                                    <span className={`col-start-1 row-start-1 ${allOpen ? 'invisible' : ''}`}>Expand all</span>
                                    <span className={`col-start-1 row-start-1 ${allOpen ? '' : 'invisible'}`}>Collapse all</span>
                                </span>
                                <Chevron open={allOpen} />
                            </button>
                        )}
                    </div>
                    {!open && (
                        <Notice tone={outcome === 'finished' ? 'good' : 'warn'} className="mt-3">
                            {outcome === 'finished'
                                ? `Finished ${stampDateTime(round.ended_at)}. Everything on the list was done.`
                                : `Ended ${stampDateTime(round.ended_at)}${round.ended_by_name ? ` by ${round.ended_by_name}` : ''} with ${all.length - done} not done.`}
                            {' '}Nothing on it can be changed now.
                        </Notice>
                    )}
                    {urgent.length > 0 && (
                        <div className="mt-4 rounded-xl border-2 border-red-300 bg-red-50 p-4" role="note">
                            <div className="flex items-center justify-between gap-3">
                                <p className="font-semibold text-red-900">High priority</p>
                                <span className={`${badge} bg-red-700 text-white`}>{urgent.length}</span>
                            </div>
                            <p className="text-sm text-red-900 mt-1">
                                {bothKinds
                                    ? 'Do these first.'
                                    : fromLastTime
                                        ? `${urgent.length === 1 ? 'This was' : 'These were'} not done last time, so do ${urgent.length === 1 ? 'it' : 'them'} first.`
                                        : `${urgent.length === 1 ? 'This is' : 'These are'} always high priority on this list, so do ${urgent.length === 1 ? 'it' : 'them'} first.`}
                                {fromLastTime > 0 && before.round?.ended_by_name && ` ${before.round.ended_by_name} ended the last round on ${doneDayLong(before.round.ended_at)}.`}
                            </p>
                            <ul className="mt-2 space-y-1.5">
                                {urgent.map(t => (
                                    <li key={t.id}>
                                        <button type="button" onClick={() => jumpTo(t.id)} className="text-left text-sm font-semibold text-red-900 underline underline-offset-2 decoration-red-300 hover:decoration-red-700">
                                            {where.get(t.id)?.label}
                                        </button>
                                        <span className="block text-xs text-red-800">
                                            {where.get(t.id)?.category}
                                            {/* Only said when both kinds are in the box. */}
                                            {bothKinds && (lastTime.has(t.id) ? ' · Not done last time' : ' · Always high priority')}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {open && (
                        <p className={hintClass}>
                            Each tick is saved as soon as you make it. A mis-tap can be undone for {TAKE_BACK_MINUTES} minutes.
                            {!photosRequired && ' Photos are not needed on this list for now.'}
                        </p>
                    )}

                    {all.length === 0 && (
                        <p className="text-sm text-muted mt-6">There is nothing on this list yet.</p>
                    )}

                    {/* The row handlers read what waits on this phone through
                        change(), and only when tapped, never while drawing.
                        The rule cannot see that through the props object. */}
                    {/* eslint-disable-next-line react-hooks/refs */}
                    {tree.map(({ category, elements }) => {
                        if (!elements.length) return null
                        const leaves = elements.flatMap(e => (e.subs.length ? e.subs : [e.task]))
                        const catDone = leaves.filter(t => byTask.has(t.id)).length
                        const isOpen = openCats.has(category.id)
                        const urgentHere = urgentIn.get(category.id) || 0
                        return (
                            <section key={category.id} id={`cat-${category.id}`} data-place className={isOpen ? 'pt-5' : 'pt-3'}>
                                {/* Under the counting bar on a phone: the back
                                    button's 44px, its padding and the progress
                                    strip. The whole bar opens and closes it. */}
                                <h2 className="sticky top-[4.5rem] md:top-0 z-10 mb-2 rounded-lg bg-sidebar shadow-md">
                                    <button
                                        type="button"
                                        onClick={e => toggleCategory(category.id, e.currentTarget.parentElement)}
                                        aria-expanded={isOpen}
                                        className="w-full min-h-[44px] px-3 py-2.5 flex items-center justify-between gap-3 text-left rounded-lg
                                            focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                    >
                                        <span className="flex items-center gap-2 min-w-0 text-white">
                                            <Chevron open={isOpen} />
                                            <span className="font-serif text-base font-bold break-words">{category.name}</span>
                                        </span>
                                        <span className="flex items-center gap-1.5 flex-shrink-0">
                                            {/* A closed category still says it holds
                                                something to do first. */}
                                            {urgentHere > 0 && (
                                                <span className={`${badge} bg-red-700 text-white`}>{urgentHere} high priority</span>
                                            )}
                                            <span className={`${badge} bg-white/20 text-white`}>{catDone}/{leaves.length}</span>
                                        </span>
                                    </button>
                                </h2>
                                {isOpen && (
                                    <div className={`${card} overflow-hidden divide-y divide-border`}>
                                        {elements.map(element => {
                                            const { task, subs } = element
                                            const rowProps = t => ({
                                                key: t.id, task: t, tick: byTask.get(t.id), draft: pending[t.id], lastDone: lastDone.get(t.id),
                                                open, restaurantId: round.restaurant_id, roundId: round.id,
                                                needsPhoto: needsPhoto(t), saving: saving.has(t.id),
                                                canTakeBack: byTask.has(t.id) && canTakeBack(byTask.get(t.id)),
                                                onTakeBack: () => takeBack(byTask.get(t.id)),
                                                onToggle: () => toggle(t), onAddPhoto: path => addPhoto(t, path),
                                                onRemovePhoto: path => removePhoto(t, path), onError: setError,
                                                urgent: open && isUrgent(t),
                                            })
                                            if (!subs.length) return <TickRow {...rowProps(task)} />
                                            const subDone = subs.filter(s => byTask.has(s.id)).length
                                            const complete = elementDone(element, new Set(byTask.keys()))
                                            return (
                                                <div key={task.id} id={`group-${task.id}`} data-place className={complete ? 'bg-green-50/60' : ''}>
                                                    <div className="px-4 pt-3 pb-1">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <p className="font-semibold text-gray-900">
                                                                {open && marked.has(task.id) && !complete && (
                                                                    <span className={`${badge} bg-red-700 text-white mb-1 block w-fit`}>High priority</span>
                                                                )}
                                                                {task.name}
                                                            </p>
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
                                )}
                            </section>
                        )
                    })}

                    {isManager && open && (
                        <div className="mt-8 pt-4 border-t border-border flex flex-wrap gap-2">
                            {saved.length === 0
                                ? <button type="button" onClick={deleteRound} className={rowButton('danger')}>Delete this round</button>
                                : <button type="button" onClick={endEarly} disabled={busy} className={rowButton('danger')}>End this round now</button>}
                            <p className={`${hintClass} basis-full`}>
                                {saved.length === 0
                                    ? 'For a round started by mistake. Only a manager can do this.'
                                    : 'Ends it with what is left marked as not done, and that comes back as High priority next time. Only a manager can do this.'}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* What went wrong, or what is still waiting, shows here at the
                bottom rather than at the top: the page holds its place, so
                anything at the top would be out of sight. */}
            {((open && waiting.length > 0) || notice || error) && (
                <div className="flex-shrink-0 sticky bottom-0 md:static z-20 bg-white border-t border-border shadow-[0_-4px_12px_rgba(0,0,0,0.08)] px-4 md:px-7 py-3">
                    <div className="max-w-3xl">
                        <ErrorBanner>{error}</ErrorBanner>
                        {!error && <Notice tone="good">{notice}</Notice>}
                        {open && waiting.length > 0 && (
                            <div className={`flex items-center gap-3 ${error || notice ? 'mt-3' : ''}`}>
                                <p className="text-sm text-gray-700 flex-1 min-w-0">
                                    {waiting.length === 1 ? '1 tick' : `${waiting.length} ticks`} not saved yet.
                                    {' '}{saving.size ? 'Saving...' : 'Tried again by itself.'}
                                </p>
                                <button type="button" onClick={() => save()} disabled={saving.size > 0} className={primaryButton('lg')}>
                                    Try again
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// The arrow on a heading or button that opens and closes: down when closed,
// up when open, the same as a dialog's sections (ModalSectionBar).
function Chevron({ open }) {
    return (
        <svg
            className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true"
        >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
    )
}

// One thing to tick. The whole name is the label, so a thumb landing anywhere
// on the words ticks it rather than having to find the box.
function TickRow({
    task, tick, draft, lastDone, open, urgent, restaurantId, roundId, needsPhoto, saving,
    canTakeBack, onTakeBack, onToggle, onAddPhoto, onRemovePhoto, onError,
}) {
    const photos = draft?.photos || []
    const waiting = isTick(draft)
    const needsOne = needsPhoto && !tick && !photos.length
    const inputId = `tick-${task.id}`

    return (
        <div
            id={`row-${task.id}`}
            data-place
            className={`flex items-start gap-3 px-4 py-3 min-h-[56px] scroll-mt-32 ${tick ? 'bg-green-50' : urgent ? 'bg-red-50 shadow-[inset_4px_0_0_#b91c1c]' : waiting ? 'bg-accent-light/50' : ''}`}
        >
            {/* A saved tick is a solid green mark rather than a box. A
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
                checked={Boolean(tick) || waiting}
                disabled={!open || Boolean(tick) || saving || (needsPhoto && !photos.length)}
                onChange={onToggle}
            />
            <div className="flex-1 min-w-0">
                {urgent && <span className={`${badge} bg-red-700 text-white mb-1`}>High priority</span>}
                <label htmlFor={inputId} className="block font-medium text-gray-900 cursor-pointer">{task.name}</label>
                {task.how_to && <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-line">{task.how_to}</p>}
                {task.guide_photos?.length > 0 && <GuidePicture paths={task.guide_photos} name={task.name} />}

                {tick ? (
                    <p className="text-xs text-green-900 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>Done by {tick.done_by_name}, {stampDateTime(tick.done_at)}</span>
                        {canTakeBack && (
                            <button type="button" onClick={onTakeBack} className="inline-flex items-center min-h-[36px] px-2 -mx-2 -my-2 font-semibold underline underline-offset-2 text-green-900 hover:text-green-700">
                                Undo
                            </button>
                        )}
                    </p>
                ) : waiting ? (
                    <p className="text-xs text-accent-ink font-semibold mt-1.5">
                        {saving ? 'Saving...' : 'Not saved yet. It is tried again by itself.'}
                    </p>
                ) : photos.length ? (
                    <p className="text-xs text-accent-ink font-semibold mt-1.5">Photo added. Tick it to save it.</p>
                ) : (
                    <p className="text-xs text-muted mt-1.5">
                        {lastDone ? `Last done ${doneDay(lastDone)}` : 'Not done before'}
                        {!open && ' · Not done this round'}
                    </p>
                )}

                {tick && <PhotoStrip paths={tick.photos || []} gone={Boolean(tick.photos_gone_at)} />}
                {!tick && <PhotoStrip paths={photos} onRemove={open && !waiting ? onRemovePhoto : undefined} />}

                {/* Offered on a task marked for a photo even when the list
                    says photos are not needed for now, just not asked for. */}
                {open && !tick && !waiting && task.needs_photo && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <PhotoButton
                            restaurantId={restaurantId}
                            folder={roundId}
                            room={4 - photos.length}
                            onAdded={onAddPhoto}
                            onError={onError}
                        >
                            {photos.length ? 'Add another photo' : needsPhoto ? 'Take photo' : 'Add photo (optional)'}
                        </PhotoButton>
                        {needsOne && <span className="text-xs text-amber-800">Needs a photo before it can be ticked.</span>}
                    </div>
                )}
            </div>
        </div>
    )
}

// The categories open on this tab, if it kept any.
function readOpen(key) {
    try {
        const kept = JSON.parse(readStored('session', key) || '[]')
        return new Set(Array.isArray(kept) ? kept : [])
    } catch {
        // Not a list. Everything starts closed.
        return new Set()
    }
}

// Ticks this phone has not saved yet, and photos taken for a task not ticked
// yet, if it kept any.
function readDraft(key) {
    try {
        const kept = JSON.parse(readStored('local', key) || '{}')
        return kept && typeof kept === 'object' ? kept : {}
    } catch {
        // What was kept is not a draft. Starts empty.
        return {}
    }
}
