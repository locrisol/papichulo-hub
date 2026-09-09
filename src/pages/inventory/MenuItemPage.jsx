import { useState, useEffect, useRef, Fragment } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useRestaurant } from '../../context/RestaurantContext'
import { calculateMixCost, menuItemCost } from '../../lib/mixCost'
import { deriveMenuItemAllergens, ALLERGEN_KEYS } from '../../lib/allergens'
import { friendlyError } from '../../lib/errors'
import { canBeMenuComponent } from '../../lib/products'
import { tableHeadRow, card, rowButton, secondaryButton, cardEdge, cardHeader } from '../../lib/controlStyles'
import { useConfirm } from '../../context/ConfirmContext'
import Modal from '../../components/Modal'
import AddOptions from '../../components/menu/AddOptions'
import ProductSelect from '../../components/ProductSelect'
import QuantityInUnit from '../../components/QuantityInUnit'
import { numberField } from '../../lib/numberInput'
import BackButton from '../../components/BackButton'

// One dish: what it is made of, what it costs, and what it contains.
//
// The menu items list shows all the dishes at once. This is the screen where you
// actually build one, by adding components. A component points at a product,
// bought or made in house, with a quantity.
//
// The three numbers on this page all come from somewhere else and none of them
// are stored. The cost is added up from the components using this restaurant's
// preferred prices, the margin comes off that against the net selling price, and
// the allergens are derived by following each component down through its recipe.
// Nothing here is typed in twice, so nothing can disagree with itself.
//
// The same product cannot be added twice to one dish. That is a unique
// constraint on menu_item_components rather than a check in this file, so it
// holds however the row got there.

const MARGIN_GREEN = 65
const MARGIN_AMBER = 60

const ALLERGEN_LABELS = {
  gluten: 'Gluten', crustaceans: 'Crustaceans', eggs: 'Eggs', fish: 'Fish',
  peanuts: 'Peanuts', soybeans: 'Soybeans', milk: 'Milk', nuts: 'Nuts',
  celery: 'Celery', mustard: 'Mustard', sesame: 'Sesame', sulphites: 'Sulphites',
  lupin: 'Lupin', molluscs: 'Molluscs',
}

function emptyComponentForm() {
  return {
    product_id: '', quantity: '', no_quantity: false, notes: '',
    choice_group: '', list_separately: false,
  }
}

function emptyHeaderForm(item) {
  return {
    name: item?.name || '',
    sheet_name: item?.sheet_name || '',
    category_id: item?.category_id || '',
    selling_price: item?.selling_price ?? '',
    vat_rate: item?.vat_rate ?? '0',
    notes: item?.notes || '',
  }
}

