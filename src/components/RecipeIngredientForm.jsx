import { useRef, useEffect, useState } from 'react'
import { numberField } from '../lib/numberInput'
import ProductSelect from './ProductSelect'

// One ingredient line on a MIX recipe.
//
// The quantity is always stored in the ingredient's own unit, so KG for anything
// measured in KG. That is what the cost calculation expects and it never sees
// anything else.
//
// What this form adds on top is a friendlier way to type it. Recipes are full of
// small amounts, and nobody wants to write 0.04 KG for forty grams, so the box
// can display grams or millilitres and converts back before saving. The unit on
// screen is only ever a display choice, it never changes what is stored.
export default function RecipeIngredientForm({ formData, onChange, onSubmit, onCancel, submitLabel, errors, availableProducts }) {
  const ingredient = availableProducts.find(p => p.id === formData.ingredient_product_id)
  const ingredientUnit = ingredient?.unit || 'unit'
  const ingredientSelectRef = useRef(null)
  const [displayUnit, setDisplayUnit] = useState(ingredientUnit)

  useEffect(() => {
    if (!formData.ingredient_product_id && ingredientSelectRef.current) {
      const scrollContainer = ingredientSelectRef.current.closest('main')
      const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0
      ingredientSelectRef.current.focus({ preventScroll: true })
      if (scrollContainer) scrollContainer.scrollTop = scrollTop
    }
  }, [formData.ingredient_product_id])

  // When the ingredient changes (and so the canonical unit), reset the
  // display unit to the canonical one. The user can then switch to g/ml
  // if they prefer typing in smaller units.
  useEffect(() => {
    if (ingredientUnit === 'KG') setDisplayUnit('g')
    else if (ingredientUnit === 'Litre') setDisplayUnit('ml')
    else setDisplayUnit(ingredientUnit)
  }, [ingredientUnit])

  // Converts the canonical stored value to what should appear in the input,
  // based on the current display unit. KG stored as 0.04 with display unit
  // 'g' shows as 40.
  function getDisplayValue() {
    if (!formData.quantity) return ''
    const stored = parseFloat(formData.quantity)
    if (isNaN(stored)) return formData.quantity
    if (displayUnit === 'g' || displayUnit === 'ml') {
      return (stored * 1000).toString()
    }
    return formData.quantity
  }

  // The reverse: user types in the display unit, we store in the canonical
  // unit. User types 40 with display unit 'g', we store 0.04.
  function handleDisplayChange(value) {
    if (value === '') {
      onChange('quantity', '')
      return
    }
    const num = parseFloat(value)
    if (isNaN(num)) {
      onChange('quantity', value)
      return
    }
    if (displayUnit === 'g' || displayUnit === 'ml') {
      onChange('quantity', (num / 1000).toString())
    } else {
      onChange('quantity', value)
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Ingredient</label>
          <ProductSelect
            inputRef={ingredientSelectRef}
            value={formData.ingredient_product_id}
            onChange={v => onChange('ingredient_product_id', v)}
            products={availableProducts}
            placeholder="Select an ingredient..."
          />
          {errors.ingredient_product_id && <p className="text-xs text-red-600 mt-1">{errors.ingredient_product_id}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Quantity</label>
          <div className="flex gap-2">
            <input
              {...numberField({
                value: getDisplayValue(),
                onChange: handleDisplayChange,
              })}
              className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
            />
            {(ingredientUnit === 'KG' || ingredientUnit === 'Litre') ? (
              <select
                value={displayUnit}
                onChange={e => setDisplayUnit(e.target.value)}
                className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
              >
                {ingredientUnit === 'KG' ? (
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
              <span className="px-3 py-2 text-sm text-gray-500 border border-border rounded-lg bg-gray-50">
                {ingredientUnit}
              </span>
            )}
          </div>
          {errors.quantity && <p className="text-xs text-red-600 mt-1">{errors.quantity}</p>}
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes (optional)</label>
        <input
          type="text"
          value={formData.notes}
          onChange={e => onChange('notes', e.target.value)}
          placeholder="e.g. finely chopped, drained, etc."
          className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
        />
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-green-600 text-green-700 text-sm font-medium rounded-lg hover:bg-green-50 bg-white transition-colors"
        >
          Done
        </button>
      </div>
    </form>
  )
}