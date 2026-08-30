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
import { ModalSectionBar, sectionBarAction } from './ModalSection'
import AllergenPicker from './AllergenPicker'
import { declaredCount } from '../lib/allergens'

// The five places, in the order the store is walked. The database has the same
// list twice over, as a check on products.section and as a check on
// products.also_in, so anything added here has to go in a migration first.
const SECTIONS = ['Freezer', 'Cold Room', 'Dry', 'Packaging', 'Cleaning']

export default function ProductForm({
  formData, onChange, onSubmit, onCancel, submitLabel, errors,
  priceForm, onPriceChange, priceErrors, priceWarnings, suppliers, nameClash,
  allergens, onAllergenChange, allergensAnswered, onNoAllergens,
  extras, openExtra, onOpenExtra,
}) {
  // Both of these only make sense for something you buy. A mix has no supplier
  // by definition, and its allergens come from its recipe rather than from
  // somebody ticking them, so tagging one here would be a second answer that
  // could disagree with the first.
  const showExtras = extras && !formData.is_mix
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
          {/* Said while it is being typed rather than after it is saved. Two
              products with the same name is nearly always one added twice, and
              the cost of finding out later is a stock take counted against two
              rows. It warns and does not refuse: it is not the app's place to
              say two things cannot share a name. */}
          {!errors.name && nameClash && (
            <p className="text-xs text-amber-700 mt-1">
              There is already a product called {nameClash.name}
              {nameClash.section ? ` in ${nameClash.section}` : ''}.
            </p>
          )}
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

      {/* The two things that used to be somewhere else.
          Setting a price meant saving the product, finding it again in a list
          of a few hundred, opening Prices and starting a second form. The
          allergens were a third screen after that. All of it for things you
          already knew when you typed the name.

          Both closed to start with. Most of the time you are typing a name and
          a section and nothing else, and a form that opens with the fourteen
          allergens showing is a wall. Both stay optional: leave them alone and
          nothing is written, and the save asks once before letting you. */}
      {showExtras && (
        <div className="mb-4">
          <ModalSectionBar
            collapsible
            tone="supplier"
            title="Who you buy it from"
            summary={priceForm?.supplier_id
              ? suppliers.find(s => s.id === priceForm.supplier_id)?.name || 'Set'
              : 'Not set'}
            open={openExtra === 'supplier'}
            onToggle={() => onOpenExtra(openExtra === 'supplier' ? null : 'supplier')}
          />
          {openExtra === 'supplier' && (
            <div className="mb-4">
              <p className="text-xs text-gray-400 mb-3">
                Optional. Leave the supplier empty and you can add prices later from the
                product's own Prices screen.
              </p>
              <PriceFields
                formData={priceForm}
                onChange={onPriceChange}
                errors={priceErrors}
                warnings={priceWarnings}
                suppliers={suppliers}
                unit={formData.unit}
              />
            </div>
          )}

          {/* Nothing to declare is an answer, and for most of the shelf it is
              the right one. It used to be the one answer you could not give
              without opening the section and setting something, so a bag of
              rice with genuinely no allergens read the same as one nobody had
              looked at. The button says it in one tap from the bar. */}
          <ModalSectionBar
            collapsible
            tone="allergens"
            title="Allergens"
            summary={(() => {
              const set = declaredCount(allergens)
              if (set > 0) return `${set} of 14`
              return allergensAnswered ? 'None of the 14' : 'Not answered'
            })()}
            action={!allergensAnswered && declaredCount(allergens) === 0 && (
              <button type="button" onClick={onNoAllergens} className={sectionBarAction}>
                Declare the product has no allergens
              </button>
            )}
            open={openExtra === 'allergens'}
            onToggle={() => onOpenExtra(openExtra === 'allergens' ? null : 'allergens')}
          />
          {openExtra === 'allergens' && (
            <div className="mb-4">
              <p className="text-xs text-gray-400 mb-3">
                The fourteen the law names. Not Present is the answer for most of them, so
                only change the ones that apply. This is what the public allergen page shows
                customers, and every dish the product goes into inherits it.
              </p>
              <AllergenPicker values={allergens} onChange={onAllergenChange} />
            </div>
          )}
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