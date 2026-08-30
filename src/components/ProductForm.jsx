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
import { numberField } from '../lib/numberInput'
import { PriceFields } from './PriceForm'

// The five places, in the order the store is walked. The database has the same
// list twice over, as a check on products.section and as a check on
// products.also_in, so anything added here has to go in a migration first.
const SECTIONS = ['Freezer', 'Cold Room', 'Dry', 'Packaging', 'Cleaning']

export default function ProductForm({
  formData, onChange, onSubmit, onCancel, submitLabel, errors,
  priceForm, onPriceChange, priceErrors, suppliers, showPrice,
}) {
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
            {SECTIONS.map(section => <option key={section}>{section}</option>)}
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
            {...numberField({
              value: formData.weight_loss_pct,
              onChange: v => onChange('weight_loss_pct', v),
            })}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
          />
          {errors.weight_loss_pct
            ? <p className="text-xs text-red-600 mt-1">{errors.weight_loss_pct}</p>
            : <p className="text-xs text-gray-400 mt-1">Prepped cost = raw cost ÷ (1 - weight loss). Leave at 0 if none.</p>}
        </div>
      </div>

      {/* Where else it turns up.
          Not a second section. The section above is what the product is, and
          the costing and the reports read that and only that. This is about
          where somebody with a clipboard will find it: tacos live in the
          freezer and there are two boxes in the cold room defrosting, and on a
          count they were being missed because the screen only ever showed them
          under one heading. */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Also kept in
        </label>
        <div className="flex flex-wrap gap-2">
          {SECTIONS.filter(section => section !== formData.section).map(section => {
            const on = (formData.also_in || []).includes(section)
            return (
              <label
                key={section}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
                  on
                    ? 'bg-accent-light border-accent text-accent-ink font-semibold'
                    : 'bg-white border-border text-gray-700 hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={e => onChange(
                    'also_in',
                    e.target.checked
                      ? [...(formData.also_in || []), section]
                      : (formData.also_in || []).filter(x => x !== section),
                  )}
                  className="w-4 h-4 accent-accent"
                />
                {section}
              </label>
            )
          })}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Only changes where it shows up on a stock take. Leave these alone for
          nearly everything.
        </p>
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

      {/* Who you buy it from, while you are already here.
          Setting a price used to mean saving the product, finding it again in
          a list of a few hundred, opening Prices and starting a second form.
          Three screens for one thing you already knew when you typed the name.

          Optional, and it stays optional: leave the supplier empty and nothing
          is written. A price given here becomes the preferred one, because it
          is the only one. */}
      {showPrice && !formData.is_mix && (
        <div className="border-t border-border pt-4 mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            Who you buy it from
          </p>
          <p className="text-xs text-gray-400 mb-3">
            Optional. Leave the supplier empty and you can add prices later from the
            product's own Prices screen.
          </p>
          <PriceFields
            formData={priceForm}
            onChange={onPriceChange}
            errors={priceErrors}
            suppliers={suppliers}
            unit={formData.unit}
          />
        </div>
      )}

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