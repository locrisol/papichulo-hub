import { useState, useEffect } from 'react'
import { numberField } from '@/lib/numberInput'
import { fieldClass, compactField } from '@/lib/controlStyles'

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
        // The fetch sets a loading state before it starts, which is one render
        // this rule would rather avoid. The alternative is to leave it,
        // and then a change of unit keeps the previous one's figures
        // on screen under the new one's heading until the answer arrives.
        // eslint-disable-next-line react-hooks/set-state-in-effect
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

    // The shared boxes, so they are 16px on a phone like every other box and an
    // iPhone does not zoom in on them. Both carry w-full, so the widths are on
    // the wrappers: the amount takes whatever the unit leaves, and the unit is
    // wide enough for "Litre" and no wider, which leaves the amount most of a
    // 360px row. The wrapper is a flex box so the unit stretches to the
    // amount's height.
    const off = 'disabled:bg-gray-100 disabled:text-gray-400'

    return (
        <div className={`flex gap-2 ${className}`}>
            <div className="flex-1 min-w-0">
                <input
                    {...numberField({ value: shown(), onChange: typed })}
                    disabled={disabled}
                    className={`${fieldClass} ${off}`}
                />
            </div>
            {canSplit ? (
                <div className="w-24 flex-shrink-0 flex">
                    <select
                        value={displayUnit}
                        onChange={e => setDisplayUnit(e.target.value)}
                        aria-label="Unit"
                        disabled={disabled}
                        className={`${compactField} ${off}`}
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
                </div>
            ) : (
                <span className="flex items-center px-3 py-2 text-sm text-muted border border-border rounded-lg bg-gray-50 whitespace-nowrap">
                    {unit || 'unit'}
                </span>
            )}
        </div>
    )
}
