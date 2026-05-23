import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useRestaurant } from '../../context/RestaurantContext'

export default function RestaurantPage() {
    const { user } = useAuth()
    const { activeRestaurant, setActiveRestaurant } = useRestaurant()

    const [formData, setFormData] = useState({
        food_cost_target: '',
        labour_cost_target: '',
        packaging_cost_target: '',
        hourly_rate: '',
        forecasting_enabled: false,
    })

    const [saveType, setSaveType] = useState('permanent')
    const [effectiveFrom, setEffectiveFrom] = useState('')
    const [effectiveUntil, setEffectiveUntil] = useState('')
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState('')
    const [error, setError] = useState('')
    const [activeOverrides, setActiveOverrides] = useState([])

    useEffect(() => {
        if (!activeRestaurant) return
        setFormData({
            food_cost_target: parseFloat(activeRestaurant.food_cost_target).toFixed(2) || '',
            labour_cost_target: parseFloat(activeRestaurant.labour_cost_target).toFixed(2) || '',
            packaging_cost_target: parseFloat(activeRestaurant.packaging_cost_target).toFixed(2) || '',
            hourly_rate: parseFloat(activeRestaurant.hourly_rate).toFixed(2) || '',
            forecasting_enabled: activeRestaurant.forecasting_enabled || false,
        })
    }, [activeRestaurant])

    useEffect(() => {
        if (!activeRestaurant) return
        fetchActiveOverrides()
    }, [activeRestaurant])

    async function fetchActiveOverrides() {
        const today = new Date().toISOString().split('T')[0]
        const { data } = await supabase
            .from('cost_target_overrides')
            .select('*')
            .eq('restaurant_id', activeRestaurant.id)
            .lte('effective_from', today)
            .or(`effective_until.is.null,effective_until.gte.${today}`)

        if (data) setActiveOverrides(data)
    }

    function getCurrentWeekStart() {
        const today = new Date()
        const day = today.getDay()
        const sunday = new Date(today)
        sunday.setDate(today.getDate() - day)
        return sunday.toISOString().split('T')[0]
    }

    async function handleSave(e) {
        e.preventDefault()
        setLoading(true)
        setError('')
        setSuccess('')

        if (saveType === 'permanent') {
            const { data, error } = await supabase
                .from('restaurants')
                .update({
                    food_cost_target: parseFloat(formData.food_cost_target),
                    labour_cost_target: parseFloat(formData.labour_cost_target),
                    packaging_cost_target: parseFloat(formData.packaging_cost_target),
                    hourly_rate: parseFloat(formData.hourly_rate),
                    forecasting_enabled: formData.forecasting_enabled,
                })
                .eq('id', activeRestaurant.id)
                .select()
                .single()

            if (error) setError(error.message)
            else {
                setActiveRestaurant(data)
                setSuccess('Settings saved successfully.')
            }
        } else {
            const targets = [
                { type: 'food', value: formData.food_cost_target, original: activeRestaurant.food_cost_target },
                { type: 'labour', value: formData.labour_cost_target, original: activeRestaurant.labour_cost_target },
                { type: 'packaging', value: formData.packaging_cost_target, original: activeRestaurant.packaging_cost_target },
            ].filter(t => parseFloat(t.value) !== parseFloat(t.original))

            if (targets.length === 0) {
                setError('No cost targets were changed.')
                setLoading(false)
                return
            }

            const inserts = targets.map(t => ({
                restaurant_id: activeRestaurant.id,
                target_type: t.type,
                override_value: parseFloat(t.value),
                effective_from: effectiveFrom || getCurrentWeekStart(),
                effective_until: effectiveUntil || null,
                created_by: user.id,
            }))

            const { error } = await supabase
                .from('cost_target_overrides')
                .insert(inserts)

            if (error) setError(error.message)
            else setSuccess('Temporary targets saved successfully.')
        }

        setLoading(false)
    }

    return (
        <div className="max-w-2xl">
            <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900">Restaurant Settings</h2>
                <p className="text-sm text-gray-500 mt-1">
                    Configure cost targets and settings for {activeRestaurant?.name}
                </p>
            </div>

            {error && (
                <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>
            )}
            {success && (
                <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3 mb-4">{success}</div>
            )}

            {activeOverrides.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                    <p className="text-sm font-semibold text-amber-700 mb-2">Active temporary overrides</p>
                    <ul className="text-xs text-amber-600 space-y-1">
                        {activeOverrides.map(o => (
                            <li key={o.id}>
                                {o.target_type.charAt(0).toUpperCase() + o.target_type.slice(1)} cost target overridden to{' '}
                                <strong>{parseFloat(o.override_value).toFixed(2)}%</strong>
                                {o.effective_until ? ` until ${new Date(o.effective_until).toLocaleDateString('en-IE')}` : ' (open-ended)'}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <form onSubmit={handleSave}>
                <div className="bg-white rounded-xl border border-border p-6 mb-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">Cost Targets</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                Food Cost Target (%)
                            </label>
                            <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={formData.food_cost_target}
                                onChange={e => setFormData({ ...formData, food_cost_target: e.target.value })}
                                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                Labour Cost Target (%)
                            </label>
                            <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={formData.labour_cost_target}
                                onChange={e => setFormData({ ...formData, labour_cost_target: e.target.value })}
                                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                Packaging Cost Target (%)
                            </label>
                            <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={formData.packaging_cost_target}
                                onChange={e => setFormData({ ...formData, packaging_cost_target: e.target.value })}
                                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                Hourly Rate (€)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={formData.hourly_rate}
                                onChange={e => setFormData({ ...formData, hourly_rate: e.target.value })}
                                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                required
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-border p-6 mb-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">Save Type</h3>
                    <div className="flex gap-4 mb-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                value="permanent"
                                checked={saveType === 'permanent'}
                                onChange={() => setSaveType('permanent')}
                                className="accent-accent"
                            />
                            <span className="text-sm text-gray-700">Permanent</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                value="temporary"
                                checked={saveType === 'temporary'}
                                onChange={() => setSaveType('temporary')}
                                className="accent-accent"
                            />
                            <span className="text-sm text-gray-700">Temporary</span>
                        </label>
                    </div>

                    {saveType === 'temporary' && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                    Effective From (Sunday)
                                </label>
                                <input
                                    type="date"
                                    value={effectiveFrom}
                                    onChange={e => setEffectiveFrom(e.target.value)}
                                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                />
                                <p className="text-xs text-gray-400 mt-1">Defaults to current week if left empty</p>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                    Effective Until (Saturday)
                                </label>
                                <input
                                    type="date"
                                    value={effectiveUntil}
                                    onChange={e => setEffectiveUntil(e.target.value)}
                                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                />
                                <p className="text-xs text-gray-400 mt-1">Leave empty for open-ended override</p>
                            </div>
                        </div>
                    )}
                </div>

                {user?.role === 'super_admin' && (
                    <div className="bg-white rounded-xl border border-border p-6 mb-4">
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
                                <p className="text-xs text-gray-500">Only available for restaurants near large event venues</p>
                            </div>
                        </label>
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="bg-accent hover:bg-orange-600 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors"
                >
                    {loading ? 'Saving...' : 'Save Settings'}
                </button>
            </form>
        </div>
    )
}