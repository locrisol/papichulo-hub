import { useState } from 'react'
import Modal from './Modal'
import { supabase } from '../lib/supabase'
import { useRestaurant } from '../context/RestaurantContext'
import { friendlyError } from '../lib/errors'
import { numberField } from '../lib/numberInput'
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
            <div className="p-5">
                {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3 mb-4">{error}</p>}

                <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1">
                    Warnings
                </p>
                <p className="text-xs text-gray-500 mb-2">
                    These say something is worth a second look. None of them stop a week going out.
                </p>

                <div className="mb-6">
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
                </div>

                <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1">
                    Stops a week going out
                </p>
                <p className="text-xs text-gray-500 mb-2">
                    These two are the law about the employer rather than guidance about the employee.
                    Going over them is the company's problem and not the person's, so they hold the week
                    until something is changed.
                </p>

                <div className="mb-5">
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

                <p className="text-xs text-gray-400 border-t border-border pt-4 mb-4">
                    The holiday periods a student may work full time in are June to September and
                    15 December to 15 January. Immigration rules change, so these are worth checking
                    against current guidance rather than taken as final.
                </p>

                <div className="flex justify-end gap-3">
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
