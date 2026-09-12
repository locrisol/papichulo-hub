import { useState, useEffect } from 'react'
import { numberField } from '../lib/numberInput'

// A quantity typed in whichever unit suits the hand writing it.
//
// Everything is stored in the product's own unit, KG for anything measured in
// KG, because that is what the cost calculation expects and it never sees
// anything else. What this adds is a friendlier way to type it: recipes are
// full of small amounts and nobody wants to write 0.04 KG for forty grams.
//
// The unit on screen is only ever a display choice. It never changes what is
// stored, and switching it does not change the amount, only how it reads.
//
// It lives on its own because two screens ask for a recipe quantity now, the
// recipe page and the product form, and a gram on one that is a kilo on the
// other is the kind of difference nobody notices until a dish is costed wrong.
export default function QuantityInUnit({ value, onChange, unit, disabled = false, className = '' }) {
    const canSplit = unit === 'KG' || unit === 'Litre'
    const [displayUnit, setDisplayUnit] = useState(unit || 'unit')

    // A new ingredient means a new canonical unit, so the display goes back to
    // the small one, which is what a recipe is usually written in.
    useEffect(() => {
        if (unit === 'KG') setDisplayUnit('g')
        else if (unit === 'Litre') setDisplayUnit('ml')
        else setDisplayUnit(unit || 'unit')
    }, [unit])

    const small = displayUnit === 'g' || displayUnit === 'ml'

    function shown() {
        if (!value) return ''
        const stored = parseFloat(value)
        if (isNaN(stored)) return value
        return small ? String(stored * 1000) : value
    }

    function typed(next) {
        if (next === '') { onChange(''); return }
        const num = parseFloat(next)
        if (isNaN(num)) { onChange(next); return }
        onChange(small ? (num / 1000).toString() : next)
    }

    return (
        <div className={`flex gap-2 ${className}`}>
            <input
                {...numberField({ value: shown(), onChange: typed })}
                disabled={disabled}
                className="flex-1 min-w-0 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white disabled:bg-gray-100 disabled:text-gray-400"
            />
            {canSplit ? (
                <select
                    value={displayUnit}
                    onChange={e => setDisplayUnit(e.target.value)}
                    aria-label="Unit"
                    disabled={disabled}
                    className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white disabled:bg-gray-100 disabled:text-gray-400"
                >
                    {unit === 'KG' ? (
                        <>
                            <option value="KG">KG</option>
                            <option value="g">g</option>
                        </>
                    ) : (
                        <>
                            <option value="Litre">Litre</option>
                            <option value="ml">ml</option>
                        </>
                    )}
                </select>
            ) : (
                <span className="px-3 py-2 text-sm text-gray-500 border border-border rounded-lg bg-gray-50 whitespace-nowrap">
                    {unit || 'unit'}
                </span>
            )}
        </div>
    )
}
