import { labelClass, fieldClass, fieldError, primaryButton, secondaryButton } from '@/lib/controlStyles'
import { useRef, useEffect } from 'react'
import ProductSelect from '@/components/ui/ProductSelect'
import QuantityInUnit from '@/components/ui/QuantityInUnit'
import ErrorBanner from '@/components/ui/ErrorBanner'

// One ingredient line on a MIX recipe.
//
// The quantity is always stored in the ingredient's own unit, so KG for anything
// measured in KG. That is what the cost calculation expects and it never sees
// anything else.
//
// Typing it in grams rather than in fractions of a kilo is QuantityInUnit's
// job, which the product form uses as well so a recipe reads the same wherever
// it is written.
export default function RecipeIngredientForm({ problem, formData, onChange, onSubmit, onCancel, submitLabel, errors, availableProducts, saving = false }) {
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className={labelClass}>Ingredient</label>
          <ProductSelect
            inputRef={ingredientSelectRef}
            value={formData.ingredient_product_id}
            onChange={v => onChange('ingredient_product_id', v)}
            products={availableProducts}
            placeholder="Select an ingredient..."
          />
          {errors.ingredient_product_id && <p className={fieldError}>{errors.ingredient_product_id}</p>}
        </div>

        <div>
          <label className={labelClass}>Quantity</label>
          <QuantityInUnit
            value={formData.quantity}
            onChange={v => onChange('quantity', v)}
            unit={ingredientUnit}
          />
          {errors.quantity && <p className={fieldError}>{errors.quantity}</p>}
        </div>
      </div>

      <div className="mb-4">
        <label className={labelClass}>Notes (optional)</label>
        <input
          type="text"
          value={formData.notes}
          onChange={e => onChange('notes', e.target.value)}
          placeholder="e.g. drained"
          className={fieldClass}
        />
      </div>

      {/* Beside the button that caused it. A message written at the top of
          the page is off the screen when you press Save at the foot of a form
          on a phone, and inside a dialog it is behind the dialog, where it is
          never seen at all. */}
      {problem && (
        <ErrorBanner className="mb-3">{problem}</ErrorBanner>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className={secondaryButton}
        >
          Done
        </button>
        <button
          type="submit"
          disabled={saving}
          className={primaryButton()}
        >
          {saving ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  )
}