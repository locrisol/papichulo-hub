import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useRestaurant } from '@/context/restaurant'
import SalesPlatformsModal from '@/components/settings/SalesPlatformsModal'
import SalesTendersModal from '@/components/settings/SalesTendersModal'
import CostTargetModal from '@/components/costs/CostTargetModal'
import OpeningHoursModal from '@/components/settings/OpeningHoursModal'
import PlacesNearUsModal from '@/components/settings/PlacesNearUsModal'
import BreakRulesModal from '@/components/settings/BreakRulesModal'
import RosterRulesModal from '@/components/settings/RosterRulesModal'
import { todayISO, weekStartOf, shortDate, stampDateTime, fullDate } from '@/lib/dates'
import { anchorOf, periodOf, periodWords } from '@/lib/payPeriod'
import { resolveTarget, describeTargets } from '@/lib/costTargets'
import { friendlyError } from '@/lib/errors'
import { DEFAULT_BREAK_RULES, BANK_HOLIDAY } from '@/lib/roster'
import { DEFAULT_RULES } from '@/lib/workRules'
import { numberField } from '@/lib/numberInput'
import { card, rowButton, labelClass, pageTitle, dateField } from '@/lib/controlStyles'
import ErrorBanner from '@/components/ui/ErrorBanner'
import LockedField from '@/components/ui/LockedField'

// Restaurant settings.
//
// Cost targets are set through the same modal the cost dashboard uses, so there
// is one place a target is ever changed and the two screens cannot drift apart.
//
// A target is never edited in place. Each change is a new row with a start week,
// so a change made today does not rewrite how June was judged. That is why the
// hourly rate is one of the few things saved straight onto the restaurant here:
// it is copied onto every labour entry when it is saved, so past weeks already
// keep what was really paid.

const TARGET_TYPES = [
    { key: 'food', label: 'Food cost', column: 'food_cost_target' },
    { key: 'labour', label: 'Labour cost', column: 'labour_cost_target' },
    { key: 'packaging', label: 'Packaging and cleaning', column: 'packaging_cost_target' },
]

