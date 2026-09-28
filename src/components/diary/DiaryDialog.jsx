import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import ClockField from '@/components/ui/ClockField'
import AutoTextarea from '@/components/ui/AutoTextarea'
import ErrorBanner from '@/components/ui/ErrorBanner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useConfirm } from '@/context/confirm'
import { friendlyError } from '@/lib/errors'
import {
    modalFooter, secondaryButton, primaryButton, rowButton,
    labelClass, fieldClass, dateField, hintClass,
} from '@/lib/controlStyles'
import {
    KINDS, kindLabel, kindTag, scopeFrom, entryProblem, cleanLabels, labelsUsed,
} from '@/lib/diary'
import { writeToGoogle } from '@/lib/diaryGoogle'

// Putting something in the diary.
//
// The whole point of this screen is that the date is a field rather than a
// place you had to navigate to. The old way of recording a catering job was to
// open the roster, find the week, find the day and open its cell, which is four
// decisions before you have typed anything, and you cannot do any of them
// standing in a corridor with the email open.
//
// Four answers save it: what kind, a name, a date, and where it goes.
// Everything else can be filled in later, because the moment worth capturing is
// the one where you have half the information and no time.

// The five answers to "goes on", and only two of them are the same shape.
//
// The restaurants are ticks and the list grows on its own as restaurants are
// added, so a meeting with two out of five is as easy to say as a meeting with
// two out of two. The first draft of this offered "both", which quietly assumed
// there would only ever be two.
//
// All sites and Just me are not shortcuts for ticking everything. All sites
// goes to the group's own calendar and Just me goes nowhere at all, so choosing
// either one clears the ticks rather than standing in for them.
function GoesOn({ mode, restaurantIds, restaurants, onChange }) {
    const ticked = new Set(restaurantIds)

    function toggle(id) {
        const next = new Set(ticked)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        onChange({ mode: 'sites', restaurantIds: [...next] })
    }

    return (
        <div className="border border-border rounded-lg p-3 bg-app-bg">
            {restaurants.map(r => (
                <label key={r.id} className="flex items-start gap-2.5 py-1.5 cursor-pointer">
                    <input
                        type="checkbox"
                        className="w-5 h-5 flex-shrink-0 mt-0.5 accent-accent cursor-pointer"
                        checked={mode === 'sites' && ticked.has(r.id)}
                        onChange={() => toggle(r.id)}
                    />
                    <span className="text-sm text-gray-800">{r.name}</span>
                </label>
            ))}

            <div className="border-t border-dashed border-border my-2" />

            {[
                { value: 'all_sites', label: 'All sites, the whole group' },
                { value: 'private', label: 'Just me. Nobody else sees it' },
            ].map(one => (
                <label key={one.value} className="flex items-start gap-2.5 py-1.5 cursor-pointer">
                    <input
                        type="radio"
                        name="diary-goes-on"
                        className="w-5 h-5 flex-shrink-0 mt-0.5 accent-accent cursor-pointer"
                        checked={mode === one.value}
                        onChange={() => onChange({ mode: one.value, restaurantIds: [] })}
                    />
                    <span className="text-sm text-gray-800">{one.label}</span>
                </label>
            ))}
        </div>
    )
}

// What is about to happen, said before it happens.
//
// Nothing about the Google side should be a surprise, and the one thing worth
// knowing is which calendar it lands on. A restaurant with no calendar id set
// says so rather than saying nothing, because an entry quietly staying in the
// Hub looks exactly like one that went out.
function WhatHappens({ mode, restaurantIds, restaurants }) {
    if (mode === 'private') {
        return 'Stays in the Hub. It is not written to any calendar and nobody else can see it.'
    }
    if (mode === 'all_sites') {
        return 'Goes on the Papi Chulo All Sites calendar, and on every roster.'
    }

    const picked = restaurants.filter(r => restaurantIds.includes(r.id))
    if (!picked.length) return 'Tick the restaurants it is for.'

    const names = picked.map(r => r.name).join(' and ')
    const without = picked.filter(r => !r.google_calendar_id)

    if (without.length === picked.length) {
        return `Goes on the ${names} roster. No Google calendar is set up for it yet, so it stays in the Hub.`
    }
    if (without.length) {
        return `Goes on the ${names} rosters and calendars, except ${without.map(r => r.name).join(' and ')}, which has no calendar set up yet.`
    }
    return `Goes on the ${names} Google calendar, and on the ${names} roster.`
}

