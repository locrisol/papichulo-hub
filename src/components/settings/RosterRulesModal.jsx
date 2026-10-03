import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { supabase } from '@/lib/supabase'
import { useRestaurant } from '@/context/restaurant'
import { friendlyError } from '@/lib/errors'
import { numberField } from '@/lib/numberInput'
import { NOTICE_DEFAULT } from '@/lib/timeOff'
import { modalFooter, checkbox, primaryButton, secondaryButton, denseField, compactField, hintClass } from '@/lib/controlStyles'
import ModalSection from '@/components/ui/ModalSection'
import { DEFAULT_RULES } from '@/lib/workRules'
import ErrorBanner from '@/components/ui/ErrorBanner'

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

    const row = ({ key, title, blurb, unit, field = 'hours' }) => (
        <div key={key} className="py-3 border-b border-border last:border-b-0">
            <label className="flex items-start gap-3 cursor-pointer">
                <input
                    type="checkbox"
                    checked={!!rules[key]?.on}
                    onChange={e => set(key, { on: e.target.checked })}
                    className={`${checkbox} mt-0.5`}
                />
                <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-gray-900">{title}</span>
                    <span className="block text-xs text-muted mt-0.5">{blurb}</span>
                </span>
            </label>
            {rules[key]?.on && (
                <div className="flex items-center gap-2 mt-2 ml-7">
                    <div className="w-16 flex-shrink-0">
                        <input
                            {...numberField({
                                value: String(rules[key][field] ?? ''),
                                onChange: v => set(key, { [field]: Number(v) || 0 }),
                            })}
                            className={`${denseField} text-right`}
                        />
                    </div>
                    <span className="text-sm text-muted">{unit}</span>
                </div>
            )}
        </div>
    )

    return (
        <Modal title="Roster rules" onClose={onClose} width="max-w-xl">
            <div>
                {error && <ErrorBanner className="mx-6 mt-4">{error}</ErrorBanner>}

                <ModalSection
                    title="Warnings"
                    description="These show a warning on the roster. None of them stop the week being published."
                >
                <div>
                    {[
                        {
                            key: 'dailyRest',
                            title: 'Enough rest between two shifts',
                            blurb: 'Closing at 23:00 and opening at 08:00 the next day leaves only 9 hours. The legal minimum in Ireland is 11 hours.',
                            unit: 'hours between shifts',
                        },
                        {
                            key: 'weeklyRest',
                            title: 'One long break in the week',
                            blurb: 'The legal minimum in Ireland is 24 hours in a row on top of the daily 11, so 35 in practice.',
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
                            blurb: 'The legal limit is 48 hours a week averaged over four months, not in any single week. One busy week is not a breach, so this only warns when the average is over.',
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
                                className={`${checkbox} mt-0.5`}
                            />
                            <span>
                                <span className="block text-sm font-medium text-gray-900">
                                    When somebody said they can work
                                </span>
                                <span className="block text-xs text-muted mt-0.5">
                                    Warns when a shift falls on a day or time someone said they cannot
                                    work. Only applies to people with availability set on the Team page.
                                    It never stops the week being published.
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
                                className={`${checkbox} mt-0.5`}
                            />
                            <span>
                                <span className="block text-sm font-medium text-gray-900">
                                    Days someone is marked as away
                                </span>
                                <span className="block text-xs text-muted mt-0.5">
                                    Warns when a shift falls on a day someone is marked as away, such as a
                                    holiday, a day off or sick leave. It still lets you roster them, for
                                    example if someone is back early.
                                </span>
                            </span>
                        </label>
                    </div>
                </div>
                </ModalSection>

                <ModalSection
                    title="Time off"
                    description="How far ahead someone should ask for a holiday. A day off or part of a day does not need notice."
                >
                <div className="py-1">
                    <div className="flex items-center gap-2">
                        <div className="w-16 flex-shrink-0">
                            <input
                                {...numberField({
                                    value: String(rules.holidayNoticeDays ?? NOTICE_DEFAULT),
                                    onChange: v => setRules(r => ({ ...r, holidayNoticeDays: Number(v) || 0 })),
                                })}
                                className={`${denseField} text-right`}
                            />
                        </div>
                        <span className="text-sm text-muted">days' notice for a holiday</span>
                    </div>
                    <p className={hintClass}>Set it to 0 and no notice is asked for.</p>

                    <label className="flex items-start gap-3 cursor-pointer mt-3 pt-3 border-t border-border">
                        <input
                            type="checkbox"
                            checked={rules.holidayNoticeBlocks === true}
                            onChange={e => setRules(r => ({ ...r, holidayNoticeBlocks: e.target.checked }))}
                            className={`${checkbox} mt-0.5`}
                        />
                        <span className="flex-1 min-w-0">
                            <span className="block text-sm font-medium text-gray-900">
                                Do not let anyone send a request with less notice than this
                            </span>
                            <span className="block text-xs text-muted mt-0.5">
                                Off, they are warned and can send it anyway. On, they cannot send it at all.
                                Either way you see the short notice on the request before you answer it.
                            </span>
                        </span>
                    </label>
                </div>
                </ModalSection>

                <ModalSection
                    title="Stops the week being published"
                    description="These are legal limits on the employer. By default, breaking one stops the week being published until it is fixed."
                >

                <div>
                    <div className="py-3 border-b border-border">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={!!rules.visaCap?.on}
                                onChange={e => set('visaCap', { on: e.target.checked })}
                                className={`${checkbox} mt-0.5`}
                            />
                            <span>
                                <span className="block text-sm font-medium text-gray-900">
                                    Hours allowed by somebody's permission
                                </span>
                                <span className="block text-xs text-muted mt-0.5">
                                    A student on Stamp 2 may work twenty hours a week in term time and forty
                                    during the holiday periods. Only applies to people whose permission has
                                    been recorded on the Team page.
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
                                <div className="sm:w-fit">
                                    <select
                                        value={rules.visaCap.blocks === false ? 'warn' : 'block'}
                                        onChange={e => set('visaCap', { blocks: e.target.value === 'block' })}
                                        className={compactField}
                                    >
                                        <option value="block">Stop the week being published</option>
                                        <option value="warn">Only show a warning</option>
                                    </select>
                                </div>
                                {rules.visaCap.blocks === false && (
                                    <p className="text-xs text-amber-700 mt-1.5">
                                        The roster will keep showing this warning every week until it is fixed.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Its own switch, because it is a different rule from the
                        one above it. That one is about how many hours a valid
                        permission allows; this is about somebody whose
                        permission has run out while a renewal is processed. */}
                    <div className="py-3 border-b border-border">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={!!rules.permissionGrace?.on}
                                onChange={e => set('permissionGrace', { on: e.target.checked })}
                                className={`${checkbox} mt-0.5`}
                            />
                            <span>
                                <span className="block text-sm font-medium text-gray-900">
                                    Waiting for a renewal
                                </span>
                                <span className="block text-xs text-muted mt-0.5">
                                    Someone who applied to renew before their permission expired may keep
                                    working while it is processed. Only applies where the date they applied
                                    is on the Team page and is on or before the expiry date. Someone with no
                                    renewal recorded still stops the week being published.
                                </span>
                            </span>
                        </label>

                        {/* Typed in, unlike the hours above, because this one
                            is not a fixed ceiling. It has changed twice this
                            year, and a rule the law keeps moving must not need
                            a new version of the app to move with it. */}
                        {rules.permissionGrace?.on && (
                            <div className="ml-7 mt-2 flex flex-wrap items-center gap-2">
                                <span className="text-sm text-gray-700">They may keep working for</span>
                                <div className="w-20 flex-shrink-0">
                                    <input
                                        {...numberField({
                                            value: String(rules.permissionGrace.weeks ?? 12),
                                            onChange: v => set('permissionGrace', { weeks: parseInt(v) || 0 }),
                                            whole: true,
                                        })}
                                        className={`${denseField} text-right`}
                                    />
                                </div>
                                <span className="text-sm text-gray-700">weeks after it expired,</span>
                                <div className="w-full sm:w-auto">
                                    <select
                                        value={rules.permissionGrace.afterBlocks ? 'block' : 'warn'}
                                        onChange={e => set('permissionGrace', { afterBlocks: e.target.value === 'block' })}
                                        className={compactField}
                                    >
                                        <option value="warn">then keep warning every week</option>
                                        <option value="block">then stop the week being published</option>
                                    </select>
                                </div>
                                <p className={`w-full ${hintClass}`}>
                                    Twelve is the figure in the Department's notice, but renewals have been
                                    taking more than seventeen weeks. Whichever you pick, the roster keeps
                                    showing it every week.
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="py-3">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={!!rules.underAge?.on}
                                onChange={e => set('underAge', { on: e.target.checked })}
                                className={`${checkbox} mt-0.5`}
                            />
                            <span>
                                <span className="block text-sm font-medium text-gray-900">
                                    Under 18 limits
                                </span>
                                <span className="block text-xs text-muted mt-0.5">
                                    Eight hours a day, forty a week and nothing after ten at night. Less
                                    than twelve hours rest between shifts only shows a warning. Only
                                    applies to somebody with a date of birth on the Team page showing
                                    they are under 18.
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
                                className={`${checkbox} mt-0.5`}
                            />
                            <span>
                                <span className="block text-sm font-medium text-gray-900">
                                    Food safety training expiring
                                </span>
                                <span className="block text-xs text-muted mt-0.5">
                                    Warns when someone's food safety certificate is about to expire or has
                                    expired. It never stops the week being published.
                                </span>
                            </span>
                        </label>
                        {rules.foodSafety?.on && (
                            <div className="flex items-center gap-2 mt-2 ml-7">
                                <div className="w-16 flex-shrink-0">
                                    <input
                                        {...numberField({
                                            value: String(rules.foodSafety.warnDays ?? ''),
                                            onChange: v => set('foodSafety', { warnDays: Number(v) || 0 }),
                                            whole: true,
                                        })}
                                        className={`${denseField} text-right`}
                                    />
                                </div>
                                <span className="text-sm text-muted">days' notice before it expires</span>
                            </div>
                        )}
                    </div>
                </div>
                </ModalSection>

                <ModalSection
                    title="The grid"
                    description="How much of the day the roster shows either side of the opening hours, so an early delivery or a late clean down still fits. The hours the restaurant is closed are shaded."
                >
                <div className="flex flex-wrap items-center gap-2">
                    <div className="w-16 flex-shrink-0">
                        <input
                            {...numberField({
                                value: String(rules.gridHours?.before ?? 3),
                                onChange: v => set('gridHours', { before: Number(v) || 0 }),
                                whole: true,
                            })}
                            className={`${denseField} text-right`}
                        />
                    </div>
                    <span className="text-sm text-muted">hours before opening, and</span>
                    <div className="w-16 flex-shrink-0">
                        <input
                            {...numberField({
                                value: String(rules.gridHours?.after ?? 3),
                                onChange: v => set('gridHours', { after: Number(v) || 0 }),
                                whole: true,
                            })}
                            className={`${denseField} text-right`}
                        />
                    </div>
                    <span className="text-sm text-muted">after closing</span>
                </div>

                </ModalSection>

                <ModalSection>
                    <p className="text-xs text-muted">
                        The holiday periods a student may work full time in are June to September and
                        15 December to 15 January. Immigration rules change, so check these against
                        current guidance.
                    </p>
                </ModalSection>

                <div className={modalFooter}>
                    <button
                        type="button"
                        onClick={onClose}
                        className={secondaryButton}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={saving}
                        className={primaryButton('lg')}
                    >
                        {saving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>
        </Modal>
    )
}
