import { PLACES } from '@/lib/brandVersions'
import { labelClass, fieldClass, hintClass, chip } from '@/lib/controlStyles'

// Where the open restaurant keeps a product: the main place, which the stock
// take lists it under first, and the other places it is counted in as well.
// Each restaurant says its own (see lib/keptHere), so moving the tortillas
// here moves nothing at the other one. The product's section is a different
// thing, what the product is, and this leaves it alone.
//
// `value` is { section, also_in } and onChange is given the next one. Used by
// the product form, which saves it with the rest, and by the Prices page,
// which saves each change as it is made.
export default function KeptHereFields({ restaurantName, value, onChange, disabled = false, idPrefix = 'kept' }) {
    const alsoIn = value?.also_in || []
    const here = restaurantName ? `at ${restaurantName}` : 'here'

    return (
        <div>
            <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
                <div>
                    <label className={labelClass} htmlFor={`${idPrefix}-main`}>Kept {here} in</label>
                    <select
                        id={`${idPrefix}-main`}
                        value={value?.section || PLACES[0]}
                        disabled={disabled}
                        onChange={e => onChange({ section: e.target.value, also_in: alsoIn.filter(place => place !== e.target.value) })}
                        className={fieldClass}
                    >
                        {PLACES.map(place => <option key={place} value={place}>{place}</option>)}
                    </select>
                </div>
                <div>
                    <p className={labelClass}>Also kept in</p>
                    <div className="flex flex-wrap gap-1.5">
                        {PLACES.filter(place => place !== value?.section).map(place => {
                            const on = alsoIn.includes(place)
                            return (
                                <button
                                    key={place}
                                    type="button"
                                    aria-pressed={on}
                                    disabled={disabled}
                                    onClick={() => onChange({
                                        section: value?.section || PLACES[0],
                                        also_in: on ? alsoIn.filter(x => x !== place) : [...alsoIn, place],
                                    })}
                                    className={chip(on)}
                                >
                                    {place}
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>
            <p className={hintClass}>
                Where it is counted on a stock take {here}. Each restaurant sets its own.
            </p>
        </div>
    )
}