function startingForm(entry, date, restaurants, fallbackRestaurantId) {
    if (entry) {
        return {
            kind: entry.kind,
            title: entry.title || '',
            starts_on: entry.starts_on,
            ends_on: entry.ends_on || '',
            starts_at: entry.starts_at ? String(entry.starts_at).slice(0, 5) : '',
            ends_at: entry.ends_at ? String(entry.ends_at).slice(0, 5) : '',
            location: entry.location || '',
            contact_name: entry.contact_name || '',
            contact_detail: entry.contact_detail || '',
            note: entry.note || '',
            status: entry.status || 'confirmed',
            labels: entry.labels || [],
            mode: entry.scope === 'sites' ? 'sites' : entry.scope,
            restaurantIds: entry.restaurant_ids || [],
        }
    }

    // A new one lands on the restaurant you are looking at, because that is
    // what you meant nine times in ten and the tick is there to say otherwise.
    const mine = restaurants.some(r => r.id === fallbackRestaurantId) ? [fallbackRestaurantId] : []

    return {
        kind: 'catering',
        title: '',
        starts_on: date,
        ends_on: '',
        starts_at: '',
        ends_at: '',
        location: '',
        contact_name: '',
        contact_detail: '',
        note: '',
        status: 'confirmed',
        labels: [],
        mode: 'sites',
        restaurantIds: mine,
    }
}

