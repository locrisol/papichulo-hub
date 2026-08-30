// The add and edit form for one supplier price on a product.
//
// A supplier sells the same thing in more than one way, so a price is either for
// a full case or for a loose unit, and purchase_type says which. That choice
// changes what you have to fill in, which is why the form splits on it rather
// than showing every box at once:
//   case   price per case and units per case, and the price per unit is worked
//          out from those two
//   loose  the price per unit typed straight in
//
// The database has a check constraint on purchase_type allowing only those two.
//
// previewPerUnit shows the division as you type. It is only a preview, the real
// value is worked out again on save, but seeing it immediately catches a units
// per case that was entered wrong, which otherwise quietly moves the cost of
// every dish the product goes into.
import { numberField } from '../lib/numberInput'
import { perUnitPreview } from '../lib/productPrice'

// The boxes on their own, with no form around them.
//
// Split out because the product form asks the same questions now: adding a
// product and saying who you buy it from used to be three trips, and one of
// them was hunting the product back down in a list. Two copies of these boxes
// would have drifted the first time either was touched.
export function PriceFields({ formData, onChange, errors = {}, suppliers, unit }) {
  const isCase = formData.purchase_type === 'case'
  const previewPerUnit = perUnitPreview(formData)

  return (
    <>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Supplier</label>
          <select
            value={formData.supplier_id}
            onChange={e => onChange('supplier_id', e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
          >
            <option value="">Select a supplier...</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {errors.supplier_id && <p className="text-xs text-red-600 mt-1">{errors.supplier_id}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Purchase Type</label>
          <div className="flex gap-4 mt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={formData.purchase_type === 'case'}
                onChange={() => onChange('purchase_type', 'case')}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-sm text-gray-700">Case</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={formData.purchase_type === 'loose'}
                onChange={() => onChange('purchase_type', 'loose')}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-sm text-gray-700">Loose</span>
            </label>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Supplier Code (optional)</label>
        <input
          type="text"
          value={formData.supplier_code}
          onChange={e => onChange('supplier_code', e.target.value)}
          placeholder="e.g. CHKN-BRS-5KG"
          className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
        />
      </div>

      {isCase ? (
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Price per Case (€)</label>
            <input
              {...numberField({
                value: formData.price_per_case,
                onChange: v => onChange('price_per_case', v),
              })}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
            />
            {errors.price_per_case && <p className="text-xs text-red-600 mt-1">{errors.price_per_case}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Units per Case ({unit || '...'})
            </label>
            <input
              {...numberField({
                value: formData.units_per_case,
                onChange: v => onChange('units_per_case', v),
              })}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
            />
            {errors.units_per_case && <p className="text-xs text-red-600 mt-1">{errors.units_per_case}</p>}
          </div>
          <div className="col-span-2">
            <p className="text-xs text-gray-500">
              {previewPerUnit !== null
                ? `Calculated cost per ${unit}: €${previewPerUnit.toFixed(4)}`
                : `Cost per ${unit || 'unit'} will be calculated automatically when you fill both fields.`}
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Price per {unit || 'unit'} (€)
          </label>
          <input
            {...numberField({
              value: formData.price_per_unit,
              onChange: v => onChange('price_per_unit', v),
            })}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
          />
          {errors.price_per_unit && <p className="text-xs text-red-600 mt-1">{errors.price_per_unit}</p>}
        </div>
      )}

    </>
  )
}

// The add and edit form for one supplier price on a product.
//
// The database has a check constraint on purchase_type allowing only case and
// loose, and the arithmetic behind both lives in lib/productPrice.
export default function PriceForm({
  formData, onChange, onSubmit, onCancel, submitLabel, errors, suppliers, unit,
}) {
  return (
    <form onSubmit={onSubmit}>
      <PriceFields
        formData={formData}
        onChange={onChange}
        errors={errors}
        suppliers={suppliers}
        unit={unit}
      />

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