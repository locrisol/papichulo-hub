export default function RecipeIngredientForm({ formData, onChange, onSubmit, onCancel, submitLabel, errors, availableProducts }) {
  const ingredient = availableProducts.find(p => p.id === formData.ingredient_product_id)
  const ingredientUnit = ingredient?.unit || 'unit'

  return (
    <form onSubmit={onSubmit}>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Ingredient</label>
          <select
            value={formData.ingredient_product_id}
            onChange={e => onChange('ingredient_product_id', e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
          >
            <option value="">Select an ingredient...</option>
            {availableProducts.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.unit})
              </option>
            ))}
          </select>
          {errors.ingredient_product_id && <p className="text-xs text-red-600 mt-1">{errors.ingredient_product_id}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Quantity ({ingredientUnit})
          </label>
          <input
            type="number"
            step={ingredientUnit === 'KG' || ingredientUnit === 'Litre' ? '0.001' : '1'}
            min="0"
            value={formData.quantity}
            onChange={e => onChange('quantity', e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
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
          className="px-4 py-2 border border-border text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 bg-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
