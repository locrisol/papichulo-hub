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
import { sectionColour } from '../lib/sections'

// The five places, in the order the store is walked. The database has the same
// list twice over, as a check on products.section and as a check on
// products.also_in, so anything added here has to go in a migration first.
const SECTIONS = ['Freezer', 'Cold Room', 'Dry', 'Packaging', 'Cleaning']


export default function ProductForm({
  formData, onChange, onSubmit, onCancel, submitLabel, errors, heldForNames = [],
  priceForm, onPriceChange, priceErrors, suppliers, nameClash,
  formats, onFormatsChange,
  recipe, onRecipeChange, ingredientOptions,
  allergens, onAllergenChange, allergensAnswered, onNoAllergens,
  extras, openExtra, onOpenExtra,
}) {
  // Both of these only make sense for something you buy. A mix has no supplier
  // by definition, and its allergens come from its recipe rather than from
  // somebody ticking them, so tagging one here would be a second answer that
  // could disagree with the first.
  // The colour of the section being typed into, which the whole form takes a
  // hint of. It is the same colour that section has on the stock take, in the
  // dropdowns and down the side of its rows, so by the time somebody is filling
  // this in they already know what green means.
  const colour = sectionColour(formData.section)

  const fieldCls =
    'w-full border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent'
  const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2'

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
            // The one field that is coloured rather than hinted, since it is
            // the field the hint is coming from.
            style={{ color: colour.ink, borderColor: colour.ink }}
            className="w-full border-2 rounded-lg px-3 py-2 text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {/* Each one in its own colour. An option takes the colour of the
                select unless it is told otherwise, so the whole list was
                turning whatever colour happened to be picked, which is the
                opposite of the point: the list is where you learn what the
                colours mean. */}
            {SECTIONS.map(section => (
              <option key={section} style={{ color: sectionColour(section).ink }}>
                {section}
              </option>
            ))}
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

      {/* Stock we hold that is not ours.
          Pita Pit keep their catering boxes and carrier bags in our packaging
          cupboard. We do not buy them and we do not sell them, we store them
          and count them, so every packaging total quietly included somebody
          else's stock. Naming who it is held for is what lets the report say
          theirs, ours and both.

          Empty is the answer for almost everything, which is why it is a plain
          box near the bottom rather than a question the form leads with. The
          list underneath offers names already in use, so the same arrangement
          is not typed two ways and split into two columns. */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Held for someone else
        </label>
        <input
          type="text"
          list="held-for-names"
          value={formData.held_for || ''}
          onChange={e => onChange('held_for', e.target.value)}
          placeholder="Leave empty if it is ours"
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <datalist id="held-for-names">
          {heldForNames.map(name => <option key={name} value={name} />)}
        </datalist>

        {/* The names already in use, as buttons.
            A datalist alone was not enough: it shows nothing until somebody
            types, and on a phone it barely shows at all, so the one thing that
            stops Pita Pit becoming two columns was the thing nobody could see.
            Tapping one fills the box; Ours empties it. */}
        {heldForNames.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              type="button"
              onClick={() => onChange('held_for', '')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                formData.held_for
                  ? 'bg-white border-border text-gray-600 hover:bg-gray-50'
                  : 'bg-accent border-accent text-white'
              }`}
            >
              Ours
            </button>
            {heldForNames.map(name => (
              <button
                key={name}
                type="button"
                onClick={() => onChange('held_for', name)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  formData.held_for === name
                    ? 'bg-accent border-accent text-white'
                    : 'bg-white border-border text-gray-600 hover:bg-gray-50'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-400 mt-1">
          Counted with ours on every stock take, reported apart from it.
        </p>
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

              {/* How it is counted, while the price it belongs to is being
                  typed. A format turns one pack into the product's own unit,
                  so Box = 6 means one box is 6 KG, and a stock take can be
                  counted the way the product actually sits on the shelf
                  rather than making somebody work out that eleven boxes is
                  sixty six kilos with a phone in their hand.

                  They hang off the price and not off the product, because two
                  suppliers sell the same thing in different sized boxes. That
                  is why they only appear once a supplier is chosen. */}
              {priceForm.supplier_id && (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    How it is counted
                  </p>
                  <p className="text-xs text-gray-400 mb-3">
                    Optional. A pack and what it comes to in {formData.unit}, so a stock take can
                    be counted in boxes rather than in {formData.unit}.
                  </p>

                  {formats.packs.length > 0 && (
                    <div className="border border-border rounded-lg overflow-hidden mb-3 bg-white">
                      {formats.packs.map((pack, i) => (
                        <div
                          key={pack.label}
                          className={`flex items-center gap-3 px-3 py-2 text-sm ${
                            i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                          }`}
                        >
                          <span className="font-medium text-gray-900 flex-1 min-w-0 truncate">
                            {pack.label}
                          </span>
                          <span className="text-muted whitespace-nowrap">
                            = {pack.factor} {formData.unit}
                          </span>
                          <button
                            type="button"
                            onClick={() => onFormatsChange({
                              ...formats,
                              packs: formats.packs.filter(x => x.label !== pack.label),
                            })}
                            className="text-red-600 hover:text-red-800 text-xs font-semibold"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Pack</label>
                      <input
                        type="text"
                        value={formats.draft.label}
                        onChange={e => onFormatsChange({
                          ...formats,
                          draft: { ...formats.draft, label: e.target.value },
                        })}
                        placeholder="Box, Bag, Tin"
                        className={fieldCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>One of them is</label>
                      <input
                        {...numberField({
                          value: formats.draft.factor,
                          onChange: v => onFormatsChange({
                            ...formats,
                            draft: { ...formats.draft, factor: v },
                          }),
                        })}
                        placeholder={formData.unit}
                        className={fieldCls}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 mt-3">
                    <button
                      type="button"
                      disabled={!formats.draft.label.trim()
                        || !(parseFloat(formats.draft.factor) > 0)
                        || formats.packs.some(x => x.label === formats.draft.label.trim())}
                      onClick={() => onFormatsChange({
                        ...formats,
                        packs: [...formats.packs, {
                          label: formats.draft.label.trim(),
                          factor: parseFloat(formats.draft.factor),
                        }],
                        draft: { label: '', factor: '' },
                      })}
                      className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                    >
                      Add pack
                    </button>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formats.allowLoose}
                        onChange={e => onFormatsChange({ ...formats, allowLoose: e.target.checked })}
                        className="w-4 h-4 accent-accent"
                      />
                      <span className="text-sm text-gray-700">
                        Also count loose {formData.unit}
                      </span>
                    </label>
                  </div>
                </div>
              )}
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