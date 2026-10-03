import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useRestaurant } from '@/context/restaurant'
import { can, MANAGERS } from '@/lib/access'
import { addDays, todayISO } from '@/lib/dates'
import { friendlyError } from '@/lib/errors'
import { badge, card, inactiveBadge, primaryButton, rowButton, secondaryButton } from '@/lib/controlStyles'
import {
    agoWords, cardState, doneDayLong, leftLastTime, listTree, periodWords, progressOf, repeatWords, roundBefore,
} from '@/lib/checklists'
import ErrorBanner from '@/components/ui/ErrorBanner'
import PageHeader from '@/components/ui/PageHeader'
import AddButton from '@/components/ui/AddButton'
import ShowInactiveButton from '@/components/ui/ShowInactiveButton'
import PrintListButton from '@/components/checklists/PrintListButton'

// The way in to the checklists, for everybody.
//
// Drawn from the Kitchtech screen he sent: each list with where it is up to
// and one button, Continue while a round is open and Start when it is not.
// Kitchtech greys out Add New while a round is open; here the button simply
// says Continue, because a greyed out button asks the question of why without
// answering it.
//
// A list done this week (or this month) still offers Start again, quieter, for
// the week somebody wants a second go. A list done once has one round and no
// more.
export default function ChecklistsPage() {
    const navigate = useNavigate()
    const { user } = useAuth()
    const { activeRestaurant } = useRestaurant()
    const isManager = can(user, MANAGERS)

    const [lists, setLists] = useState([])
    const [trees, setTrees] = useState({})
    const [rounds, setRounds] = useState([])
    const [openTicks, setOpenTicks] = useState([])
    const [sources, setSources] = useState({})
    const [showOff, setShowOff] = useState(false)
    const [loading, setLoading] = useState(true)
    const [starting, setStarting] = useState(null)
    const [error, setError] = useState('')

    const load = useCallback(async () => {
        if (!activeRestaurant) return
        setError('')
        const { data: rows, error: listErr } = await supabase
            .from('checklists').select('*')
            .eq('restaurant_id', activeRestaurant.id)
            .order('sort_order').order('name')
        if (listErr) { setError(friendlyError(listErr)); setLoading(false); return }

        const ids = rows.map(l => l.id)
        // Rounds that are open, and the ones that ended in the last four
        // months, which is enough to say when a monthly list was last done.
        const since = addDays(todayISO(), -124)
        const [cats, tasks, rnds] = await Promise.all([
            ids.length ? supabase.from('checklist_categories').select('*').in('checklist_id', ids) : { data: [] },
            ids.length ? supabase.from('checklist_tasks').select('id, checklist_id, category_id, parent_id, name, sort_order, is_active, created_at').in('checklist_id', ids) : { data: [] },
            supabase.from('checklist_rounds').select('*')
                .eq('restaurant_id', activeRestaurant.id)
                .or(`ended_at.is.null,ended_at.gte.${since}`),
        ])
        const failed = cats.error || tasks.error || rnds.error
        if (failed) { setError(friendlyError(failed)); setLoading(false); return }

        // The round each list's High priority comes from: the one before the
        // open round, or the last one if nothing is open. Only a round a
        // manager ended early leaves anything behind.
        const everyRound = rnds.data || []
        const openRounds = everyRound.filter(r => !r.ended_at)
        const from = {}
        for (const l of rows) {
            const openNow = openRounds.find(r => r.checklist_id === l.id)
            const before = roundBefore(everyRound, openNow || { checklist_id: l.id, id: null, started_at: new Date().toISOString() })
            if (before?.ended_by) from[l.id] = before
        }
        const wanted = [...openRounds.map(r => r.id), ...Object.values(from).map(r => r.id)]
        const ticks = wanted.length
            ? await supabase.from('checklist_ticks').select('round_id, task_id, done_at').in('round_id', wanted)
            : { data: [] }

        const byList = {}
        for (const l of rows) {
            byList[l.id] = listTree(
                (cats.data || []).filter(c => c.checklist_id === l.id),
                (tasks.data || []).filter(t => t.checklist_id === l.id),
            )
        }
        setLists(rows)
        setTrees(byList)
        setRounds(rnds.data || [])
        setOpenTicks(ticks.data || [])
        setSources(from)
        setLoading(false)
    }, [activeRestaurant])

    useEffect(() => {
        // The same trade the stock take list makes: one extra render, rather
        // than the last restaurant's lists showing under the new one's name.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load()
    }, [load])

    // Somebody else may have started it a moment ago, which the database
    // refuses as a second open round. Either way this lands on the one that
    // is open.
    async function start(list) {
        setStarting(list.id)
        setError('')
        const { data, error: startErr } = await supabase
            .from('checklist_rounds').insert({ checklist_id: list.id, restaurant_id: activeRestaurant.id })
            .select('id').single()
        if (!startErr) { navigate(`/checklists/rounds/${data.id}`); return }
        if (startErr.code === '23505') {
            const { data: open } = await supabase.from('checklist_rounds').select('id')
                .eq('checklist_id', list.id).is('ended_at', null).maybeSingle()
            if (open) { navigate(`/checklists/rounds/${open.id}`); return }
        }
        setStarting(null)
        setError(friendlyError(startErr))
    }

    if (!activeRestaurant) return <p className="text-sm text-muted">Select a restaurant to see its checklists.</p>
    if (loading) return <p className="text-sm text-muted">Loading checklists...</p>

    const today = todayISO()
    const shown = lists.filter(l => l.is_active || showOff)
    const hidden = lists.filter(l => !l.is_active).length

    return (
        <>
            <PageHeader
                title="Checklists"
                subtitle={`${activeRestaurant.name} · tick things off as you go, then press Submit.`}
            >
                {isManager && (
                    <>
                        <button type="button" onClick={() => navigate('/checklists/report')} className={secondaryButton}>
                            Reports
                        </button>
                        <AddButton onClick={() => navigate('/checklists/new')}>New list</AddButton>
                    </>
                )}
            </PageHeader>

            <ErrorBanner className="mb-4">{error}</ErrorBanner>

            {shown.length === 0 ? (
                <div className={`${card} p-10 text-center`}>
                    <h2 className="font-serif text-lg font-bold text-gray-900 mb-2">No checklists yet</h2>
                    <p className="text-sm text-muted max-w-sm mx-auto">
                        {isManager
                            ? 'Make a list, like a weekly deep clean, and everybody here will see it on their phone.'
                            : 'A manager needs to set a list up before there is anything to tick.'}
                    </p>
                    {isManager && (
                        <button type="button" onClick={() => navigate('/checklists/new')} className={`${primaryButton('lg')} mt-5`}>
                            Make the first list
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {shown.map(list => {
                        const openRound = rounds.find(r => r.checklist_id === list.id && !r.ended_at)
                        const ticks = openRound ? openTicks.filter(t => t.round_id === openRound.id) : []
                        const { done, total } = progressOf(trees[list.id] || [], ticks)
                        const lastTick = ticks.reduce((best, t) => (!best || new Date(t.done_at) > new Date(best) ? t.done_at : best), null)
                        const ticked = new Set(ticks.map(t => t.task_id))
                        const priority = [...leftLastTime(trees[list.id] || [], sources[list.id], openTicks)].filter(t => !ticked.has(t)).length
                        const state = cardState({ list, rounds, done, total, lastTick, today, priority })
                        return (
                            <ListCard
                                key={list.id}
                                list={list}
                                state={state}
                                empty={total === 0}
                                starting={starting === list.id}
                                isManager={isManager}
                                restaurant={activeRestaurant}
                                onStart={() => start(list)}
                                onContinue={() => navigate(`/checklists/rounds/${state.round.id}`)}
                                onEdit={() => navigate(`/checklists/${list.id}/edit`)}
                                onError={setError}
                            />
                        )
                    })}
                </div>
            )}

            {isManager && hidden > 0 && (
                <div className="mt-6">
                    <ShowInactiveButton showing={showOff} onToggle={() => setShowOff(s => !s)} />
                </div>
            )}
        </>
    )
}

function ListCard({ list, state, empty, starting, isManager, restaurant, onStart, onContinue, onEdit, onError }) {
    const period = periodWords(list)
    const status = !list.is_active
        ? { text: 'Inactive', look: inactiveBadge }
        : state.kind === 'open'
            ? { text: 'In progress', look: `${badge} bg-accent-light text-accent-ink` }
            : state.kind === 'done'
                ? { text: period ? `Done ${period}` : 'Done', look: `${badge} bg-green-100 text-green-800` }
                : state.late
                    ? { text: 'Late', look: `${badge} bg-red-100 text-red-800` }
                    : { text: period ? `Due ${period}` : 'To do', look: `${badge} bg-amber-100 text-amber-800` }

    return (
        // One edge or the other, never both: two border colours on one element
        // is decided by the stylesheet's order, not by which is written last.
        <div className={`${state.kind === 'open' && list.is_active ? 'bg-white rounded-xl border-2 border-accent shadow-md' : card} p-4 flex flex-col`}>
            <div className="flex items-start justify-between gap-3">
                <h2 className="font-serif text-lg font-bold text-gray-900 min-w-0 break-words">{list.name}</h2>
                <span className={`${status.look} flex-shrink-0`}>{status.text}</span>
            </div>
            <p className="text-xs text-muted mt-0.5">
                {repeatWords(list)}
                {list.repeats === 'once' && list.finish_by && `, finish by ${doneDayLong(list.finish_by + 'T12:00:00')}`}
            </p>

            <div className="mt-3 text-sm text-gray-700 flex-1">
                {state.kind === 'open' && (
                    <>
                        <p><strong>{state.done}</strong> of <strong>{state.total}</strong> done</p>
                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden mt-1.5">
                            <div className="bg-accent h-full" style={{ width: state.total ? `${(state.done / state.total) * 100}%` : '0%' }} />
                        </div>
                        <p className="text-xs text-muted mt-2">
                            {state.started}
                            {state.lastTick && `. Last ticked ${agoWords(state.lastTick)}.`}
                        </p>
                    </>
                )}
                {state.kind === 'done' && (
                    <p>{state.early ? 'Ended early' : 'Finished'} on {state.when}.</p>
                )}
                {state.kind === 'due' && (
                    <p>
                        {list.repeats === 'once'
                            ? (state.canStart ? 'Not started yet.' : `Starts on ${doneDayLong(list.starts_on + 'T12:00:00')}.`)
                            : state.last ? `Last done on ${state.last}.` : 'Not done yet.'}
                    </p>
                )}
                {state.priority > 0 && list.is_active && (
                    <p className={`${badge} mt-2 border border-red-200 bg-red-50 text-red-800`}>
                        <span aria-hidden="true" className="inline-block w-2 h-2 mr-1.5 align-middle rounded-full bg-red-600" />
                        {state.priority} high priority from last time
                    </p>
                )}
                {empty && list.is_active && (
                    <p className="text-xs text-amber-800 mt-2">Nothing on this list yet{isManager ? '. Press Edit to add what needs doing.' : '.'}</p>
                )}
            </div>

            {list.is_active && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    {state.kind === 'open' && (
                        <button type="button" onClick={onContinue} className={`${primaryButton('lg')} w-full sm:w-auto`}>Continue</button>
                    )}
                    {state.kind !== 'open' && state.canStart && !empty && (
                        <button
                            type="button"
                            onClick={onStart}
                            disabled={starting}
                            className={state.kind === 'done' ? `${secondaryButton} w-full sm:w-auto` : `${primaryButton('lg')} w-full sm:w-auto`}
                        >
                            {starting ? 'Starting...' : state.kind === 'done' ? 'Start again' : 'Start'}
                        </button>
                    )}
                    {isManager && (
                        <span className="flex gap-2 sm:ml-auto">
                            <button type="button" onClick={onEdit} className={rowButton('edit')}>Edit</button>
                            <PrintListButton list={list} restaurant={restaurant} onError={onError} />
                        </span>
                    )}
                </div>
            )}
            {!list.is_active && isManager && (
                <div className="mt-4">
                    <button type="button" onClick={onEdit} className={rowButton('edit')}>Edit</button>
                </div>
            )}
        </div>
    )
}
