// The add and edit form for a product.
//
// It holds no state of its own. The page owns the values and the validation and
// passes them down, which is why the same form works for adding a new product
// and for editing one in place in the table without behaving differently.
//
// The section and unit lists are not free text. products has a check constraint
// on both, so anything not in these lists is refused by the database rather than
// saved as a typo. If one is ever added it has to go in a migration first.
//   section  Freezer, Cold Room, Dry, Packaging, Cleaning
//   unit     KG, Units, Litre
export default function ProductForm({ formData, onChange, onSubmit, onCancel, submitLabel, errors }) {
  return (
    <form onSubmit={onSubmit}>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={e => onChange('name', e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
          />
          {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Section</label>
          <select
            value={formData.section}
            onChange={e => onChange('section', e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
          >
            <option>Freezer</option>
            <option>Cold Room</option>
            <option>Dry</option>
            <option>Packaging</option>
            <option>Cleaning</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Unit</label>
          <select
            value={formData.unit}
            onChange={e => onChange('unit', e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
          >
            <option>KG</option>
            <option>Units</option>
            <option>Litre</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Weight Loss %</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={formData.weight_loss_pct}
            onChange={e => onChange('weight_loss_pct', e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
          />
          {errors.weight_loss_pct
            ? <p className="text-xs text-red-600 mt-1">{errors.weight_loss_pct}</p>
            : <p className="text-xs text-gray-400 mt-1">Prepped cost = raw cost ÷ (1 - weight loss). Leave at 0 if none.</p>}
        </div>
      </div>

      <div className="mb-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.is_mix}
            onChange={e => onChange('is_mix', e.target.checked)}
            className="w-4 h-4 accent-accent"
          />
          <span className="text-sm text-gray-700">This is a MIX product (house-made, cost calculated from recipe)</span>
        </label>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes</label>
        <textarea
          value={formData.notes}
          onChange={e => onChange('notes', e.target.value)}
          rows={2}
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