export default function DiaryDialog({ entry, date, restaurants, onClose, onSaved }) {
    const { user } = useAuth()
    const confirm = useConfirm()

    const [form, setForm] = useState(
        () => startingForm(entry, date, restaurants, user?.restaurant_id),
    )
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    // Whatever has been used before, offered as chips.
    //
    // Read off the entries themselves rather than a list somebody maintains,
    // so typing Students once offers it forever after, at both restaurants,
    // with nothing to set up and nothing to keep in step. One small query when
    // the form opens: the column is an array of short words and there are not
    // many of them.
    const [known, setKnown] = useState([])
    const [adding, setAdding] = useState('')

    useEffect(() => {
        let alive = true
        supabase.from('diary_entries').select('labels').then(({ data }) => {
            if (alive) setKnown(labelsUsed(data))
        })
        return () => { alive = false }
    }, [])

    const has = label => form.labels.some(l => l.toLowerCase() === label.toLowerCase())
    const toggleLabel = label => set('labels', has(label)
        ? form.labels.filter(l => l.toLowerCase() !== label.toLowerCase())
        : cleanLabels([...form.labels, label]))

    function addLabel() {
        const label = adding.trim()
        if (!label) return
        setAdding('')
        set('labels', cleanLabels([...form.labels, label]))
    }

    const set = (key, value) => setForm(f => ({ ...f, [key]: value }))
    const problem = entryProblem(form)

    async function save() {
        if (problem) return
        setSaving(true)
        setError('')

        const row = {
            ...scopeFrom(form),
            kind: form.kind,
            title: form.title.trim(),
            starts_on: form.starts_on,
            ends_on: form.ends_on || null,
            starts_at: form.starts_at || null,
            ends_at: form.starts_at ? (form.ends_at || null) : null,
            location: form.location.trim() || null,
            contact_name: form.contact_name.trim() || null,
            contact_detail: form.contact_detail.trim() || null,
            note: form.note.trim() || null,
            status: form.status,
            labels: cleanLabels(form.labels),
        }

        const { data, error: err } = entry
            ? await supabase.from('diary_entries').update(row).eq('id', entry.id).select().single()
            : await supabase.from('diary_entries')
                .insert({ ...row, created_by: user?.id }).select().single()

        if (err) {
            setError(friendlyError(err))
            setSaving(false)
            return
        }

        // The row is saved either way. A calendar that refuses is reported, not
        // hidden: an entry that quietly stayed in the Hub looks exactly like one
        // that went out, and the list says which it was.
        const went = await writeToGoogle(data.id)
        if (!went.ok && went.reason) {
            setError(`Saved, but it did not reach Google. ${went.reason}`)
            setSaving(false)
            return
        }

        onSaved(data)
    }

    async function remove() {
        const yes = await confirm({
            title: 'Take this out of the diary?',
            message: `${form.title} will be removed from the calendar, from the roster, and from Google.`,
            confirmLabel: 'Take it out',
            tone: 'danger',
        })
        if (!yes) return

        setSaving(true)

        // Off the calendars first, while the row is still here to say which ones
        // it is on. Once it is deleted nothing knows, and the events would sit
        // there forever saying something that is no longer true.
        const cleared = await writeToGoogle(entry.id, { clear: true })
        if (!cleared.ok && cleared.reason) {
            setError(`It is still in Google and could not be taken off. ${cleared.reason}`)
            setSaving(false)
            return
        }

        const { error: err } = await supabase.from('diary_entries').delete().eq('id', entry.id)
        if (err) {
            setError(friendlyError(err))
            setSaving(false)
            return
        }
        onSaved(null)
    }

    return (
        <Modal title={entry ? 'Edit this' : 'Add to the calendar'} onClose={onClose}>
            <div className="px-6 py-4 space-y-4">
                {error && <ErrorBanner>{error}</ErrorBanner>}

                <div>
                    <span className={labelClass}>What is it</span>
                    <div className="flex flex-wrap gap-2">
                        {KINDS.map(kind => (
                            <button
                                key={kind}
                                type="button"
                                onClick={() => set('kind', kind)}
                                aria-pressed={form.kind === kind}
                                className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                                    form.kind === kind
                                        ? `${kindTag(kind)} border-transparent ring-2 ring-inset ring-current`
                                        : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                                }`}
                            >
                                {kindLabel(kind)}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className={labelClass} htmlFor="diary-title">Name</label>
                    <input
                        id="diary-title"
                        className={fieldClass}
                        value={form.title}
                        onChange={e => set('title', e.target.value)}
                    />
                </div>

                <div>
                    <span className={labelClass}>When</span>
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            type="date"
                            className={dateField}
                            value={form.starts_on}
                            onChange={e => set('starts_on', e.target.value)}
                            aria-label="The day it starts"
                        />
                        <span className="text-sm text-muted font-semibold">to</span>
                        <input
                            type="date"
                            className={dateField}
                            value={form.ends_on}
                            min={form.starts_on}
                            onChange={e => set('ends_on', e.target.value)}
                            aria-label="The day it finishes, if it runs on"
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-2">
                        <ClockField
                            value={form.starts_at}
                            onChange={v => set('starts_at', v)}
                            compact
                            aria-label="The time it starts"
                        />
                        <span className="text-sm text-muted font-semibold">to</span>
                        <ClockField
                            value={form.ends_at}
                            onChange={v => set('ends_at', v)}
                            compact
                            aria-label="The time it finishes"
                            disabled={!form.starts_at}
                        />
                    </div>
                    <p className={hintClass}>
                        Leave the times empty for something that runs all day, like a discount week.
                    </p>
                </div>

                <div>
                    <span className={labelClass}>Goes on</span>
                    <GoesOn
                        mode={form.mode}
                        restaurantIds={form.restaurantIds}
                        restaurants={restaurants}
                        onChange={next => setForm(f => ({ ...f, ...next }))}
                    />
                    <p className={hintClass}>
                        <WhatHappens
                            mode={form.mode}
                            restaurantIds={form.restaurantIds}
                            restaurants={restaurants}
                        />
                    </p>
                </div>

                <div>
                    <span className={labelClass}>
                        Labels <span className="text-muted font-normal">optional</span>
                    </span>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                        {[...new Set([...form.labels, ...known])].map(label => (
                            <button
                                key={label}
                                type="button"
                                onClick={() => toggleLabel(label)}
                                aria-pressed={has(label)}
                                className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                                    has(label)
                                        ? 'bg-sidebar border-sidebar text-white'
                                        : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <input
                            className={fieldClass}
                            value={adding}
                            onChange={e => setAdding(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLabel() } }}
                            placeholder="Students"
                            aria-label="A new label"
                        />
                        <button
                            type="button"
                            onClick={addLabel}
                            disabled={!adding.trim()}
                            className={secondaryButton}
                        >
                            Add
                        </button>
                    </div>
                    <p className={hintClass}>
                        Who or what it is for. Anything typed here is offered next time, so the
                        same word gets used rather than four spellings of it.
                    </p>
                </div>

                <div>
                    <label className={labelClass} htmlFor="diary-where">
                        Where <span className="text-muted font-normal">optional</span>
                    </label>
                    <input
                        id="diary-where"
                        className={fieldClass}
                        value={form.location}
                        onChange={e => set('location', e.target.value)}
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className={labelClass} htmlFor="diary-contact">
                            Who to contact <span className="text-muted font-normal">optional</span>
                        </label>
                        <input
                            id="diary-contact"
                            className={fieldClass}
                            value={form.contact_name}
                            onChange={e => set('contact_name', e.target.value)}
                        />
                    </div>
                    <div>
                        <label className={labelClass} htmlFor="diary-contact-detail">
                            Phone or email <span className="text-muted font-normal">optional</span>
                        </label>
                        <input
                            id="diary-contact-detail"
                            className={fieldClass}
                            value={form.contact_detail}
                            onChange={e => set('contact_detail', e.target.value)}
                        />
                    </div>
                </div>

                <div>
                    <label className={labelClass} htmlFor="diary-note">
                        Anything else <span className="text-muted font-normal">optional</span>
                    </label>
                    <AutoTextarea
                        id="diary-note"
                        className={fieldClass}
                        value={form.note}
                        onChange={e => set('note', e.target.value)}
                    />
                </div>

                <div>
                    <label className={labelClass} htmlFor="diary-status">How sure is it</label>
                    <select
                        id="diary-status"
                        className={fieldClass}
                        value={form.status}
                        onChange={e => set('status', e.target.value)}
                    >
                        <option value="enquiry">An enquiry, not confirmed yet</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="done">Done</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                    <p className={hintClass}>
                        A cancelled one stays here but comes off the roster, because knowing it was
                        cancelled is not the same as it never existing.
                    </p>
                </div>
            </div>

            <div className={modalFooter}>
                {entry && (
                    <button type="button" onClick={remove} disabled={saving} className={`${rowButton('danger')} mr-auto`}>
                        Take it out
                    </button>
                )}
                <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                <button
                    type="button"
                    onClick={save}
                    disabled={saving || Boolean(problem)}
                    title={problem || undefined}
                    className={primaryButton()}
                >
                    {saving ? 'Saving...' : 'Save'}
                </button>
            </div>

            {problem && (
                <p className="px-6 pb-4 -mt-2 text-xs text-muted text-right">{problem}</p>
            )}
        </Modal>
    )
}
