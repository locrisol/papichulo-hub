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
import ProductSelect from './ProductSelect'
import QuantityInUnit from './QuantityInUnit'
import { ModalSectionBar, sectionBarAction } from './ModalSection'
import AllergenPicker from './AllergenPicker'
import { declaredCount } from '../lib/allergens'
import { nameClashMessage, declaresAllergens } from '../lib/products'

// The five places, in the order the store is walked. The database has the same
// list twice over, as a check on products.section and as a check on
// products.also_in, so anything added here has to go in a migration first.
const SECTIONS = ['Freezer', 'Cold Room', 'Dry', 'Packaging', 'Cleaning']


export default function ProductForm({
  formData, onChange, onSubmit, onCancel, submitLabel, errors,
  priceForm, onPriceChange, priceErrors, suppliers, nameClash,
  recipe, onRecipeChange, ingredientOptions,
  allergens, onAllergenChange, allergensAnswered, onNoAllergens,
  extras, openExtra, onOpenExtra,
}) {
  // Both of these only make sense for something you buy. A mix has no supplier
  // by definition, and its allergens come from its recipe rather than from
  // somebody ticking them, so tagging one here would be a second answer that
  // could disagree with the first.
  const showExtras = extras && !formData.is_mix
  // Cleaning and packaging still have a supplier, they just have nothing to
  // declare. So only the allergens go, not the whole block.
  const showAllergens = showExtras && declaresAllergens(formData)
  const showRecipe = extras && formData.is_mix
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
          {/* Said while it is being typed rather than after it is saved, and it
              stops the save. Two products with the same name is one added
              twice, and on a stock take they are counted separately and neither
              total is right. Nobody standing at a shelf with two identical rows
              in front of them can tell which one they are meant to be in. */}
          {!errors.name && nameClash && (
            <p className="text-xs text-red-600 mt-1">{nameClashMessage(nameClash)}</p>
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

        {/* Only on something we make. It is about what a batch loses between
            the raw weight going in and the finished weight coming out, which
            is not a question you can ask about a case of tomatoes. */}
        {formData.is_mix && (
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
              : <p className="text-xs text-gray-400 mt-1">Prepped cost = raw cost / (1 - weight loss). Leave at 0 if none.</p>}
          </div>
        )}
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

      {/* The other thing a product can be. It changes one thing only, which is
          that a drink is never offered as an ingredient in a MIX: every can in
          the fridge used to sit in that list and they are never the answer.
          It is counted on a stock take like everything else. */}
      <div className="mb-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={(formData.category || 'ingredient') === 'drink'}
            onChange={e => onChange('category', e.target.checked ? 'drink' : 'ingredient')}
            className="w-4 h-4 accent-accent"
          />
          <span className="text-sm text-gray-700">
            This is a drink (counted as normal, never an ingredient in a MIX)
          </span>
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
      {/* What goes into it, while you are already here.
          Same shape as the supplier and the allergens on a bought product: a
          bar that says what it holds, shut to start with. A recipe cannot be
          written against a product that does not exist yet, so what is typed
          here is held until the product is saved and written straight after
          it. Anything finer, notes on a line or changing one later, is the
          recipe screen's job and always was. */}
      {showRecipe && (
        <div className="mb-4">
          <ModalSectionBar
            collapsible
            tone="recipe"
            title="What goes into it"
            summary={recipe.lines.length === 0
              ? 'Nothing yet'
              : `${recipe.lines.length} ${recipe.lines.length === 1 ? 'ingredient' : 'ingredients'}`}
            open={openExtra === 'recipe'}
            onToggle={() => onOpenExtra(openExtra === 'recipe' ? null : 'recipe')}
          />
          {openExtra === 'recipe' && (
            <div className="mb-4">
              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Batch yield
                </label>
                <QuantityInUnit
                  value={recipe.batchYield}
                  onChange={v => onRecipeChange({ ...recipe, batchYield: v })}
                  unit={formData.unit}
                  className="max-w-xs"
                />
                <p className="text-xs text-gray-400 mt-1">
                  What one batch comes out at. It is what the cost of the batch is divided by
                  to get a cost per {formData.unit}.
                </p>
              </div>

              {recipe.lines.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden mb-3">
                  {recipe.lines.map((line, i) => {
                    const ingredient = ingredientOptions.find(p => p.id === line.ingredient_product_id)
                    return (
                      <div
                        key={line.ingredient_product_id}
                        className={`flex items-center gap-3 px-3 py-2 text-sm ${
                          i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                        }`}
                      >
                        <span className="font-medium text-gray-900 flex-1 min-w-0 truncate">
                          {ingredient?.name || 'Gone'}
                        </span>
                        <span className="text-muted whitespace-nowrap">
                          {line.quantity} {ingredient?.unit || ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => onRecipeChange({
                            ...recipe,
                            lines: recipe.lines.filter(l => l.ingredient_product_id !== line.ingredient_product_id),
                          })}
                          className="text-red-600 hover:text-red-800 text-xs font-semibold"
                        >
                          Remove
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Ingredient
                  </label>
                  <ProductSelect
                    value={recipe.draft.ingredient_product_id}
                    onChange={v => onRecipeChange({
                      ...recipe,
                      draft: { ...recipe.draft, ingredient_product_id: v },
                    })}
                    products={ingredientOptions.filter(p =>
                      !recipe.lines.some(l => l.ingredient_product_id === p.id))}
                    placeholder="Select an ingredient..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    How much
                  </label>
                  <QuantityInUnit
                    value={recipe.draft.quantity}
                    onChange={v => onRecipeChange({ ...recipe, draft: { ...recipe.draft, quantity: v } })}
                    unit={ingredientOptions.find(p => p.id === recipe.draft.ingredient_product_id)?.unit}
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={!recipe.draft.ingredient_product_id || !(parseFloat(recipe.draft.quantity) > 0)}
                onClick={() => onRecipeChange({
                  ...recipe,
                  lines: [...recipe.lines, { ...recipe.draft }],
                  draft: { ingredient_product_id: '', quantity: '' },
                })}
                className="mt-3 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Add ingredient
              </button>
            </div>
          )}
        </div>
      )}

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
          {showAllergens && <ModalSectionBar
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
          />}
          {showAllergens && openExtra === 'allergens' && (
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