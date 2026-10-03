import { useState, useEffect, useCallback } from 'react'
import { useConfirm } from '@/context/confirm'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { orderFormats } from '@/lib/countUnits'
import { rowButton, checkbox, labelClass, fieldClass, primaryButton } from '@/lib/controlStyles'
import ErrorBanner from '@/components/ui/ErrorBanner'

// The pack formats on one supplier price, plus whether loose counting is on.
//
// This exists so a stock take can be counted the way product actually sits in
// the cold room. Nobody wants to work out that eleven boxes is 66 KG while
// standing in there with a phone, so they count 11 boxes and the app does it.
//
// A format is a label and a factor, where the factor turns one pack into the
// product's base unit. Box = 6 means one box is 6 KG. Loose counting is separate
// and lives on the price itself as allow_loose_count, because it is not a pack,
// it is the leftover you count in the base unit.
//
// Formats belong to a price rather than to a product on purpose: two suppliers
// sell the same thing in different sized boxes.
export default function PriceCountUnitsEditor({ price, unit, onClose }) {
    const confirm = useConfirm()
    const [formats, setFormats] = useState([])
    const [allowLoose, setAllowLoose] = useState(price.allow_loose_count ?? true)
    const [looseLoaded, setLooseLoaded] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    // Add-form state
    const [label, setLabel] = useState('')
    const [factor, setFactor] = useState('')
    const [saving, setSaving] = useState(false)

    

    const fetchFormats = useCallback(async () => {
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

        if (formatsErr) setError(friendlyError(formatsErr))
        else setFormats(orderFormats(formatsData))

        if (!priceErr && priceData) {
            setAllowLoose(priceData.allow_loose_count ?? true)
        }
        setLooseLoaded(true)
        setLoading(false)
        }, [price.id])

    useEffect(() => {
        // The fetch sets a loading state before it starts, which is one render
        // this rule would rather avoid. The alternative is to leave it,
        // and then a change of what is shown keeps the previous one's figures
        // on screen under the new one's heading until the answer arrives.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchFormats()
    }, [fetchFormats])

    async function handleAdd() {
        setError('')
        const f = parseFloat(factor)
        if (!label.trim()) { setError('Enter a pack name, like Box, Bag or Tin.'); return }
        if (isNaN(f) || f <= 0) { setError(`Enter how many ${unit} are in one ${label.trim()}.`); return }

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
        if (error) { setError(friendlyError(error)); return }

        setFormats(prev => [...prev, data])
        setLabel('')
        setFactor('')
    }

    async function handleDelete(formatId) {
        const format = formats.find(f => f.id === formatId)
        const ok = await confirm({
            title: 'Remove this pack?',
            message: 'It stops being offered as a way of counting this product on a stock take. Stock takes '
                + 'already done keep the figures they were saved with.',
            details: format ? [
                { label: 'Pack', value: format.label || '' },
                { label: 'Holds', value: `${format.factor} ${unit || ''}` },
            ] : undefined,
            confirmLabel: 'Remove pack',
            tone: 'danger',
        })
        if (!ok) return

        const { error } = await supabase
            .from('price_count_units')
            .delete()
            .eq('id', formatId)

        if (error) { setError(friendlyError(error)); return }
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
            setError(friendlyError(error))
            setAllowLoose(!next) // revert on failure
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900">Packs</h4>
                {onClose && (
                    <button onClick={onClose} className={rowButton()}>
                        Close
                    </button>
                )}
            </div>

            <p className="text-xs text-gray-500">
                The packs a stock take counts this product in while this is the preferred price.
                For example, for a box that holds 6 {unit}, enter Box and 6.
            </p>

            {error && (
                <ErrorBanner className="text-xs">{error}</ErrorBanner>
            )}

            {/* Existing formats */}
            {loading ? (
                <p className="text-xs text-muted">Loading packs...</p>
            ) : formats.length === 0 ? (
                <p className="text-xs text-muted">No packs yet. While this is the preferred price, it is counted in {unit} only.</p>
            ) : (
                <div className="space-y-1.5">
                    {formats.map(f => (
                        <div key={f.id} className="flex items-center justify-between bg-white border border-border rounded-lg px-3 py-2">
                            <span className="text-sm text-gray-900">
                                <span className="font-semibold">{f.label}</span>
                                <span className="text-muted"> = {parseFloat(f.factor)} {unit}</span>
                            </span>
                            <button
                                onClick={() => handleDelete(f.id)}
                                className={rowButton('danger')}
                            >
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Add format */}
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <div className="flex-1">
                    <label className={labelClass}>Pack name</label>
                    <input
                        type="text"
                        value={label}
                        onChange={e => setLabel(e.target.value)}
                        placeholder="e.g. Box"
                        className={fieldClass}
                    />
                </div>
                <div className="flex-1">
                    <label className={labelClass}>
                        {unit} per {label.trim() || 'pack'}
                    </label>
                    <input
                        type="text"
                        inputMode="decimal"
                        onFocus={e => e.target.select()}
                        value={factor}
                        onChange={e => setFactor(e.target.value.replace(/[^0-9.]/g, ''))}
                        placeholder="e.g. 6"
                        className={fieldClass}
                    />
                </div>
                <button
                    onClick={handleAdd}
                    disabled={saving}
                    className={primaryButton()}
                >
                    Add pack
                </button>
            </div>

            {/* Loose toggle */}
            <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                    type="checkbox"
                    checked={allowLoose}
                    onChange={toggleLoose}
                    disabled={!looseLoaded}
                    className={checkbox}
                />
                <span className="text-sm text-gray-700">
                    Also count loose {unit}
                </span>
            </label>
        </div>
    )
}