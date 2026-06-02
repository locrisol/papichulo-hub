import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Editor for the pack formats (Box, Bag, Tin...) on a single price record,
// plus the allow_loose_count toggle. Formats convert to the product's base unit.
export default function PriceCountUnitsEditor({ price, unit, onClose }) {
    const [formats, setFormats] = useState([])
    const [allowLoose, setAllowLoose] = useState(price.allow_loose_count ?? true)
    const [looseLoaded, setLooseLoaded] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    // Add-form state
    const [label, setLabel] = useState('')
    const [factor, setFactor] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetchFormats()
    }, [price.id])

    async function fetchFormats() {
        setLoading(true)

        // Fetch formats and the current allow_loose_count together, so the editor
        // always reflects the real stored state (not a possibly-stale parent prop).
        const [{ data: formatsData, error: formatsErr }, { data: priceData, error: priceErr }] = await Promise.all([
            supabase
                .from('price_count_units')
                .select('*')
                .eq('price_id', price.id)
                .order('sort_order', { ascending: true })
                .order('created_at', { ascending: true }),
            supabase
                .from('product_supplier_prices')
                .select('allow_loose_count')
                .eq('id', price.id)
                .single(),
        ])

        if (formatsErr) setError(formatsErr.message)
        else setFormats(formatsData || [])

        if (!priceErr && priceData) {
            setAllowLoose(priceData.allow_loose_count ?? true)
        }
        setLooseLoaded(true)
        setLoading(false)
    }

    async function handleAdd() {
        setError('')
        const f = parseFloat(factor)
        if (!label.trim()) { setError('Label is required (e.g. Box, Bag, Tin).'); return }
        if (isNaN(f) || f <= 0) { setError('Factor must be greater than 0.'); return }

        setSaving(true)
        const { data, error } = await supabase
            .from('price_count_units')
            .insert({
                price_id: price.id,
                label: label.trim(),
                factor: f,
                sort_order: formats.length,
            })
            .select()
            .single()

        setSaving(false)
        if (error) { setError(error.message); return }

        setFormats(prev => [...prev, data])
        setLabel('')
        setFactor('')
    }

    async function handleDelete(formatId) {
        const { error } = await supabase
            .from('price_count_units')
            .delete()
            .eq('id', formatId)

        if (error) { setError(error.message); return }
        setFormats(prev => prev.filter(f => f.id !== formatId))
    }

    async function toggleLoose() {
        const next = !allowLoose
        setAllowLoose(next)
        const { error } = await supabase
            .from('product_supplier_prices')
            .update({ allow_loose_count: next })
            .eq('id', price.id)

        if (error) {
            setError(error.message)
            setAllowLoose(!next) // revert on failure
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900">Count formats</h4>
                {onClose && (
                    <button onClick={onClose} className="text-xs font-medium text-gray-500 hover:text-gray-700">
                        Close
                    </button>
                )}
            </div>

            <p className="text-xs text-gray-500">
                Define how this product is counted during a stock take. Each format converts to the base unit ({unit}).
                For example, a Box that holds 6 {unit} → enter factor 6.
            </p>

            {error && (
                <div className="bg-red-50 text-red-600 text-xs rounded-lg p-2">{error}</div>
            )}

            {/* Existing formats */}
            {loading ? (
                <p className="text-xs text-gray-400">Loading formats...</p>
            ) : formats.length === 0 ? (
                <p className="text-xs text-gray-400">No formats yet. Counting will use the base unit ({unit}) only.</p>
            ) : (
                <div className="space-y-1.5">
                    {formats.map(f => (
                        <div key={f.id} className="flex items-center justify-between bg-white border border-border rounded-lg px-3 py-2">
                            <span className="text-sm text-gray-900">
                                <span className="font-semibold">{f.label}</span>
                                <span className="text-gray-500"> = {parseFloat(f.factor)} {unit}</span>
                            </span>
                            <button
                                onClick={() => handleDelete(f.id)}
                                className="text-xs font-medium text-red-500 hover:text-red-700"
                            >
                                Delete
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Add format */}
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Format name</label>
                    <input
                        type="text"
                        value={label}
                        onChange={e => setLabel(e.target.value)}
                        placeholder="e.g. Box"
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                    />
                </div>
                <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                        {unit} per {label.trim() || 'unit'}
                    </label>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={factor}
                        onChange={e => setFactor(e.target.value.replace(/[^0-9.]/g, ''))}
                        placeholder="e.g. 6"
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                    />
                </div>
                <button
                    onClick={handleAdd}
                    disabled={saving}
                    className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-40 transition-colors"
                >
                    Add
                </button>
            </div>

            {/* Loose toggle */}
            <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                    type="checkbox"
                    checked={allowLoose}
                    onChange={toggleLoose}
                    disabled={!looseLoaded}
                    className="accent-accent"
                />
                <span className="text-sm text-gray-700">
                    Allow loose counting in {unit} (for opened boxes / partial stock)
                </span>
            </label>
        </div>
    )
}