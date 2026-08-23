import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useRestaurant } from '../../context/RestaurantContext'
import SalesPlatformsModal from '../../components/SalesPlatformsModal'
import SalesTendersModal from '../../components/SalesTendersModal'
import CostTargetModal from '../../components/CostTargetModal'
import OpeningHoursModal from '../../components/OpeningHoursModal'
import BreakRulesModal from '../../components/BreakRulesModal'
import RosterRulesModal from '../../components/RosterRulesModal'
import { todayISO, weekStartOf, shortDate } from '../../lib/dates'
import { resolveTarget, describeTargets } from '../../lib/costTargets'
import { friendlyError } from '../../lib/errors'
import { DEFAULT_BREAK_RULES } from '../../lib/roster'
import { DEFAULT_RULES } from '../../lib/workRules'
import PageContainer from '../../components/layout/PageContainer'
import { numberField } from '../../lib/numberInput'
import { card } from '../../lib/controlStyles'

// Restaurant settings.
//
// Cost targets are set through the same modal the cost dashboard uses, so there
// is one place a target is ever changed and the two screens cannot drift apart.
//
// A target is never edited in place. Each change is a new row with a start week,
// so a change made today does not rewrite how June was judged. That is why the
// hourly rate and the forecasting flag are the only things saved straight onto
// the restaurant here: the rate is copied onto every labour entry when it is
// saved, so past weeks already keep what was really paid.

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
        forecasting_enabled: false,
    })

    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState('')
    const [error, setError] = useState('')
    const [overrides, setOverrides] = useState([])
    const [showPlatformsModal, setShowPlatformsModal] = useState(false)
    const [showTendersModal, setShowTendersModal] = useState(false)
    const [showHoursModal, setShowHoursModal] = useState(false)
    const [showBreaksModal, setShowBreaksModal] = useState(false)
    const [showRulesModal, setShowRulesModal] = useState(false)
    const [editingTarget, setEditingTarget] = useState(null)
    const [refresh, setRefresh] = useState(0)

    const week = weekStartOf(todayISO())

    useEffect(() => {
        if (!activeRestaurant) return
        setFormData({
            hourly_rate: parseFloat(activeRestaurant.hourly_rate).toFixed(2) || '',
            forecasting_enabled: activeRestaurant.forecasting_enabled || false,
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
        setError('')
        setSuccess('')

        const { data, error: e1 } = await supabase
            .from('restaurants')
            .update({
                hourly_rate: parseFloat(formData.hourly_rate),
                forecasting_enabled: formData.forecasting_enabled,
            })
            .eq('id', activeRestaurant.id)
            .select()
            .single()

        setLoading(false)
        if (e1) setError(friendlyError(e1))
        else {
            setActiveRestaurant(data)
            setSuccess('Settings saved.')
        }
    }

    // Enough of each setting to see at a glance whether it has been done,
    // without opening the dialog to find out.
    const openDays = Object.values(activeRestaurant?.opening_hours || {})
        .filter(d => d?.open && d?.close).length
    const openingSummary = openDays === 0
        ? 'Not set yet. Until they are, the roster cannot mark opening or closing shifts.'
        : `Open ${openDays} ${openDays === 1 ? 'day' : 'days'} a week. Used by the roster to mark opening and closing shifts.`

    const ladder = activeRestaurant?.break_rules?.length
        ? [...activeRestaurant.break_rules].sort((a, b) => b.hours - a.hours)
        : DEFAULT_BREAK_RULES
    const breakSummary = ladder
        .map(r => `${r.hours}h ${r.operator === 'gt' ? 'over' : 'up'} gives ${r.minutes} min`)
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
        <PageContainer width="form">
            <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900">Restaurant Settings</h2>
                <p className="text-sm text-gray-500 mt-1">
                    Cost targets and settings for {activeRestaurant?.name}
                </p>
                {activeRestaurant?.updated_at && (
                    <p className="text-xs text-gray-400 mt-1">
                        Last updated: {new Date(activeRestaurant.updated_at).toLocaleDateString('en-IE', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                        })}
                    </p>
                )}
            </div>

            {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}
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
                                    <div key={type.key} className="px-4 py-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-gray-900">{type.label}</p>
                                                <p className="text-xs text-gray-500 mt-0.5">
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
                                            <div className="flex items-center gap-3 flex-shrink-0">
                                                <span className="font-serif text-xl font-bold text-gray-900">
                                                    {s.value != null ? `${s.value}%` : '-'}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingTarget(type.key)}
                                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                                                >
                                                    Change
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Everything saved straight onto the restaurant row */}
                    <form onSubmit={handleSave}>
                        <div className={`${card} p-6 mb-4`}>
                            <h3 className="text-sm font-semibold text-gray-900 mb-4">Pay</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
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
                                    <p className="text-xs text-gray-400 mt-1">
                                        The average rate used to work out labour cost. Changing it does not alter weeks already
                                        entered, since each one keeps the rate it was saved with.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {user?.role === 'super_admin' && (
                            <div className={`${card} p-6 mb-4`}>
                                <h3 className="text-sm font-semibold text-gray-900 mb-4">Forecasting</h3>
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.forecasting_enabled}
                                        onChange={e => setFormData({ ...formData, forecasting_enabled: e.target.checked })}
                                        className="w-4 h-4 accent-accent"
                                    />
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">Enable demand forecasting</p>
                                        <p className="text-xs text-gray-500">Only for restaurants near a large event venue</p>
                                    </div>
                                </label>
                            </div>
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
                    {/* Sales platforms management */}
                    <div className={`${card} p-6 mb-4`}>
                        <div className="flex items-center justify-between">
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

            {showHoursModal && <OpeningHoursModal onClose={() => setShowHoursModal(false)} />}
            {showBreaksModal && <BreakRulesModal onClose={() => setShowBreaksModal(false)} />}
            {showRulesModal && <RosterRulesModal onClose={() => setShowRulesModal(false)} />}
        </PageContainer>
    )
}