import { useState } from 'react'
import Modal from './Modal'
import { supabase } from '../lib/supabase'
import { useRestaurant } from '../context/RestaurantContext'
import { friendlyError } from '../lib/errors'
import { numberField } from '../lib/numberInput'
import { NOTICE_DEFAULT } from '../lib/timeOff'
import { modalFooter } from '../lib/controlStyles'
import ModalSection from './ModalSection'
import { DEFAULT_RULES } from '../lib/workRules'

// What the roster checks a week against.
//
// Two kinds of rule and they are not treated the same, which is the whole point
// of this screen rather than a list of switches.
//
// Rest, days off and the long average are about somebody being worn out. They
// warn, they never refuse, and they are off until somebody turns them on,
// because a manager sometimes knows something the roster does not and a tool
// that refuses is a tool people work around.
//
// The two at the bottom are law about the employer rather than guidance about
// the employee. Going over a student's hours or working somebody under 18 past
// ten at night is the company's problem, not theirs, so those stop the week
// going out.
//
// None of these numbers are legal advice, which is why they are settings and
// not constants. They should be checked against current guidance.
export default function RosterRulesModal({ onClose }) {
    const { activeRestaurant, setActiveRestaurant } = useRestaurant()

    const [rules, setRules] = useState(() => ({
        ...DEFAULT_RULES,
        ...(activeRestaurant?.roster_rules || {}),
    }))
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const set = (key, patch) => setRules(r => ({ ...r, [key]: { ...r[key], ...patch } }))

    async function save() {
        setSaving(true)
        setError('')

        const { data, error: err } = await supabase
            .from('restaurants')
            .update({ roster_rules: rules })
            .eq('id', activeRestaurant.id)
            .select()
            .single()

        setSaving(false)
        if (err) { setError(friendlyError(err)); return }

        setActiveRestaurant(data)
        onClose()
    }

    const numCls =
        'w-16 border border-border rounded-lg px-2 py-1.5 text-sm text-right bg-white focus:outline-none focus:ring-2 focus:ring-accent'

    const row = ({ key, title, blurb, unit, field = 'hours' }) => (
        <div key={key} className="py-3 border-b border-border last:border-b-0">
            <label className="flex items-start gap-3 cursor-pointer">
                <input
                    type="checkbox"
                    checked={!!rules[key]?.on}
                    onChange={e => set(key, { on: e.target.checked })}
                    className="w-4 h-4 mt-0.5 accent-accent flex-shrink-0"
                />
                <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-gray-900">{title}</span>
                    <span className="block text-xs text-gray-500 mt-0.5">{blurb}</span>
                </span>
            </label>
            {rules[key]?.on && (
                <div className="flex items-center gap-2 mt-2 ml-7">
                    <input
                        {...numberField({
                            value: String(rules[key][field] ?? ''),
                            onChange: v => set(key, { [field]: Number(v) || 0 }),
                        })}
                        className={numCls}
                    />
                    <span className="text-sm text-gray-500">{unit}</span>
                </div>
            )}
        </div>
    )

    return (
        <Modal title="Roster rules" onClose={onClose} width="max-w-xl">
            <div>
                {error && <p className="mx-6 mt-4 text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}

                <ModalSection
                    title="Warnings"
                    description="These say something is worth a second look. None of them stop a week going out."
                >
                <div>
                    {[
                        {
                            key: 'dailyRest',
                            title: 'Enough rest between two shifts',
                            blurb: 'Closing at eleven and opening at eight is nine hours, and it is the shift pattern people leave over. The Irish rule is eleven hours.',
                            unit: 'hours between shifts',
                        },
                        {
                            key: 'weeklyRest',
                            title: 'One long break in the week',
                            blurb: 'The Irish rule is twenty four hours in a row on top of the daily eleven, so thirty five in practice.',
                            unit: 'hours in a row, once a week',
                        },
                        {
                            key: 'daysOff',
                            title: 'Days off',
                            blurb: 'Not a legal requirement, a house rule. Two is the usual one.',
                            unit: 'days off a week',
                            field: 'count',
                        },
                        {
                            key: 'maxWeek',
                            title: 'The long term average',
                            blurb: 'Forty eight hours averaged over four months rather than a ceiling on any one week, which is what the law actually says. A single busy week is not a breach, so warning on one would cry wolf every time somebody covered a holiday.',
                            unit: 'hours a week on average',
                        },
                    ].map(row)}

                    {/* No number on this one, so it is written out rather than
                        going through the row helper above.

                        It is the only warning that starts turned on, and that is
                        safe rather than inconsistent: it can never say anything
                        about somebody with no availability recorded, and nobody
                        has any until it is typed in. A restaurant that never
                        uses it never hears from it. */}
                    <div className="py-3 border-t border-border">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={!!rules.availability?.on}
                                onChange={e => set('availability', { on: e.target.checked })}
                                className="w-4 h-4 mt-0.5 accent-accent flex-shrink-0"
                            />
                            <span>
                                <span className="block text-sm font-medium text-gray-900">
                                    When somebody said they can work
                                </span>
                                <span className="block text-xs text-gray-500 mt-0.5">
                                    Says so when a shift lands on a day or at an hour somebody said they
                                    cannot do. Only ever about people with availability set on the team
                                    list, and it never holds a week back: if you know something the roster
                                    does not, roster it.
                                </span>
                            </span>
                        </label>
                    </div>

                    <div className="py-3 border-t border-border">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={!!rules.timeOff?.on}
                                onChange={e => set('timeOff', { on: e.target.checked })}
                                className="w-4 h-4 mt-0.5 accent-accent flex-shrink-0"
                            />
                            <span>
                                <span className="block text-sm font-medium text-gray-900">
                                    Days somebody is down as away
                                </span>
                                <span className="block text-xs text-gray-500 mt-0.5">
                                    Holidays, days off, sick, anything on their time off. Like the one above
                                    it, it starts on and can only ever say something about a day somebody has
                                    actually been marked away for. Somebody back early from a holiday or
                                    coming in for one shift is a real thing, so it says it and lets you get
                                    on with it.
                                </span>
                            </span>
                        </label>
                    </div>
                </div>
                </ModalSection>

                <ModalSection
                    title="Time off"
                    description="How far ahead somebody should ask for a holiday. A day off and part of a day are not covered: something coming up next week is the ordinary case."
                >
                <div className="py-1">
                    <div className="flex items-center gap-2">
                        <input
                            {...numberField({
                                value: String(rules.holidayNoticeDays ?? NOTICE_DEFAULT),
                                onChange: v => setRules(r => ({ ...r, holidayNoticeDays: Number(v) || 0 })),
                            })}
                            className={numCls}
                        />
                        <span className="text-sm text-gray-500">days' notice for a holiday</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Set it to 0 and no notice is asked for.</p>

                    <label className="flex items-start gap-3 cursor-pointer mt-3 pt-3 border-t border-border">
                        <input
                            type="checkbox"
                            checked={rules.holidayNoticeBlocks === true}
                            onChange={e => setRules(r => ({ ...r, holidayNoticeBlocks: e.target.checked }))}
                            className="w-4 h-4 mt-0.5 accent-accent flex-shrink-0"
                        />
                        <span className="flex-1 min-w-0">
                            <span className="block text-sm font-medium text-gray-900">
                                Do not let anyone send a request with less notice than this
                            </span>
                            <span className="block text-xs text-gray-500 mt-0.5">
                                Off, they are warned and can send it anyway. On, they cannot send it at all.
                                Either way you see the short notice on the request before you answer it.
                            </span>
                        </span>
                    </label>
                </div>
                </ModalSection>

                <ModalSection
                    title="Stops a week going out"
                    description="These two are the law about the employer rather than guidance about the employee. Going over them is the company's problem and not the person's, so they hold the week until something is changed."
                >

                <div>
                    <div className="py-3 border-b border-border">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={!!rules.visaCap?.on}
                                onChange={e => set('visaCap', { on: e.target.checked })}
                                className="w-4 h-4 mt-0.5 accent-accent flex-shrink-0"
                            />
                            <span>
                                <span className="block text-sm font-medium text-gray-900">
                                    Hours allowed by somebody's permission
                                </span>
                                <span className="block text-xs text-gray-500 mt-0.5">
                                    A student on Stamp 2 may work twenty hours a week in term time and forty
                                    during the holiday periods. Only applies to people whose permission has
                                    been recorded on the team list.
                                </span>
                            </span>
                        </label>

                        {/* The number itself is not editable, and that is
                            deliberate. It is a legal ceiling rather than a
                            preference, and a limit you can type over is not a
                            limit. What a restaurant can decide is whether going
                            over it holds the week or only says so. */}
                        {rules.visaCap?.on && (
                            <div className="ml-7 mt-2">
                                <select
                                    value={rules.visaCap.blocks === false ? 'warn' : 'block'}
                                    onChange={e => set('visaCap', { blocks: e.target.value === 'block' })}
                                    className="w-full sm:w-auto border border-border rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent"
                                >
                                    <option value="block">Hold the week back until it is fixed</option>
                                    <option value="warn">Say it, but let the week go out</option>
                                </select>
                                {rules.visaCap.blocks === false && (
                                    <p className="text-xs text-amber-700 mt-1.5">
                                        Going over is the company's offence rather than the person's, so this
                                        will keep saying it every week rather than going quiet.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="py-3">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={!!rules.underAge?.on}
                                onChange={e => set('underAge', { on: e.target.checked })}
                                className="w-4 h-4 mt-0.5 accent-accent flex-shrink-0"
                            />
                            <span>
                                <span className="block text-sm font-medium text-gray-900">
                                    Under 18 limits
                                </span>
                                <span className="block text-xs text-gray-500 mt-0.5">
                                    Eight hours a day, forty a week, nothing after ten at night, and twelve
                                    hours rest rather than eleven. Only applies to somebody with a date of
                                    birth on the team list showing they are under 18.
                                </span>
                            </span>
                        </label>
                    </div>
                </div>
                </ModalSection>

                <ModalSection title="Certificates">
                <div>
                    <div className="py-3">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={!!rules.foodSafety?.on}
                                onChange={e => set('foodSafety', { on: e.target.checked })}
                                className="w-4 h-4 mt-0.5 accent-accent flex-shrink-0"
                            />
                            <span>
                                <span className="block text-sm font-medium text-gray-900">
                                    Food safety training running out
                                </span>
                                <span className="block text-xs text-gray-500 mt-0.5">
                                    A certificate nobody is watching is one that has quietly run out, and
                                    finding that out during an inspection is the expensive way. This warns
                                    rather than holds the week: an expired certificate is a course to book,
                                    not a reason the roster cannot go out.
                                </span>
                            </span>
                        </label>
                        {rules.foodSafety?.on && (
                            <div className="flex items-center gap-2 mt-2 ml-7">
                                <input
                                    {...numberField({
                                        value: String(rules.foodSafety.warnDays ?? ''),
                                        onChange: v => set('foodSafety', { warnDays: Number(v) || 0 }),
                                        whole: true,
                                    })}
                                    className={numCls}
                                />
                                <span className="text-sm text-gray-500">days notice before it runs out</span>
                            </div>
                        )}
                    </div>
                </div>
                </ModalSection>

                <ModalSection
                    title="The grid"
                    description="How much of the day the roster draws either side of the opening hours. Enough to see a delivery at six in the morning and a clean down at midnight, without the grid being mostly empty. The hours the store is shut are shaded."
                >
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        {...numberField({
                            value: String(rules.gridHours?.before ?? 3),
                            onChange: v => set('gridHours', { before: Number(v) || 0 }),
                            whole: true,
                        })}
                        className={numCls}
                    />
                    <span className="text-sm text-gray-500">hours before opening, and</span>
                    <input
                        {...numberField({
                            value: String(rules.gridHours?.after ?? 3),
                            onChange: v => set('gridHours', { after: Number(v) || 0 }),
                            whole: true,
                        })}
                        className={numCls}
                    />
                    <span className="text-sm text-gray-500">after closing</span>
                </div>

                </ModalSection>

                <ModalSection>
                    <p className="text-xs text-gray-400">
                        The holiday periods a student may work full time in are June to September and
                        15 December to 15 January. Immigration rules change, so these are worth checking
                        against current guidance rather than taken as final.
                    </p>
                </ModalSection>

                <div className={modalFooter}>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 border border-border text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 bg-white"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={saving}
                        className="px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50"
                    >
                        {saving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>
        </Modal>
    )
}
