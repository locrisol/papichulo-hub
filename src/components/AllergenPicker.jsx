import { card } from '../lib/controlStyles'
import { ALLERGENS, ALLERGEN_STATES } from '../lib/allergens'

// The fourteen, with three answers each.
//
// This is where the raw answers are set and the only place a person types them
// in. Everything else derives from them: a dish works out its own allergens
// from the products it is made of, so nobody tags a menu item.
//
// It lives in its own component because two screens ask now. The allergen page
// is where you go to fix one, and the product form is where you would rather
// have said it in the first place, while the box is still in your hand.
export default function AllergenPicker({ values, onChange, className = '' }) {
    return (
        <div className={`${card} overflow-hidden ${className}`}>
            {ALLERGENS.map((allergen, i) => (
                <div
                    key={allergen.key}
                    className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 ${
                        i < ALLERGENS.length - 1 ? 'border-b border-border' : ''
                    } ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                >
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{allergen.label}</p>
                        {/* What the same allergen is called on a supplier's
                            sheet. The law's name and the label on the box are
                            rarely the same word. */}
                        {allergen.also && (
                            <p className="text-xs text-muted leading-snug mt-0.5">{allergen.also}</p>
                        )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                        {ALLERGEN_STATES.map(state => {
                            const isActive = values[allergen.key] === state.value
                            return (
                                <button
                                    key={state.value}
                                    type="button"
                                    onClick={() => onChange(allergen.key, state.value)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                        isActive
                                            ? state.activeClass
                                            : 'bg-white text-gray-500 border-border hover:bg-gray-50'
                                    }`}
                                >
                                    {state.label}
                                </button>
                            )
                        })}
                    </div>
                </div>
            ))}
        </div>
    )
}