export default function MenuItemPage() {
  const { id } = useParams()
  const { activeRestaurant } = useRestaurant()
  const confirm = useConfirm()

  const [item, setItem] = useState(null)
  const [categories, setCategories] = useState([])
  const [allMenuItems, setAllMenuItems] = useState([])
  const [allComponents, setAllComponents] = useState([])
  const [showSeveral, setShowSeveral] = useState(false)
  const [products, setProducts] = useState([])
  const [components, setComponents] = useState([])
  const [recipeLines, setRecipeLines] = useState([])
  const [prices, setPrices] = useState([])
  const [allergens, setAllergens] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [headerForm, setHeaderForm] = useState(emptyHeaderForm(null))
  const [headerErrors, setHeaderErrors] = useState({})
  const [headerSaving, setHeaderSaving] = useState(false)
  const [headerSavedMessage, setHeaderSavedMessage] = useState('')

  const [showComponentForm, setShowComponentForm] = useState(false)
  const [editingComponent, setEditingComponent] = useState(null)
  const [componentForm, setComponentForm] = useState(emptyComponentForm())
  const [componentErrors, setComponentErrors] = useState({})

  const productSelectRef = useRef(null)

  useEffect(() => {
    fetchAll()
  }, [id])

  useEffect(() => {
    if (!activeRestaurant) return
    fetchPrices()
  }, [activeRestaurant])

  useEffect(() => {
    // Auto-focus the product dropdown after the form clears (post-add)
    if (showComponentForm && !componentForm.product_id && productSelectRef.current) {
      const scrollContainer = productSelectRef.current.closest('main')
      const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0
      productSelectRef.current.focus({ preventScroll: true })
      if (scrollContainer) scrollContainer.scrollTop = scrollTop
    }
  }, [componentForm.product_id, showComponentForm])

  async function fetchAll() {
    setLoading(true)
    const [
      itemRes, categoriesRes, productsRes, componentsRes, recipesRes, allergensRes,
      // Every menu item and every component, for the Add several picker: it
      // fills its list from a category, and a category is menu items rather
      // than products.
      allItemsRes, allComponentsRes,
    ] = await Promise.all([
      supabase.from('menu_items').select('*').eq('id', id).single(),
      supabase.from('menu_categories').select('*').order('sort_order'),
      supabase.from('products').select('*').eq('is_active', true).order('name'),
      supabase.from('menu_item_components').select('*').eq('menu_item_id', id),
      supabase.from('mix_recipes').select('*'),
      supabase.from('product_allergens').select('*'),
      supabase.from('menu_items').select('*').eq('is_active', true).order('name'),
      supabase.from('menu_item_components').select('*'),
    ])

    if (itemRes.error) { setError(friendlyError(itemRes.error)); setLoading(false); return }
    setItem(itemRes.data)
    setHeaderForm(emptyHeaderForm(itemRes.data))

    if (categoriesRes.data) setCategories(categoriesRes.data)
    if (productsRes.data) setProducts(productsRes.data)
    if (componentsRes.data) setComponents(componentsRes.data)
    if (recipesRes.data) setRecipeLines(recipesRes.data)
    if (allergensRes.data) setAllergens(allergensRes.data)
    if (allItemsRes.data) setAllMenuItems(allItemsRes.data)
    if (allComponentsRes.data) setAllComponents(allComponentsRes.data)

    setLoading(false)
  }

  async function fetchPrices() {
    const { data } = await supabase
      .from('product_supplier_prices')
      .select('*')
      .eq('restaurant_id', activeRestaurant.id)
      .eq('is_preferred', true)
    if (data) setPrices(data)
  }

  function handleHeaderChange(field, value) {
    setHeaderForm({ ...headerForm, [field]: value })
    setHeaderSavedMessage('')
  }

  function validateHeader() {
    const e = {}
    if (!headerForm.name.trim()) e.name = 'Name is required'
    if (!headerForm.category_id) e.category_id = 'Category is required'
    const price = parseFloat(headerForm.selling_price)
    if (isNaN(price) || price < 0) e.selling_price = 'Selling price must be 0 or more'
    const vat = parseFloat(headerForm.vat_rate)
    if (isNaN(vat) || vat < 0 || vat > 100) e.vat_rate = 'VAT rate must be 0–100'
    return e
  }

  async function saveHeader() {
    setError('')
    setHeaderSavedMessage('')
    const e = validateHeader()
    if (Object.keys(e).length) { setHeaderErrors(e); return }
    setHeaderErrors({})
    setHeaderSaving(true)

    const payload = {
      name: headerForm.name.trim(),
      category_id: headerForm.category_id,
      selling_price: parseFloat(headerForm.selling_price),
      vat_rate: parseFloat(headerForm.vat_rate),
      notes: headerForm.notes || null,
      // Empty means it goes under its own name, so there is nothing to store.
      sheet_name: headerForm.sheet_name?.trim() || null,
    }

    const { error: err } = await supabase
      .from('menu_items')
      .update(payload)
      .eq('id', id)

    if (err) setError(friendlyError(err))
    else {
      setHeaderSavedMessage('Saved')
      fetchAll()
    }
    setHeaderSaving(false)
  }

  function handleComponentChange(field, value) {
    setComponentForm({ ...componentForm, [field]: value })
  }

  function validateComponent() {
    const e = {}
    if (!componentForm.product_id) e.product_id = 'Product is required'
    // Nothing to check when nobody can say. That is the whole point of the
    // tick, and it is a different answer from zero, which would mean somebody
    // measured and found none.
    if (!componentForm.no_quantity) {
      const qty = parseFloat(componentForm.quantity)
      if (isNaN(qty) || qty <= 0) e.quantity = 'Quantity must be greater than 0'
    }
    return e
  }

  async function handleComponentSave(e) {
    e.preventDefault()
    setError('')
    const v = validateComponent()
    if (Object.keys(v).length) { setComponentErrors(v); return }
    setComponentErrors({})

    const payload = {
      menu_item_id: id,
      product_id: componentForm.product_id,
      quantity: componentForm.no_quantity ? null : parseFloat(componentForm.quantity),
      no_quantity: !!componentForm.no_quantity,
      notes: componentForm.notes || null,
      // Blank is not a group. Stored as null so "no group" is one value rather
      // than two that have to be checked for separately everywhere.
      choice_group: componentForm.choice_group?.trim() || null,
      list_separately: !!componentForm.list_separately,
    }

    if (editingComponent) {
      const { error: err } = await supabase
        .from('menu_item_components')
        .update(payload)
        .eq('id', editingComponent.id)

      if (err) handleSupabaseError(err)
      else { fetchComponents(); resetComponentForm() }
    } else {
      const { error: err } = await supabase
        .from('menu_item_components')
        .insert(payload)

      if (err) handleSupabaseError(err)
      else {
        fetchComponents()
        setComponentForm(emptyComponentForm())
        setComponentErrors({})
        // Form stays open for rapid bulk entry. Done button closes.
      }
    }
  }

  // Everything ticked in the picker, in one insert. All or nothing: half a
  // choice recorded is a cost that is wrong and looks fine.
  async function addSeveral(rows) {
    const { error: err } = await supabase
      .from('menu_item_components')
      .insert(rows.map(r => ({ ...r, menu_item_id: id, no_quantity: false, notes: null })))

    if (err) handleSupabaseError(err)
    else {
      setShowSeveral(false)
      fetchAll()
    }
  }

  function handleSupabaseError(err) {
    if (err.code === '23505') {
      setError(componentForm.choice_group
        ? `${getProduct(componentForm.product_id)?.name || 'That product'} is already an option in ${componentForm.choice_group}. Edit the existing row instead.`
        : 'This product is already an ingredient of this menu item. Edit the existing row instead.')
    } else {
      setError(friendlyError(err))
    }
  }

  async function fetchComponents() {
    const { data } = await supabase
      .from('menu_item_components')
      .select('*')
      .eq('menu_item_id', id)
    if (data) setComponents(data)
  }

  function resetComponentForm() {
    setComponentForm(emptyComponentForm())
    setEditingComponent(null)
    setShowComponentForm(false)
    setComponentErrors({})
  }

  function startEditComponent(component) {
    setComponentForm({
      product_id: component.product_id,
      quantity: component.quantity ?? '',
      no_quantity: !!component.no_quantity,
      choice_group: component.choice_group || '',
      list_separately: !!component.list_separately,
      notes: component.notes || '',
    })
    setEditingComponent(component)
    setShowComponentForm(true)
    setComponentErrors({})
  }

  async function removeComponent(component) {
    const ingredient = products.find(p => p.id === component.product_id)
    const ok = await confirm({
      title: 'Remove this component?',
      message: 'The dish will be costed without it from now on.',
      details: [
        { label: 'Component', value: ingredient?.name || 'Unknown product' },
        {
          label: 'Quantity',
          value: component.no_quantity
            ? 'Used, not measured'
            : `${component.quantity} ${ingredient?.unit || ''}`.trim(),
        },
      ],
      confirmLabel: 'Remove component',
      tone: 'danger',
    })
    if (!ok) return
    const { error: err } = await supabase
      .from('menu_item_components')
      .delete()
      .eq('id', component.id)
    if (err) setError(friendlyError(err))
    else fetchComponents()
  }

  // Available products in the dropdown: all active products except those
  // already used in the place being added to.
  //
  // "The place" is the choice being typed, or the ingredients if none is. A
  // chicken quesadilla is made with chipotle and is also served with a dip pot
  // of whichever sauce was asked for. The same product, twice, meaning two
  // different things, so the ingredient must not hide the option.
  //
  // Cleaning is left out. Nothing in that cupboard has ever been part of a
  // dish. Drinks and packaging stay: a can of Coke is a real line on a menu and
  // a container is a real cost on one, which is where this differs from a
  // recipe, where the question is only what goes into something we make.
  const addingTo = (componentForm.choice_group || '').trim() || null
  const availableProducts = products.filter(p => {
    if (editingComponent && editingComponent.product_id === p.id) return true
    if (!canBeMenuComponent(p)) return false
    return !components.some(c =>
      c.product_id === p.id && (c.choice_group || null) === addingTo)
  })

  // The category this item is in, if somebody has since turned it off.
  const retiredCategory = categories.find(c =>
    c.id === headerForm.category_id && !c.is_active) || null

  // Derived numbers
  const totalCost = menuItemCost(components, products, recipeLines, prices)

  const grossPrice = item ? parseFloat(item.selling_price) : 0
  const vatRate = item ? parseFloat(item.vat_rate) : 0
  const netPrice = grossPrice / (1 + vatRate / 100)
  const margin = totalCost !== null ? netPrice - totalCost : null
  const marginPct = (margin !== null && netPrice > 0) ? (margin / netPrice) * 100 : null

  function marginColour(pct) {
    if (pct === null) return 'text-gray-400'
    if (pct >= MARGIN_GREEN) return 'text-green-700'
    if (pct >= MARGIN_AMBER) return 'text-amber-700'
    return 'text-red-600'
  }

  const derivedAllergens = deriveMenuItemAllergens(components, products, recipeLines, allergens)

  function getProduct(productId) {
    return products.find(p => p.id === productId)
  }

  function getLineCost(component) {
    if (component.no_quantity) return null
    const product = getProduct(component.product_id)
    if (!product) return null
    const result = calculateMixCost(product, products, recipeLines, prices)
    if (result.cost === null) return null
    return parseFloat(component.quantity) * result.cost
  }

  // The sheet names already in use in the category this item is in, and who is
  // using each. Offered back so the second churros is picked off a list rather
  // than typed again: Churros and Churos are two rows on the sheet and nothing
  // would have said so.
  //
  // Only this category, because that is the only place a name can merge
  // anything. A name typed into another category does nothing at all.
  const sheetNamesHere = (() => {
    const found = new Map()
    for (const other of allMenuItems) {
      if (other.id === id) continue
      if (other.category_id !== headerForm.category_id) continue
      const name = (other.sheet_name || '').trim()
      if (!name) continue
      // Keyed without capitals, to match how the sheet itself groups them.
      const key = name.toLowerCase()
      if (!found.has(key)) found.set(key, { name, items: [] })
      found.get(key).items.push(other.name)
    }
    return found
  })()

  // Who this item is about to share a row with. Shown as it is typed, so the
  // merge is confirmed before it is saved rather than found on the sheet.
  const sharesWith =
    sheetNamesHere.get((headerForm.sheet_name || '').trim().toLowerCase())?.items || []

  // Three kinds of row, kept apart, because they answer different questions.
  //
  // What is in the food. What it is handed over in. And what the customer picks
  // between. All three are real cost and all three add up the same way; this is
  // only about being able to see at a glance what is assigned to a dish,
  // which a single list of fifteen rows does not let you do.
  const alwaysIn = components.filter(c => !c.choice_group)
  const isPackaging = c => getProduct(c.product_id)?.section === 'Packaging'
  const ingredients = alwaysIn.filter(c => !isPackaging(c))
  const packaging = alwaysIn.filter(isPackaging)

  // What the packaging comes to on its own. Null the moment one of them cannot
  // be priced, the same rule as everywhere else: a partial total looks like a
  // real one.
  const packagingCost = packaging.reduce((total, c) => {
    if (total === null) return null
    const line = getLineCost(c)
    return line === null ? null : total + line
  }, 0)
  const choiceGroups = [...components
    .filter(c => c.choice_group)
    .reduce((groups, c) => {
      if (!groups.has(c.choice_group)) groups.set(c.choice_group, [])
      groups.get(c.choice_group).push(c)
      return groups
    }, new Map())]
    .sort((a, b) => a[0].localeCompare(b[0]))

  // The groups already used on this item, for the form to offer back.
  const existingGroups = [...new Set(
    components.map(c => c.choice_group).filter(Boolean),
  )].sort()

  // Which lines actually reach the total.
  //
  // Only the dearest of each group does, because only one of them is ever
  // made. The others are shown with their cost so you can see what the
  // alternatives come to, greyed so it is clear they are not being added on
  // top of it.
  const counting = (() => {
    const keep = new Set()
    const best = new Map()

    for (const c of components) {
      if (!c.choice_group) { keep.add(c.id); continue }
      const cost = getLineCost(c)
      // A line with no cost yet cannot win and cannot be ruled out.
      if (cost === null) continue
      const current = best.get(c.choice_group)
      if (!current || cost > current.cost) best.set(c.choice_group, { id: c.id, cost })
    }

    for (const { id } of best.values()) keep.add(id)
    return keep
  })()

  function getIngredientUnitCost(product) {
    if (!product) return null
    const result = calculateMixCost(product, products, recipeLines, prices)
    return result.cost
  }

  if (loading) return <div className="text-sm text-gray-500">Loading menu item...</div>

  return (
    <div>
      <BackButton to="/catalogue/menu-items" className="mb-4">Back to menu items</BackButton>

      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Menu Item: {item?.name}</h2>
        <p className="text-sm text-gray-500 mt-1">Costs and margins for {activeRestaurant?.name}</p>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}

      {/* Header form: name, category, price, VAT, notes */}
      <div className={`${card} p-6 mb-6`}>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Details</h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Name</label>
            <input
              type="text"
              value={headerForm.name}
              onChange={e => handleHeaderChange('name', e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
            />
            {headerErrors.name && <p className="text-xs text-red-600 mt-1">{headerErrors.name}</p>}

            {/* Two portion sizes of one dish are one thing on an allergen
                sheet. Giving both the same name here merges them into one row
                rather than printing the same fourteen answers twice. */}
            <label htmlFor="sheet-name" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mt-4 mb-2">
              Name on the allergen sheet
            </label>
            <input
              id="sheet-name"
              type="text"
              list="sheet-names"
              value={headerForm.sheet_name}
              onChange={e => handleHeaderChange('sheet_name', e.target.value)}
              placeholder={headerForm.name || 'Same as the name'}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
            />
            <datalist id="sheet-names">
              {[...sheetNamesHere.values()]
                .map(v => v.name)
                .sort()
                .map(n => <option key={n} value={n} />)}
            </datalist>

            {/* On the field rather than only in the dropdown behind it. A
                datalist shows nothing until you click into the box, so there
                was no way to tell a list of names from no names at all. */}
            {sheetNamesHere.size > 0 && (
              <div className="flex flex-wrap items-baseline gap-2 mt-2">
                <span className="text-xs text-muted">Already used here:</span>
                {[...sheetNamesHere.values()].map(v => v.name).sort().map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleHeaderChange('sheet_name', n)}
                    className="px-2 py-0.5 rounded-full border border-border bg-white text-xs text-gray-700 hover:border-gray-400 transition-colors"
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}

            {sharesWith.length > 0 ? (
              <p className="text-xs text-green-700 mt-1">
                Shares a row with {sharesWith.join(', ')}.
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                Leave empty to use the name above. Give two sizes of the same dish the same
                name here and they appear as one row.
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Category</label>
            <select
              value={headerForm.category_id}
              onChange={e => handleHeaderChange('category_id', e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
            >
              <option value="">Select a category...</option>
              {/* The one it is in stays on the list even after that category is
                  turned off. Leaving it out emptied the box, and an empty box
                  saves as no category at all, so editing the price of an item
                  in a retired category quietly took it off the menu. It is
                  named for what it is and the line underneath says to move it. */}
              {retiredCategory && (
                <option value={retiredCategory.id}>{retiredCategory.name} (turned off)</option>
              )}
              {categories.filter(c => c.is_active).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {headerErrors.category_id && <p className="text-xs text-red-600 mt-1">{headerErrors.category_id}</p>}
            {!headerErrors.category_id && retiredCategory && (
              <p className="text-xs text-amber-700 mt-1">
                {retiredCategory.name} is turned off. Pick another one, or this item stays in a
                category nothing else uses.
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Selling Price (€, gross)</label>
            <input
              {...numberField({
                value: headerForm.selling_price,
                onChange: v => handleHeaderChange('selling_price', v),
              })}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
            />
            {headerErrors.selling_price && <p className="text-xs text-red-600 mt-1">{headerErrors.selling_price}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">VAT Rate (%)</label>
            <input
              {...numberField({
                value: headerForm.vat_rate,
                onChange: v => handleHeaderChange('vat_rate', v),
              })}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
            />
            {headerErrors.vat_rate && <p className="text-xs text-red-600 mt-1">{headerErrors.vat_rate}</p>}
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes (optional)</label>
          <textarea
            value={headerForm.notes}
            onChange={e => handleHeaderChange('notes', e.target.value)}
            rows={2}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={saveHeader}
            disabled={headerSaving}
            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {headerSaving ? 'Saving...' : 'Save Details'}
          </button>
          {headerSavedMessage && <span className="text-xs text-green-700">{headerSavedMessage}</span>}
        </div>
      </div>

      {/* Components section */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Components</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowSeveral(true)}
            disabled={availableProducts.length === 0}
            className={secondaryButton}
          >
            Add options
          </button>
          <button
            onClick={() => { resetComponentForm(); setShowComponentForm(true) }}
            disabled={availableProducts.length === 0}
            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            + Add Component
          </button>
        </div>
      </div>

      {showComponentForm && !editingComponent && (
        <div className={`${card} p-6 mb-6`}>
          <h4 className="text-sm font-semibold text-gray-900 mb-4">New Component</h4>
          <ComponentForm
            formData={componentForm}
            onChange={handleComponentChange}
            onSubmit={handleComponentSave}
            onCancel={resetComponentForm}
            submitLabel="Add Component"
            errors={componentErrors}
            availableProducts={availableProducts}
            productSelectRef={productSelectRef}
            existingGroups={existingGroups}
          />
        </div>
      )}

      {components.length === 0 ? (
        <div className={`${card} p-8 text-center mb-6`}>
          <p className="text-sm text-gray-500">No components yet. Click "+ Add Component" to start building this menu item.</p>
        </div>
      ) : (
        <>
          {/* Ingredients, then a table for each choice, then packaging. Either
              a choice or a pot sitting in this first list reads as one more
              ingredient, which is the opposite of what they are. */}
          {ingredients.length > 0 && (
            <div className={`${cardEdge} bg-white overflow-hidden mb-6`}>
              <div className={cardHeader}>Ingredients</div>
              <div className="overflow-x-auto">
              <ComponentTable
                rows={ingredients}
                counting={counting}
                getProduct={getProduct}
                getIngredientUnitCost={getIngredientUnitCost}
                getLineCost={getLineCost}
                editingComponent={editingComponent}
                onEdit={startEditComponent}
                onCancelEdit={resetComponentForm}
                onRemove={removeComponent}
              />
              </div>
            </div>
          )}

          {choiceGroups.map(([groupName, rows]) => (
            <div key={groupName} className={`${cardEdge} bg-white overflow-hidden mb-6`}>
              <div className={`${cardHeader} flex flex-wrap items-baseline gap-x-3`}>
                <span>{groupName}</span>
                <span className="normal-case tracking-normal font-normal text-white/70 text-xs">
                  The customer picks one. Only the most expensive is counted.
                </span>
              </div>
              <div className="overflow-x-auto">
                <ComponentTable
                  rows={rows}
                  counting={counting}
                  getProduct={getProduct}
                  getIngredientUnitCost={getIngredientUnitCost}
                  getLineCost={getLineCost}
                  editingComponent={editingComponent}
                  onEdit={startEditComponent}
                  onCancelEdit={resetComponentForm}
                  onRemove={removeComponent}
                />
              </div>
            </div>
          ))}
          {/* Last, because it is the part you look at least. On a burrito with
              two choices this used to sit second and push the interesting
              tables down the page.

              Still counted in the cost exactly as before. This is about being
              able to see what a dish is handed over in without reading down a
              list of everything else. */}
          {packaging.length > 0 && (
            <div className={`${cardEdge} bg-white overflow-hidden mb-6`}>
              <div className={`${cardHeader} flex flex-wrap items-baseline gap-x-3`}>
                <span>Packaging</span>
                <span className="normal-case tracking-normal font-normal text-white/70 text-xs">
                  {packagingCost === null
                    ? 'Counted in the cost'
                    : `€${packagingCost.toFixed(2)} of the cost`}
                </span>
              </div>
              <div className="overflow-x-auto">
                <ComponentTable
                  rows={packaging}
                  counting={counting}
                  getProduct={getProduct}
                  getIngredientUnitCost={getIngredientUnitCost}
                  getLineCost={getLineCost}
                  editingComponent={editingComponent}
                  onEdit={startEditComponent}
                  onCancelEdit={resetComponentForm}
                  onRemove={removeComponent}
                />
              </div>
            </div>
          )}

        </>
      )}

      {/* Summary */}
      <div className={`${card} p-6 mb-6`}>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Summary</h3>
        <div className="grid grid-cols-5 gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Cost</p>
            <p className="text-xl font-semibold text-gray-900">
              {totalCost !== null ? `€${totalCost.toFixed(2)}` : <span className="text-amber-600 text-base">—</span>}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Price (gross)</p>
            <p className="text-xl font-semibold text-gray-900">€{grossPrice.toFixed(2)}</p>
            <p className="text-xs text-gray-400">VAT {vatRate.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Net Price</p>
            <p className="text-xl font-semibold text-gray-900">€{netPrice.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Margin</p>
            <p className={`text-xl font-semibold ${marginColour(marginPct)}`}>
              {margin !== null ? `€${margin.toFixed(2)}` : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Margin %</p>
            <p className={`text-xl font-semibold ${marginColour(marginPct)}`}>
              {marginPct !== null ? `${marginPct.toFixed(1)}%` : '—'}
            </p>
          </div>
        </div>
        {totalCost === null && components.length > 0 && (
          <p className="text-xs text-amber-700 mt-3">
            Some components have no preferred price (raw products) or no complete recipe (MIX products) for {activeRestaurant?.name}. The cost and margin cannot be calculated until all are configured.
          </p>
        )}
      </div>

      {/* Derived allergens */}
      <div className={`${card} p-6`}>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Derived Allergens</h3>
        <p className="text-xs text-gray-500 mb-4">
          Calculated automatically from the allergens set on each component (and recursively from the ingredients of any MIX component). To change, edit the allergens on the underlying products.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ALLERGEN_KEYS.map(key => {
            const state = derivedAllergens[key]
            const colour = state === 'contains'
              ? 'bg-red-100 text-red-800 border-red-300'
              : state === 'may_contain'
                ? 'bg-amber-100 text-amber-800 border-amber-300'
                : 'bg-gray-100 text-gray-500 border-gray-300'
            const label = state === 'contains' ? 'Contains' : state === 'may_contain' ? 'May Contain' : 'Not Present'
            return (
              <div key={key} className={`px-3 py-2 rounded-lg border text-sm flex items-center justify-between ${colour}`}>
                <span className="font-medium">{ALLERGEN_LABELS[key]}</span>
                <span className="text-xs">{label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Editing opens in a dialog rather than pushing a form into the middle of
          the table, where the row being changed was hard to pick out from the
          rows around it and everything below jumped down the page. */}
      {editingComponent && (
        <Modal
          title={`Edit ${products.find(p => p.id === editingComponent.product_id)?.name || 'this component'}`}
          onClose={resetComponentForm}
          width="max-w-2xl"
        >
          <div className="px-6 py-4">
            <ComponentForm
              formData={componentForm}
              onChange={handleComponentChange}
              onSubmit={handleComponentSave}
              onCancel={resetComponentForm}
              submitLabel="Save changes"
              errors={componentErrors}
              availableProducts={availableProducts}
              productSelectRef={null}
              existingGroups={existingGroups}
            />
          </div>
        </Modal>
      )}

      {showSeveral && (
        <AddOptions
          menuCategories={categories.filter(c => c.is_active)}
          menuItems={allMenuItems}
          allComponents={allComponents}
          products={products}
          existingGroups={existingGroups}
          existing={components}
          onAdd={addSeveral}
          onClose={() => setShowSeveral(false)}
        />
      )}
    </div>
  )
}

function ComponentForm({ formData, onChange, onSubmit, onCancel, submitLabel, errors, availableProducts, productSelectRef, existingGroups }) {
  const product = availableProducts.find(p => p.id === formData.product_id)
  const unit = product?.unit || 'unit'

  return (
    <form onSubmit={onSubmit}>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Component</label>
          <ProductSelect
            inputRef={productSelectRef}
            value={formData.product_id}
            onChange={v => onChange('product_id', v)}
            products={availableProducts}
          />
          {errors.product_id && <p className="text-xs text-red-600 mt-1">{errors.product_id}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Quantity</label>
          <QuantityInUnit
            value={formData.quantity}
            onChange={v => onChange('quantity', v)}
            unit={unit}
            disabled={formData.no_quantity}
          />

          {/* The oil everything is fried in, and anything else of that kind.
              There is no honest number for how much of it is in one portion,
              and an invented one would land in the cost of the dish. Its
              allergens still count, which is the reason this exists: fried
              food absorbs the oil, so a portion of chips really does contain
              whatever the oil contains. */}
          <label className="flex items-start gap-2 mt-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!formData.no_quantity}
              onChange={e => onChange('no_quantity', e.target.checked)}
              className="w-4 h-4 accent-accent mt-0.5"
            />
            <span className="text-sm text-gray-700">
              No specific quantity
              <span className="block text-xs text-gray-400">
                Its allergens still count. It adds nothing to the cost.
              </span>
            </span>
          </label>
          {errors.quantity && <p className="text-xs text-red-600 mt-1">{errors.quantity}</p>}
        </div>
      </div>

      {/* Something the customer picks one of, rather than something that is
          always in it. Two things follow from a group and they are both said
          here, because neither is guessable from the words "choice group". */}
      <div className="mb-4 rounded-lg border border-border bg-gray-50 p-4">
        <label htmlFor="choice-group" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Customer choice (optional)
        </label>
        <input
          id="choice-group"
          type="text"
          list="choice-groups"
          value={formData.choice_group || ''}
          onChange={e => onChange('choice_group', e.target.value)}
          placeholder="e.g. Sauce, Salsa, Free drink"
          className="w-full sm:max-w-xs border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
        />
        {/* The groups already on this item, so the second sauce does not end
            up in a group called "sauce" beside one called "Sauce". */}
        <datalist id="choice-groups">
          {(existingGroups || []).map(g => <option key={g} value={g} />)}
        </datalist>

        <p className="text-xs text-gray-500 mt-2">
          Components with the same choice name are alternatives, and the customer gets one of
          them. Only the most expensive is counted in the cost, using current prices, and none
          of them are added to this item's allergens.
        </p>

        <label className="flex items-start gap-2 mt-3 cursor-pointer">
          <input
            type="checkbox"
            checked={!!formData.list_separately}
            onChange={e => onChange('list_separately', e.target.checked)}
            className="w-4 h-4 accent-accent mt-0.5"
          />
          <span className="text-sm text-gray-700">
            List it separately on the allergen sheet
            <span className="block text-xs text-gray-400">
              Use this for things that are not menu items, like a dessert sauce. Leave it off
              if it already appears in its own category.
            </span>
          </span>
        </label>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes (optional)</label>
        <input
          type="text"
          value={formData.notes}
          onChange={e => onChange('notes', e.target.value)}
          placeholder="e.g. on top, on the side"
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

// The rows of one table: either the ingredients that are always in the dish,
// or the options of one choice. The same six columns either way, because they
// are the same six questions.
function ComponentTable({
  rows, counting, getProduct, getIngredientUnitCost, getLineCost,
  editingComponent, onEdit, onCancelEdit, onRemove,
}) {
  return (
          <table className="w-full text-sm">
            <thead>
              <tr className={tableHeadRow}>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Component</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantity</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Unit Cost</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Line Cost</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => {
                const product = getProduct(c.product_id)
                const unitCost = getIngredientUnitCost(product)
                const lineCost = getLineCost(c)
                return (
                  <Fragment key={c.id}>
                    <tr className={`border-b border-border ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {product ? (
                          <>
                            {product.name}
                            {product.is_mix && <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">MIX</span>}
                          </>
                        ) : <span className="text-red-600">Missing product</span>}
                        {c.choice_group && (
                          <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                            {c.choice_group}
                          </span>
                        )}
                        {c.list_separately && (
                          <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                            Listed separately
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {c.no_quantity
                          ? <span className="text-muted italic">Used, not measured</span>
                          : `${parseFloat(c.quantity)} ${product?.unit || ''}`}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {unitCost !== null ? `€${unitCost.toFixed(4)} / ${product?.unit}` : <span className="text-amber-600 text-xs">No cost available</span>}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {lineCost === null ? '—' : counting.has(c.id) ? (
                          `€${lineCost.toFixed(2)}`
                        ) : (
                          // Shown rather than hidden. What the other options
                          // come to is worth seeing, and a blank here would
                          // read as a line that costs nothing.
                          <span className="font-normal text-gray-400">
                            €{lineCost.toFixed(2)}
                            <span className="block text-xs">not the most expensive</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{c.notes || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-3">
                          <button
                            onClick={() => editingComponent?.id === c.id ? onCancelEdit() : onEdit(c)}
                            className={rowButton('edit')}
                          >
                            {editingComponent?.id === c.id ? 'Cancel' : 'Edit'}
                          </button>
                          <button
                            onClick={() => onRemove(c)}
                            className={rowButton('danger')}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>

  )
}