export default function RestaurantPage() {
    const { user } = useAuth()
    const { activeRestaurant, setActiveRestaurant } = useRestaurant()

    const [formData, setFormData] = useState({
        hourly_rate: '',
        mail_from: '',
        google_calendar_id: '',
        pay_period_start: '',
    })

    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState('')
    const [error, setError] = useState('')
    // Kept apart from the page's error above. That one is for something that
    // would not load, which belongs at the top of the page because there is
    // nothing else up there to read. This is for a save that would not go
    // through, and that belongs beside the button you pressed: at the foot of
    // a form on a phone, the top of the page is not on the screen at all.
    const [formProblem, setFormProblem] = useState('')
    const [overrides, setOverrides] = useState([])
    const [showPlatformsModal, setShowPlatformsModal] = useState(false)
    const [showTendersModal, setShowTendersModal] = useState(false)
    const [showHoursModal, setShowHoursModal] = useState(false)
    const [showPlacesModal, setShowPlacesModal] = useState(false)
    const [showBreaksModal, setShowBreaksModal] = useState(false)
    const [showRulesModal, setShowRulesModal] = useState(false)
    const [editingTarget, setEditingTarget] = useState(null)
    const [refresh, setRefresh] = useState(0)

    const week = weekStartOf(todayISO())

    useEffect(() => {
        if (!activeRestaurant) return
        // The fetch sets a loading state before it starts, which is one render
        // this rule would rather avoid. The alternative is to leave it,
        // and then a change of restaurant keeps the previous one's figures
        // on screen under the new one's heading until the answer arrives.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFormData({
            hourly_rate: parseFloat(activeRestaurant.hourly_rate).toFixed(2) || '',
            mail_from: activeRestaurant.mail_from || '',
            google_calendar_id: activeRestaurant.google_calendar_id || '',
            pay_period_start: activeRestaurant.pay_period_start || '',
        })
    }, [activeRestaurant])

    useEffect(() => {
        if (!activeRestaurant) return

        // All of them, not just what applies today. Without the full list there
        // is no way to work out when one target really ended.
        async function load() {
            const { data, error: e1 } = await supabase
                .from('cost_target_overrides')
                .select('*')
                .eq('restaurant_id', activeRestaurant.id)

            if (e1) setError(friendlyError(e1))
            else setOverrides(data || [])
        }
        load()
    }, [activeRestaurant, refresh])

    // Swap a row with its neighbour. Arrows rather than drag and drop: this is
    // set once and rarely revisited, and arrows work on touch without a library.
    async function handleSave(e) {
        e.preventDefault()
        setLoading(true)
        setFormProblem('')
        setSuccess('')

        const { data, error: e1 } = await supabase
            .from('restaurants')
            .update({
                hourly_rate: parseFloat(formData.hourly_rate),
                // Empty is null, not an empty string. Null means "no
                // address of its own", which is what the mail falls back
                // on; an empty string would read as an address that is
                // blank.
                mail_from: formData.mail_from.trim() || null,
                google_calendar_id: formData.google_calendar_id.trim() || null,
                // Read back as the Sunday of its own week. A period that began
                // mid week would put its boundary inside a Hub week and leave
                // the two halves belonging to different weeks.
                pay_period_start: anchorOf(formData.pay_period_start) || null,
            })
            .eq('id', activeRestaurant.id)
            .select()
            .single()

        setLoading(false)
        if (e1) setFormProblem(friendlyError(e1))
        else {
            setActiveRestaurant(data)
            setSuccess('Settings saved.')
        }
    }

    // Enough of each setting to see at a glance whether it has been done,
    // without opening the dialog to find out.
    // Seven days, and the bank holiday hours are the eighth entry rather than
    // an eighth day. Counting the lot said "Open 8 days a week", which is the
    // kind of sentence nobody reads twice and everybody notices once.
    const hours = activeRestaurant?.opening_hours || {}
    const openDays = Object.entries(hours)
        .filter(([day, d]) => day !== BANK_HOLIDAY && d?.open && d?.close).length
    const bankHours = hours[BANK_HOLIDAY]
    const bankSummary = bankHours?.open && bankHours?.close
        ? ` Bank holidays ${bankHours.open} to ${bankHours.close}, on every one of the ten without anybody marking it.`
        : ' No bank holiday hours set, so a bank holiday keeps the usual ones.'
    const openingSummary = openDays === 0
        ? 'Not set yet. Until they are, the roster cannot mark opening or closing shifts.'
        : `Open ${openDays} ${openDays === 1 ? 'day' : 'days'} a week.${bankSummary}`

    const ladder = activeRestaurant?.break_rules?.length
        ? [...activeRestaurant.break_rules].sort((a, b) => b.hours - a.hours)
        : DEFAULT_BREAK_RULES
    // The same words the dialog uses, so the summary and the thing it
    // summarises do not describe the same rule two different ways. It read
    // "8h up gives 60 min", which is not a sentence anybody says.
    const breakSummary = ladder
        .map(r => `${r.operator === 'gt' ? 'more than' : 'at least'} ${r.hours}h gives ${r.minutes} min`)
        .join(', ')

    // How many checks are switched on, so it is obvious at a glance whether
    // anybody has been through them.
    const rules = { ...DEFAULT_RULES, ...(activeRestaurant?.roster_rules || {}) }
    const warnCount = ['dailyRest', 'weeklyRest', 'daysOff', 'maxWeek'].filter(k => rules[k]?.on).length
    const blockCount = ['visaCap', 'underAge'].filter(k => rules[k]?.on).length
    const rulesSummary = `${warnCount} of 4 warnings on, and ${blockCount} of 2 checks that hold a week back. Rest, days off, visa hours, under 18s, food safety expiry and how wide the grid is drawn.`

    // What is in force this week for one target, and how long it runs.
    function targetSummary(type) {
        const timeline = describeTargets(overrides, type.key, week)
        const current = timeline.find(t => t.status === 'current')
        const upcoming = timeline.filter(t => t.status === 'upcoming')
        const fallback = Number(activeRestaurant?.[type.column])
        const value = resolveTarget(overrides, type.key, week, fallback)
        return { current, upcoming, value, count: timeline.length }
    }

    return (
        <>
            <div className="mb-6">
                <h2 className={pageTitle}>Restaurant Settings</h2>
                <p className="text-sm text-gray-500 mt-1">
                    Cost targets and settings for {activeRestaurant?.name}
                </p>
                {activeRestaurant?.updated_at && (
                    <p className="text-xs text-muted mt-1">
                        Last updated: {stampDateTime(activeRestaurant.updated_at)}
                    </p>
                )}
            </div>

            {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}
            {success && <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3 mb-4">{success}</div>}

            {/* Two columns once there is room for them. On the left is what
                you change most, the targets and the pay rate, finishing with
                Save settings. On the right is the setup you touch once and
                leave alone. It stacks back into one column on a phone. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <div>
                    {/* Cost targets. Changed through the same modal the dashboard uses,
                        so a target is only ever set in one place. */}
                    <div className={`${card} p-6 mb-4`}>
                        <h3 className="text-sm font-semibold text-gray-900">Cost targets</h3>
                        <p className="text-xs text-gray-500 mt-1 mb-4">
                            What each target is for the week of {shortDate(week)}. Setting a new one starts from the week you
                            choose, so past weeks keep the target that was really in force at the time.
                        </p>

                        <div className="border border-border rounded-lg divide-y divide-border">
                            {TARGET_TYPES.map(type => {
                                const s = targetSummary(type)
                                return (
                                    // The name and the figure on one line, the
                                    // sentence about it underneath.
                                    //
                                    // This was a single row with the wording on
                                    // the left carrying min-w-0 and the figure
                                    // and button pinned flex-shrink-0 on the
                                    // right. Since only the left was allowed to
                                    // give way, on a phone it gave way to about
                                    // one word, and "The restaurant default.
                                    // Nothing has been set for a particular
                                    // week" came out reading straight down the
                                    // page. Same fault as the actions list on
                                    // the weekly report, same fix.
                                    <div key={type.key} className="px-4 py-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-sm font-medium text-gray-900">{type.label}</p>
                                            <div className="flex items-center gap-3 flex-shrink-0">
                                                <span className="font-serif text-xl font-bold text-gray-900">
                                                    {s.value != null ? `${s.value}%` : '-'}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingTarget(type.key)}
                                                    className={rowButton('edit')}
                                                >
                                                    Change
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {s.current ? (
                                                s.current.until
                                                    ? `Running since the week of ${shortDate(s.current.from)}, until the week of ${shortDate(s.current.until)}`
                                                    : `Running since the week of ${shortDate(s.current.from)}`
                                            ) : (
                                                'The restaurant default. Nothing has been set for a particular week'
                                            )}
                                        </p>
                                        {s.upcoming.length > 0 && (
                                            <p className="text-xs text-blue-600 mt-0.5">
                                                {s.upcoming.length === 1
                                                    ? `Changes to ${s.upcoming[s.upcoming.length - 1].value}% from the week of ${shortDate(s.upcoming[s.upcoming.length - 1].from)}`
                                                    : `${s.upcoming.length} more changes already set for later weeks`}
                                            </p>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Everything saved straight onto the restaurant row */}
                    <form onSubmit={handleSave}>
                        <div className={`${card} p-6 mb-4`}>
                            <h3 className="text-sm font-semibold text-gray-900 mb-4">Pay</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>
                                        Hourly rate (€)
                                    </label>
                                    <input
                                        {...numberField({
                                            value: formData.hourly_rate,
                                            onChange: v => setFormData({ ...formData, hourly_rate: v }),
                                        })}
                                        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                        required
                                    />
                                    {/* Safe to change without a date, because the rate is
                                        copied onto each labour entry when it is saved. */}
                                    <p className="text-xs text-muted mt-1">
                                        The average rate used to work out labour cost. Changing it does not alter weeks already
                                        entered, since each one keeps the rate it was saved with.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className={`${card} p-6 mb-4`}>
                            <h3 className="text-sm font-semibold text-gray-900 mb-4">Pay period</h3>
                            <label className={labelClass} htmlFor="pay-period-start">
                                A day the pay period started on
                            </label>
                            {/* One date, and it never has to be touched again.
                                The pay run is always a fortnight, so every other
                                period is worked out from this by counting in
                                fourteens, forwards or backwards. Pick any period
                                start anybody can name, however long ago. */}
                            <input
                                id="pay-period-start"
                                type="date"
                                className={`${dateField} w-full sm:w-auto`}
                                value={formData.pay_period_start}
                                onChange={e => setFormData({ ...formData, pay_period_start: e.target.value })}
                            />
                            <p className="text-xs text-muted mt-1">
                                {formData.pay_period_start ? (
                                    <>
                                        Saved as {fullDate(anchorOf(formData.pay_period_start))}, the Sunday of
                                        that week. The period covering today is{' '}
                                        <strong className="font-semibold text-gray-900">
                                            {periodWords(periodOf(todayISO(), formData.pay_period_start)?.start)}
                                        </strong>.
                                    </>
                                ) : (
                                    <>
                                        The Timesheet sends its hours a pay period at a time, so it cannot send
                                        anything until this is set. Any period start will do, however long ago.
                                    </>
                                )}
                            </p>
                        </div>

                        <div className={`${card} p-6 mb-4`}>
                            <h3 className="text-sm font-semibold text-gray-900 mb-4">Email</h3>
                            <label className={labelClass}>
                                Sent from
                            </label>
                            {/* Locked once it is set, like an overhead line on the
                                report. An address that is already working is not
                                something to leave a cursor sitting in: changing it
                                needs a matching alias or relay rule in Google, and a
                                stray keystroke here would send the next report from
                                an address that Google quietly rewrites, which looks
                                like nothing at all going wrong. */}
                            {/* Keyed on what the database holds rather than on what
                                is in the box, so the field locks itself again once a
                                new address has really been saved, and a box you are
                                still typing into is left alone. */}
                            <LockedField
                                key={activeRestaurant?.mail_from || 'none'}
                                label="Sending address" value={formData.mail_from}
                            >
                                <input
                                    type="email"
                                    inputMode="email"
                                    autoComplete="off"
                                    value={formData.mail_from}
                                    onChange={e => setFormData({ ...formData, mail_from: e.target.value })}
                                    placeholder="name@papichulo.ie"
                                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                />
                            </LockedField>
                            {/* The address only. The name in front of it is this
                                restaurant own name, so renaming it renames the sender
                                and there is no second place to keep in step. */}
                            <p className="text-xs text-muted mt-1">
                                The address Papi Chulo Hub emails come from for this restaurant.
                                Leave it empty and they come from the account the Hub sends with.
                                Replies never come back here: they go to whoever sent it, with
                                everyone else copied.
                            </p>
                        </div>

                        <div className={`${card} p-6 mb-4`}>
                            <h3 className="text-sm font-semibold text-gray-900 mb-4">Calendar</h3>
                            <label className={labelClass} htmlFor="google-calendar-id">
                                Google calendar
                            </label>
                            {/* Locked once it is set, the same as the sending
                                address above it. Two fields doing the same job
                                side by side should not behave differently, and
                                this one is pasted once and then never touched.
                                The failure it guards against is the quiet one:
                                a stray keystroke that still leaves a valid id
                                sends everything to the wrong calendar, and the
                                events already on the right one are only tidied
                                up as each entry happens to be saved again. */}
                            <LockedField
                                key={activeRestaurant?.google_calendar_id || 'none'}
                                label="Google calendar" value={formData.google_calendar_id}
                            >
                                <input
                                    id="google-calendar-id"
                                    type="text"
                                    autoComplete="off"
                                    value={formData.google_calendar_id}
                                    onChange={e => setFormData({ ...formData, google_calendar_id: e.target.value })}
                                    placeholder="something@group.calendar.google.com"
                                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                />
                            </LockedField>
                            {/* The whole of what a new restaurant needs. Somebody
                                makes it a calendar, shares it the way the other two
                                are shared, and pastes the id here. There is nothing
                                to verify and nothing an administrator has to set up
                                per restaurant, which is the thing the email could
                                never manage. */}
                            <p className="text-xs text-muted mt-1">
                                Where catering, meetings and promotions for this restaurant are
                                written. Find it in Google Calendar under Settings, Integrate
                                calendar. Leave it empty and they stay in the Hub, which the
                                calendar screen says rather than pretending they went out.
                            </p>
                        </div>

                        {/* Above the button row rather than inside it. As a sibling of the
                            button it sat beside it on one line, which squeezes both on a
                            phone and is not where the eye goes after a press. */}
                        {formProblem && (
                          <ErrorBanner className="mb-3">{formProblem}</ErrorBanner>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-accent hover:bg-orange-600 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors"
                        >
                            {loading ? 'Saving...' : 'Save settings'}
                        </button>
                    </form>
                </div>

                <div>
                    {/* Which places this restaurant is near, and how near.
                        This replaced a single switch called Forecasting, which
                        turned on a screen that predicted takings from one
                        venue. Nothing predicts anything now: it says what is
                        on and when, and the manager decides what that is
                        worth. */}
                    <div className={`${card} p-6 mb-4`}>
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900">Places near us</h3>
                                <p className="text-xs text-gray-500 mt-1">
                                    What is on around this restaurant, as a badge on the roster and
                                    the calendar. Nothing here predicts anything.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowPlacesModal(true)}
                                className="px-4 py-2 border border-border text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                            >
                                Manage places
                            </button>
                        </div>
                    </div>

                    {/* Sales platforms management */}
                    <div className={`${card} p-6 mb-4`}>
                        {/* Same shape as Opening hours below, which already had
                            the gap and the wrap. Without them the sentence was
                            squeezed against a button that refuses to wrap, and
                            on a phone it came out a word per line. */}
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900">Sales platforms</h3>
                                <p className="text-xs text-gray-500 mt-1">
                                    The delivery and catering platforms used for sales entry.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowPlatformsModal(true)}
                                className="px-4 py-2 border border-border text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                            >
                                Manage platforms
                            </button>
                        </div>
                    </div>

                    {/* Opening hours and break rules.

                        Both are here rather than on the roster because they are
                        properties of a restaurant, not of a week. Both are also
                        the two things the roster cannot work out for itself:
                        what counts as an opening or closing shift, and what
                        break somebody has earned. */}
                    <div className={`${card} p-6 mb-4`}>
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900">Opening hours</h3>
                                <p className="text-xs text-gray-500 mt-1">
                                    {openingSummary}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowHoursModal(true)}
                                className="px-4 py-2 border border-border text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                            >
                                Set hours
                            </button>
                        </div>
                    </div>

                    <div className={`${card} p-6 mb-4`}>
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900">Break rules</h3>
                                <p className="text-xs text-gray-500 mt-1">
                                    {breakSummary}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowBreaksModal(true)}
                                className="px-4 py-2 border border-border text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                            >
                                Set breaks
                            </button>
                        </div>
                    </div>

                    <div className={`${card} p-6 mb-4`}>
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900">Roster rules</h3>
                                <p className="text-xs text-gray-500 mt-1">
                                    {rulesSummary}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowRulesModal(true)}
                                className="px-4 py-2 border border-border text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                            >
                                Set rules
                            </button>
                        </div>
                    </div>

                    {/* The till receipt rows.

                        Super Admin only, and the database says so too rather
                        than this just being a hidden button. Changing these
                        changes the shape of every day entered afterwards. */}
                    {user?.role === 'super_admin' && (
                        <div className={`${card} p-6`}>
                            <div className="flex items-center justify-between gap-4 flex-wrap">
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-900">Till receipt rows</h3>
                                    <p className="text-xs text-gray-500 mt-1">
                                        The rows on the sales screens, in the order the till prints them. Add one when
                                        the till starts taking money a new way, retire one when it stops.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowTendersModal(true)}
                                    className="px-4 py-2 border border-border text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                                >
                                    Manage rows
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {editingTarget && (
                <CostTargetModal
                    targetType={editingTarget}
                    restaurantId={activeRestaurant.id}
                    weekStart={week}
                    currentValue={targetSummary(TARGET_TYPES.find(t => t.key === editingTarget)).value}
                    onClose={() => setEditingTarget(null)}
                    onSaved={() => setRefresh(n => n + 1)}
                />
            )}

            {showPlatformsModal && (
                <SalesPlatformsModal
                    onClose={() => setShowPlatformsModal(false)}
                />
            )}

            {showTendersModal && (
                <SalesTendersModal
                    onClose={() => setShowTendersModal(false)}
                />
            )}

            {showPlacesModal && (
                <PlacesNearUsModal
                    onClose={() => setShowPlacesModal(false)}
                    onChange={() => setRefresh(n => n + 1)}
                />
            )}

            {showHoursModal && <OpeningHoursModal onClose={() => setShowHoursModal(false)} />}
            {showBreaksModal && <BreakRulesModal onClose={() => setShowBreaksModal(false)} />}
            {showRulesModal && <RosterRulesModal onClose={() => setShowRulesModal(false)} />}
        </>
    )
}