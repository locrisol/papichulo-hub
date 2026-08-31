import { useRef, useEffect } from 'react'
import ProductSelect from './ProductSelect'
import QuantityInUnit from './QuantityInUnit'

// One ingredient line on a MIX recipe.
//
// The quantity is always stored in the ingredient's own unit, so KG for anything
// measured in KG. That is what the cost calculation expects and it never sees
// anything else.
//
// Typing it in grams rather than in fractions of a kilo is QuantityInUnit's
// job, which the product form uses as well so a recipe reads the same wherever
// it is written.
export default function RecipeIngredientForm({ formData, onChange, onSubmit, onCancel, submitLabel, errors, availableProducts }) {
  const ingredient = availableProducts.find(p => p.id === formData.ingredient_product_id)
  const ingredientUnit = ingredient?.unit || 'unit'
  const ingredientSelectRef = useRef(null)

  useEffect(() => {
    if (!formData.ingredient_product_id && ingredientSelectRef.current) {
      const scrollContainer = ingredientSelectRef.current.closest('main')
      const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0
      ingredientSelectRef.current.focus({ preventScroll: true })
      if (scrollContainer) scrollContainer.scrollTop = scrollTop
    }
  }, [formData.ingredient_product_id])

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
          <QuantityInUnit
            value={formData.quantity}
            onChange={v => onChange('quantity', v)}
            unit={ingredientUnit}
          />
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