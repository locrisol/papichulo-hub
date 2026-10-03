import { useState, useEffect, useRef, Fragment, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useRestaurant } from '@/context/restaurant'
import {
  menuItemCost, costInside, deactivatedIn, missingIn, menuMargin, marginTone, MARGIN_GREEN, MARGIN_AMBER,
} from '@/lib/mixCost'
import { deriveMenuItemAllergens, neverEnteredInDish, ALLERGEN_KEYS } from '@/lib/allergens'
import { friendlyError } from '@/lib/errors'
import { canBeMenuComponent } from '@/lib/products'
import { productsWithARow, optionsWithoutARow, everyReadArrived } from '@/lib/allergenSheet'
import {
  tableHeadRow, tableHeadCell, badge, mixBadge, inactiveBadge, card, rowButton, secondaryButton, cardEdge, cardHeader,
  checkbox, labelClass, captionClass, hintClass, fieldError, fieldClass, primaryButton,
} from '@/lib/controlStyles'
import { useConfirm } from '@/context/confirm'
import Modal from '@/components/ui/Modal'
import AddOptions from '@/components/inventory/AddOptions'
import ProductSelect from '@/components/ui/ProductSelect'
import QuantityInUnit from '@/components/ui/QuantityInUnit'
import { numberField } from '@/lib/numberInput'
import { fmtMoney, fmtPct, fmtUnitCost, namesList } from '@/lib/format'
import BackButton from '@/components/ui/BackButton'
import ErrorBanner from '@/components/ui/ErrorBanner'
import Notice from '@/components/ui/Notice'
import PageHeader from '@/components/ui/PageHeader'

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

// What the colour means, said in words.
//
// A number going amber tells you something is wrong with it and not what, and
// on a phone the target it is being judged against is nowhere on the screen to
// compare it with. Saying the target out loud costs one line and saves the trip
// to Restaurant settings to remember what it was.
function marginWords(pct) {
  if (pct === null) return ''
  if (pct >= MARGIN_GREEN) return `Above the ${MARGIN_GREEN}% this kitchen aims at`
  if (pct >= MARGIN_AMBER) return `Under the ${MARGIN_GREEN}% this kitchen aims at`
  return `Below the ${MARGIN_AMBER}% floor`
}

// One line of the working under the margin: what it is, and the figure.
function SummaryLine({ label, value, tone, muted, last }) {
  return (
    <div className={`flex justify-between gap-3 text-sm py-2 ${last ? '' : 'border-b border-border'}`}>
      <span className="text-muted">{label}</span>
      <span className={`font-semibold tabular-nums whitespace-nowrap ${tone || (muted ? 'text-muted' : 'text-gray-900')}`}>
        {value}
      </span>
    </div>
  )
}

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
  // A read that failed, as against a save that did not go through. Nothing
  // about the dish is shown then, because a list worked out from half of it
  // looks whole.
  const [loadFailed, setLoadFailed] = useState(false)
  const [pricesFailed, setPricesFailed] = useState('')
  // Kept apart from the page's error above. That one is for something that
  // would not load; these two are for a save that would not go through, and
  // each belongs beside its own button. The component one matters most: its
  // form is in a dialog, so anything written to the page was behind it.
  const [formProblem, setFormProblem] = useState('')
  const [headerProblem, setHeaderProblem] = useState('')

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
    // Auto-focus the product dropdown after the form clears (post-add)
    if (showComponentForm && !componentForm.product_id && productSelectRef.current) {
      const scrollContainer = productSelectRef.current.closest('main')
      const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0
      productSelectRef.current.focus({ preventScroll: true })
      if (scrollContainer) scrollContainer.scrollTop = scrollTop
    }
  }, [componentForm.product_id, showComponentForm])

  const fetchAll = useCallback(async () => {
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
      // Every product, switched off or not. A deactivated one stays on every
      // recipe that used it, so its allergens are still in the dish, and the
      // customer sheet counts them. Reading only the active ones dropped them
      // from the panel below without a word. The pickers leave them out
      // instead, further down.
      supabase.from('products').select('*').order('name'),
      supabase.from('menu_item_components').select('*').eq('menu_item_id', id),
      supabase.from('mix_recipes').select('*'),
      supabase.from('product_allergens').select('*'),
      supabase.from('menu_items').select('*').eq('is_active', true).order('name'),
      supabase.from('menu_item_components').select('*'),
    ])

    // All of it or none of it. supabase-js hands a failed read back rather
    // than throwing it, and this kept whatever did arrive: a failed read of
    // the allergens left every component with none, and the panel at the
    // bottom said Not present for all fourteen. So one failed read shows the
    // failure and nothing else, the same as the customer page.
    const reads = [categoriesRes, productsRes, componentsRes, recipesRes, allergensRes, allItemsRes, allComponentsRes]
    if (itemRes.error || !itemRes.data || !everyReadArrived(reads)) {
      const failed = itemRes.error || reads.find(r => r.error)?.error
      setError(`This menu item could not be loaded in full. ${friendlyError(failed) || 'Check your connection and try again.'}`)
      setLoadFailed(true)
      setLoading(false)
      return
    }
    setLoadFailed(false)
    setError('')

    setItem(itemRes.data)
    setHeaderForm(emptyHeaderForm(itemRes.data))
    setCategories(categoriesRes.data)
    setProducts(productsRes.data)
    setComponents(componentsRes.data)
    setRecipeLines(recipesRes.data)
    setAllergens(allergensRes.data)
    setAllMenuItems(allItemsRes.data)
    setAllComponents(allComponentsRes.data)

    setLoading(false)
    }, [id])

  useEffect(() => {
    // The fetch sets a loading state before it starts, which is one render
    // this rule would rather avoid. The alternative is to leave it,
    // and then a change of what is shown keeps the previous one's figures
    // on screen under the new one's heading until the answer arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAll()
  }, [fetchAll])

  // A failed read is said as one. Left empty, it read as a dish with no
  // prices set, and the note under the cost blamed the components.
  const fetchPrices = useCallback(async () => {
    const { data, error: priceError } = await supabase
      .from('product_supplier_prices')
      .select('*')
      .eq('restaurant_id', activeRestaurant.id)
      .eq('is_preferred', true)
    if (priceError || !data) {
      setPricesFailed(`The prices could not be read, so the cost and margin are not shown. ${friendlyError(priceError)}`.trim())
      // Not the last restaurant's either. Kept, they went on costing this
      // one under the banner saying nothing was costed.
      setPrices([])
      return
    }
    setPricesFailed('')
    setPrices(data)
    }, [activeRestaurant])

  useEffect(() => {
    if (!activeRestaurant) return
    // The fetch sets a loading state before it starts, which is one render
    // this rule would rather avoid. The alternative is to leave it,
    // and then a change of what is shown keeps the previous one's figures
    // on screen under the new one's heading until the answer arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPrices()
  }, [fetchPrices, activeRestaurant])

  function handleHeaderChange(field, value) {
    setHeaderForm({ ...headerForm, [field]: value })
    setHeaderSavedMessage('')
  }

  function validateHeader() {
    const e = {}
    if (!headerForm.name.trim()) e.name = 'Enter a name'
    if (!headerForm.category_id) e.category_id = 'Pick a category'
    const price = parseFloat(headerForm.selling_price)
    if (isNaN(price) || price < 0) e.selling_price = 'Enter a selling price of 0 or more'
    const vat = parseFloat(headerForm.vat_rate)
    if (isNaN(vat) || vat < 0 || vat > 100) e.vat_rate = 'Enter a VAT rate from 0 to 100'
    return e
  }

  async function saveHeader() {
    setHeaderProblem('')
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

    if (err) setHeaderProblem(friendlyError(err))
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
    if (!componentForm.product_id) e.product_id = 'Pick a product'
    // Nothing to check when nobody can say. That is the whole point of the
    // tick, and it is a different answer from zero, which would mean somebody
    // measured and found none.
    if (!componentForm.no_quantity) {
      const qty = parseFloat(componentForm.quantity)
      if (isNaN(qty) || qty <= 0) e.quantity = 'Enter a quantity above 0'
    }
    return e
  }

  async function handleComponentSave(e) {
    e.preventDefault()
    setFormProblem('')
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
      setFormProblem(componentForm.choice_group
        ? `${getProduct(componentForm.product_id)?.name || 'That product'} is already an option in ${componentForm.choice_group}. Edit it in the list instead.`
        : 'This product is already on this menu item. Edit it in the list instead.')
    } else {
      setFormProblem(friendlyError(err))
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
    setFormProblem('')
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
  //
  // A deactivated product is left out too: it cannot be picked for anything
  // new. The line being edited still shows whatever it points at.
  const addingTo = (componentForm.choice_group || '').trim() || null
  const pickable = products.filter(p => p.is_active !== false)
  const availableProducts = products.filter(p => {
    if (editingComponent && editingComponent.product_id === p.id) return true
    if (p.is_active === false) return false
    if (!canBeMenuComponent(p)) return false
    return !components.some(c =>
      c.product_id === p.id && (c.choice_group || null) === addingTo)
  })

  // The category this item is in, if somebody has since turned it off.
  const retiredCategory = categories.find(c =>
    c.id === headerForm.category_id && !c.is_active) || null

  // Derived numbers
  const totalCost = menuItemCost(components, products, recipeLines, prices)

  // What is deactivated and standing in the way of the cost, on the dish or
  // inside a recipe it uses, named so somebody knows what to replace. Not the
  // ones used but not measured, which add nothing to the cost either way.
  const costed = components.filter(c => !c.no_quantity).map(c => c.product_id)
  const deactivated = totalCost === null ? deactivatedIn(costed, products, recipeLines) : []
  // And whether anything else is in the way too: a price or a recipe still to
  // be set. Then replacing the deactivated ones would not bring the cost back,
  // and the note must not say it would.
  const stillUnset = totalCost === null
    && missingIn(costed, products, recipeLines, prices).some(m => !deactivated.some(p => p.id === m))

  const grossPrice = item ? parseFloat(item.selling_price) : 0
  const vatRate = item ? parseFloat(item.vat_rate) : 0
  const { net: netPrice, margin, marginPct } = menuMargin(grossPrice, vatRate, totalCost)

  const derivedAllergens = deriveMenuItemAllergens(components, products, recipeLines, allergens)
  // What nobody ever entered allergens for, which the derivation can only
  // read as none. Named here, and none is then not known rather than Not
  // present, the same way the customer sheet asks people to see staff.
  const notEntered = neverEnteredInDish(components, products, recipeLines, allergens)

  function getProduct(productId) {
    return products.find(p => p.id === productId)
  }

  // Through the same rule as the total, so a deactivated line has no cost of
  // its own either rather than a figure the total then refuses to add up.
  function getLineCost(component) {
    if (component.no_quantity) return null
    const unitCost = costInside(getProduct(component.product_id), products, recipeLines, prices)
    if (unitCost === null) return null
    return parseFloat(component.quantity) * unitCost
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

  // The options whose allergens would be on no row of the allergen sheet, the
  // same question the sheet asks, so they are named here before a customer is
  // sent to staff about this dish. Only while the dish is on the sheet at all.
  //
  // This item's own components are the fresh ones: ticking List it separately
  // refetches those and not the list of every component.
  const sheetCategoryIds = new Set(categories
    .filter(c => c.is_active && c.on_allergen_sheet !== false)
    .map(c => c.id))
  const onSheet = Boolean(item?.is_active) && sheetCategoryIds.has(item?.category_id)
  const withARow = onSheet
    ? productsWithARow(
      allMenuItems.filter(i => sheetCategoryIds.has(i.category_id)),
      [...allComponents.filter(c => c.menu_item_id !== id), ...components],
      products)
    : null
  const withoutARow = rows => (onSheet
    ? optionsWithoutARow(rows, products, recipeLines, allergens, withARow)
    : [])

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
    return costInside(product, products, recipeLines, prices)
  }

  if (loading) return <div className="text-sm text-muted">Loading menu item...</div>

  if (loadFailed) {
    return (
      <div>
        <BackButton to="/catalogue/menu-items" className="mb-4">Back to menu items</BackButton>
        <ErrorBanner className="mb-4">{error}</ErrorBanner>
        <button type="button" onClick={fetchAll} className={primaryButton()}>Try again</button>
      </div>
    )
  }

  return (
    <div>
      <BackButton to="/catalogue/menu-items" className="mb-4">Back to menu items</BackButton>

      <PageHeader
        title={`Menu item: ${item?.name ?? ''}`}
        subtitle={`Costs and margins for ${activeRestaurant?.name ?? ''}`}
      />

      {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}

      {/* Header form: name, category, price, VAT, notes */}
      <div className={`${card} p-6 mb-6`}>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelClass}>Name</label>
            <input
              type="text"
              value={headerForm.name}
              onChange={e => handleHeaderChange('name', e.target.value)}
              className={fieldClass}
            />
            {headerErrors.name && <p className={fieldError}>{headerErrors.name}</p>}

            {/* Two portion sizes of one dish are one thing on an allergen
                sheet. Giving both the same name here merges them into one row
                rather than printing the same fourteen answers twice. */}
            <label htmlFor="sheet-name" className={`${labelClass} mt-4`}>
              Name on the allergen sheet
            </label>
            <input
              id="sheet-name"
              type="text"
              list="sheet-names"
              value={headerForm.sheet_name}
              onChange={e => handleHeaderChange('sheet_name', e.target.value)}
              placeholder={headerForm.name || 'Same as the name'}
              className={fieldClass}
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
              <p className={hintClass}>
                Leave empty to use the name above. Give two sizes of the same dish the same
                name here and they appear as one row.
              </p>
            )}
          </div>
          <div>
            <label className={labelClass}>Category</label>
            <select
              value={headerForm.category_id}
              onChange={e => handleHeaderChange('category_id', e.target.value)}
              className={fieldClass}
            >
              <option value="">Pick a category</option>
              {/* The one it is in stays on the list even after that category is
                  turned off. Leaving it out emptied the box, and an empty box
                  saves as no category at all, so editing the price of an item
                  in a retired category quietly took it off the menu. It is
                  named for what it is and the line underneath says to move it. */}
              {retiredCategory && (
                <option value={retiredCategory.id}>{retiredCategory.name} (inactive)</option>
              )}
              {categories.filter(c => c.is_active).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {headerErrors.category_id && <p className={fieldError}>{headerErrors.category_id}</p>}
            {!headerErrors.category_id && retiredCategory && (
              <p className="text-xs text-amber-700 mt-1">
                {retiredCategory.name} is inactive. Pick another category, or this item will not
                show on Menu items or the allergen sheet.
              </p>
            )}
          </div>
          <div>
            <label className={labelClass}>Selling price (€, gross)</label>
            <input
              {...numberField({
                value: headerForm.selling_price,
                onChange: v => handleHeaderChange('selling_price', v),
              })}
              className={fieldClass}
            />
            {headerErrors.selling_price && <p className={fieldError}>{headerErrors.selling_price}</p>}
          </div>
          <div>
            <label className={labelClass}>VAT rate (%)</label>
            <input
              {...numberField({
                value: headerForm.vat_rate,
                onChange: v => handleHeaderChange('vat_rate', v),
              })}
              className={fieldClass}
            />
            {headerErrors.vat_rate && <p className={fieldError}>{headerErrors.vat_rate}</p>}
          </div>
        </div>
        <div className="mb-4">
          <label className={labelClass}>Notes (optional)</label>
          <textarea
            value={headerForm.notes}
            onChange={e => handleHeaderChange('notes', e.target.value)}
            rows={2}
            className={fieldClass}
          />
        </div>
        {/* Beside the button, not at the top of the page. This form sits a long
            way down a long screen and on a phone the top of it is nowhere near
            the Save. */}
        {headerProblem && (
          <ErrorBanner className="mb-3">{headerProblem}</ErrorBanner>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={saveHeader}
            disabled={headerSaving}
            className={primaryButton()}
          >
            {headerSaving ? 'Saving...' : 'Save details'}
          </button>
          {headerSavedMessage && <span className="text-xs text-green-700">{headerSavedMessage}</span>}
        </div>
      </div>

      {/* Components section.

          The heading gets its own line on a phone. This was one row with
          justify-between and no gap, so on a narrow screen the two buttons were
          pushed straight into the word Components and sat on top of it: the
          inner group could wrap but the row it was in could not, and nothing
          was holding the two apart. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
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
            className={primaryButton()}
          >
            + Add component
          </button>
        </div>
      </div>

      {showComponentForm && !editingComponent && (
        <div className={`${card} overflow-hidden mb-6`}>
          <h4 className={cardHeader}>New component</h4>
          <div className="p-6">
            <ComponentForm
              problem={formProblem}
              formData={componentForm}
              onChange={handleComponentChange}
              onSubmit={handleComponentSave}
              onCancel={resetComponentForm}
              submitLabel="Add component"
              errors={componentErrors}
              availableProducts={availableProducts}
              productSelectRef={productSelectRef}
              existingGroups={existingGroups}
              editing={false}
            />
          </div>
        </div>
      )}

      {components.length === 0 ? (
        <div className={`${card} p-8 text-center mb-6`}>
          <p className="text-sm text-muted">No components yet. Press Add component to start.</p>
        </div>
      ) : (
        <>
          {/* Ingredients, then a table for each choice, then packaging. Either
              a choice or a pot sitting in this first list reads as one more
              ingredient, which is the opposite of what they are. */}
          {ingredients.length > 0 && (
            <div className={`${cardEdge} bg-white overflow-hidden mb-6`}>
              <div className={cardHeader}>Ingredients</div>
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
          )}

          {choiceGroups.map(([groupName, rows]) => {
            const unshown = withoutARow(rows)
            // Ticking is only the answer for one that carries something. One
            // nobody entered allergens for needs them entered: ticked, its own
            // row would only send customers to staff as well.
            const toTick = unshown.filter(o => o.carries).map(o => o.product)
            const toEnter = [...new Map(unshown.flatMap(o => o.notEntered).map(p => [p.id, p])).values()]
            const one = toTick.length === 1
            return (
            <div key={groupName} className={`${cardEdge} bg-white overflow-hidden mb-6`}>
              <div className={`${cardHeader} flex flex-wrap items-baseline gap-x-3`}>
                <span>{groupName}</span>
                <span className="normal-case tracking-normal font-normal text-white/70 text-xs">
                  The customer picks one. Only the most expensive is counted.
                </span>
              </div>
              <ComponentTable
                  rows={rows}
                  choiceGroup
                  counting={counting}
                  getProduct={getProduct}
                  getIngredientUnitCost={getIngredientUnitCost}
                  getLineCost={getLineCost}
                  editingComponent={editingComponent}
                  onEdit={startEditComponent}
                  onCancelEdit={resetComponentForm}
                  onRemove={removeComponent}
                />
              {/* An option is kept off the dish's own row, so its allergens
                  reach the sheet only through a row of its own. Without one,
                  the sheet asks customers to see staff about the whole dish. */}
              {toTick.length > 0 && (
                <Notice tone="warn" className="m-3">
                  {namesList(toTick.map(p => p.name))} {one ? 'is' : 'are'} not listed separately
                  on the allergen sheet, so the sheet asks customers to speak to a member of staff about this
                  dish. Edit {one ? 'it' : 'each one'} and tick List it separately on the allergen sheet.
                </Notice>
              )}
              {toEnter.length > 0 && (
                <Notice tone="warn" className="m-3">
                  <p>
                    Allergens have not been entered for {namesList(toEnter.map(p => p.name))}, so the allergen
                    sheet asks customers to speak to a member of staff about this dish.
                  </p>
                  <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {toEnter.map(p => (
                      <Link key={p.id} to={`/catalogue/products/${p.id}/allergens`} className="font-semibold text-accent-ink underline">
                        Enter allergens for {p.name}
                      </Link>
                    ))}
                  </p>
                </Notice>
              )}
            </div>
            )
          })}
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
                    : `${fmtMoney(packagingCost)} of the cost`}
                </span>
              </div>
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
          )}

        </>
      )}

      {/* Summary */}
      <div className={`${card} p-6 mb-6`}>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Summary</h3>
        {/* The margin percentage, and then the working.

            This was five equal columns, which on a phone is about forty pixels
            each: the headings ran into one another and Margin printed on top of
            Margin %. Stacking five identical boxes would have fixed the
            collision and kept the real problem, which is that the panel had not
            decided what it was for.

            The percentage is what it is for. It means something on its own,
            where the euro margin does not: the same €3.73 is a healthy margin
            on a side and a poor one on a burrito. So the percentage gets the
            space, and the four figures it was worked out from become a short
            list underneath, in the order you would check them. */}
        <div className="bg-app-bg rounded-lg p-4 mb-3">
          <p className={`${captionClass} mb-1`}>Margin</p>
          <p className={`font-serif text-3xl font-bold leading-none ${marginTone(marginPct)}`}>
            {fmtPct(marginPct)}
          </p>
          {marginPct !== null && (
            <p className={`text-sm mt-1 ${marginTone(marginPct)}`}>{marginWords(marginPct)}</p>
          )}
        </div>

        <div>
          <SummaryLine label="Margin in money" value={margin !== null ? fmtMoney(margin) : '—'} tone={marginTone(marginPct)} />
          <SummaryLine label="Cost" value={totalCost !== null ? fmtMoney(totalCost) : '—'} tone={totalCost === null ? 'text-amber-700' : ''} />
          <SummaryLine label="Price (gross)" value={fmtMoney(grossPrice)} />
          <SummaryLine label={`VAT ${vatRate.toFixed(1)}%`} value={fmtMoney(grossPrice - netPrice)} muted />
          <SummaryLine label="Net price" value={fmtMoney(netPrice)} last />
        </div>
        {pricesFailed && <ErrorBanner className="mt-3">{pricesFailed}</ErrorBanner>}
        {!pricesFailed && totalCost === null && components.length > 0 && (
          <p className="text-xs text-amber-700 mt-3">
            {deactivated.length > 0
              && `${namesList(deactivated.map(p => p.name))} ${deactivated.length === 1 ? 'is' : 'are'} deactivated. `
                + `Replace ${deactivated.length === 1 ? 'it' : 'them'} on this dish, or in the recipe that uses `
                + `${deactivated.length === 1 ? 'it' : 'them'}${stillUnset ? '. ' : ', to see the cost and margin.'}`}
            {(deactivated.length === 0 || stillUnset)
              && `Some components have no preferred price at ${activeRestaurant?.name}, or are a MIX whose recipe cannot be costed yet. The cost and margin will show once they all have a cost.`}
          </p>
        )}
      </div>

      {/* Derived allergens */}
      <div className={`${card} p-6`}>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Allergens</h3>
        <p className="text-xs text-muted mb-4">
          Worked out from the allergens on each component, including everything in a MIX recipe. Customer choices are not included. To change them, edit the allergens on those products.
        </p>
        {notEntered.length > 0 && (
          <Notice tone="warn" className="mb-4">
            Allergens have not been entered for {namesList(notEntered.map(p => p.name))}, so the full
            list for this dish is not known. Until they are, the allergen sheet asks customers to
            speak to a member of staff.
          </Notice>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ALLERGEN_KEYS.map(key => {
            const state = derivedAllergens[key]
            const colour = state === 'contains'
              ? 'bg-red-100 text-red-800 border-red-300'
              : state === 'may_contain'
                ? 'bg-amber-100 text-amber-800 border-amber-300'
                : 'bg-gray-100 text-muted border-gray-300'
            // What is known is still said. What is not is not called absent.
            const label = state === 'contains' ? 'Contains'
              : state === 'may_contain' ? 'May contain'
                : notEntered.length > 0 ? 'Not known' : 'Not present'
            return (
              // The name over the state on a phone, side by side from small up.
              // Two of these fit across a phone, and at that width Crustaceans
              // and Not present were pushed into each other with nothing
              // between them, so the reader had to guess which word belonged to
              // which allergen. The customer facing list was fixed for this
              // months ago; this is the same chip and it was missed.
              <div
                key={key}
                className={`px-3 py-2 rounded-lg border text-sm flex flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2 ${colour}`}
              >
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
              problem={formProblem}
              formData={componentForm}
              onChange={handleComponentChange}
              onSubmit={handleComponentSave}
              onCancel={resetComponentForm}
              submitLabel="Save changes"
              errors={componentErrors}
              availableProducts={availableProducts}
              productSelectRef={null}
              existingGroups={existingGroups}
              editing
            />
          </div>
        </Modal>
      )}

      {showSeveral && (
        <AddOptions
          menuCategories={categories.filter(c => c.is_active)}
          menuItems={allMenuItems}
          allComponents={allComponents}
          products={pickable}
          existingGroups={existingGroups}
          existing={components}
          onAdd={addSeveral}
          onClose={() => setShowSeveral(false)}
        />
      )}
    </div>
  )
}

function ComponentForm({
  problem,
  formData, onChange, onSubmit, onCancel, submitLabel, errors, availableProducts,
  productSelectRef, existingGroups, editing,
}) {
  const product = availableProducts.find(p => p.id === formData.product_id)
  const unit = product?.unit || 'unit'

  return (
    <form onSubmit={onSubmit}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className={labelClass}>Component</label>
          <ProductSelect
            inputRef={productSelectRef}
            value={formData.product_id}
            onChange={v => onChange('product_id', v)}
            products={availableProducts}
          />
          {errors.product_id && <p className={fieldError}>{errors.product_id}</p>}
        </div>

        <div>
          <label className={labelClass}>Quantity</label>
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
              className={`${checkbox} mt-0.5`}
            />
            <span className="text-sm text-gray-700">
              No specific quantity
              <span className="block text-xs text-muted">
                Its allergens still count. It adds nothing to the cost.
              </span>
            </span>
          </label>
          {errors.quantity && <p className={fieldError}>{errors.quantity}</p>}
        </div>
      </div>

      {/* Only when editing.

          Building a menu is dozens of trips through this form, nearly all of
          them plain ingredients, and two controls plus three lines of help text
          on every one of those is a real cost. Add options is the way in for a
          new one.

          On an existing row it is the only way to turn an ingredient into an
          option, move one between choices, or take one out of a choice
          altogether, so it stays. */}
      {!editing && (
        <p className="text-xs text-muted mb-4">
          For something the customer picks between, use Add options.
        </p>
      )}

      {editing && (
      <div className="mb-4 rounded-lg border border-border bg-gray-50 p-4">
        <label htmlFor="choice-group" className={labelClass}>
          Customer choice (optional)
        </label>
        <div className="sm:max-w-xs">
          <input
            id="choice-group"
            type="text"
            list="choice-groups"
            value={formData.choice_group || ''}
            onChange={e => onChange('choice_group', e.target.value)}
            placeholder="e.g. Sauce"
            className={fieldClass}
          />
        </div>
        {/* The groups already on this item, so the second sauce does not end
            up in a group called "sauce" beside one called "Sauce". */}
        <datalist id="choice-groups">
          {(existingGroups || []).map(g => <option key={g} value={g} />)}
        </datalist>

        <p className="text-xs text-muted mt-2">
          Components with the same choice name are alternatives, and the customer gets one of
          them. Only the most expensive is counted in the cost, using current prices, and none
          of them are added to this item's allergens.
        </p>

        <label className="flex items-start gap-2 mt-3 cursor-pointer">
          <input
            type="checkbox"
            checked={!!formData.list_separately}
            onChange={e => onChange('list_separately', e.target.checked)}
            className={`${checkbox} mt-0.5`}
          />
          <span className="text-sm text-gray-700">
            List it separately on the allergen sheet
            <span className="block text-xs text-muted">
              Use this for things that are not menu items, like a dessert sauce. Leave it off
              if it already appears in its own category. If it is a customer choice with allergens
              and is not listed, the allergen sheet asks customers to speak to a member of staff
              about this dish.
            </span>
          </span>
        </label>
      </div>
      )}

      <div className="mb-4">
        <label className={labelClass}>Notes (optional)</label>
        <input
          type="text"
          value={formData.notes}
          onChange={e => onChange('notes', e.target.value)}
          placeholder="e.g. on the side"
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
          {editing ? 'Cancel' : 'Done'}
        </button>
        <button
          type="submit"
          className={primaryButton()}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

// The rows of one table: either the ingredients that are always in the dish,
// or the options of one choice. The same six columns either way, because they
// are the same six questions.
// The chips that say what kind of component a line is, shared by both the card
// and the table so they cannot drift apart.
//
// Each one is a badge, so a two word chip cannot break in half across a line,
// and they sit in one wrapper that holds the gap between them and the name.
// A margin beside badge on each chip would be a second class on the element
// for every one of them.
function ComponentChips({ product, component }) {
  // Still on the dish and its allergens still count, but it has no cost and
  // nobody can pick it for anything new, so it wants replacing. Its name is
  // shown rather than Missing product, which is kept for one that cannot be
  // found at all.
  const inactive = product?.is_active === false
  const mix = Boolean(product?.is_mix)
  if (!inactive && !mix && !component.choice_group && !component.list_separately) return null

  return (
    <span className="inline-flex flex-wrap gap-1 ml-2 align-middle">
      {inactive && <span className={inactiveBadge}>Inactive</span>}
      {mix && <span className={mixBadge}>MIX</span>}
      {component.choice_group && (
        <span className={`${badge} bg-blue-100 text-blue-800`}>{component.choice_group}</span>
      )}
      {component.list_separately && (
        <span className={`${badge} bg-gray-100 text-gray-600`}>Listed separately</span>
      )}
    </span>
  )
}

// choiceGroup is what makes the Counted mark worth showing. In the ingredients
// and the packaging every line is in the cost, so a mark on all of them says
// nothing. In a choice group the customer takes one and only the dearest is
// counted, and which one that is is the question the group is read to answer.
export function ComponentTable({
  rows, counting, getProduct, getIngredientUnitCost, getLineCost,
  editingComponent, onEdit, onCancelEdit, onRemove, choiceGroup = false,
}) {
  return (
    <>
      {/* A card each on a phone.
          Six columns will not fit on a 390px screen, so this was a sideways
          scroll, and it was the worst one in the app: Line Cost, Notes and both
          buttons were all off the right hand edge, which meant a component
          could not be edited or removed on a phone at all without dragging the
          table sideways first. The line cost and the name are the pair worth
          reading, so they share the top line, and the buttons come back into
          reach at the bottom of the card. */}
      <div className="sm:hidden">
        {rows.map(c => {
          const product = getProduct(c.product_id)
          const unitCost = getIngredientUnitCost(product)
          const lineCost = getLineCost(c)
          const counted = counting.has(c.id)
          return (
            <div key={c.id} className="border-b border-border last:border-b-0 px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-gray-900">
                  {product ? product.name : <span className="text-red-600">Missing product</span>}
                  <ComponentChips product={product} component={c} />
                </span>
                {/* The number and nothing else.
                    This used to carry "not the most expensive" underneath, on
                    every option the customer did not take. The phrase is longer
                    than the price it explains and it could not wrap, so the
                    right hand column was as wide as the sentence: the name was
                    squeezed into two lines and the price ran off the screen.
                    The group heading already says only the dearest is counted,
                    so saying it again on four rows out of five was repeating
                    the rule rather than answering it. The one that does count
                    is marked instead, below. */}
                <span className={`text-sm font-semibold whitespace-nowrap tabular-nums text-right ${
                  counted ? 'text-gray-900' : 'text-muted'}`}>
                  {lineCost === null ? '—' : fmtMoney(lineCost)}
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5">
                {choiceGroup && counted && lineCost !== null && (
                  <span className={`${badge} bg-green-50 text-green-700 mr-1.5`}>Counted</span>
                )}
                {c.no_quantity
                  ? <span className="italic">Used, not measured</span>
                  : `${parseFloat(c.quantity)} ${product?.unit || ''}`}
                {unitCost !== null
                  ? ` at ${fmtUnitCost(unitCost)} / ${product?.unit}`
                  : <span className="text-amber-700"> · no cost available</span>}
              </p>
              {c.notes && <p className="text-xs text-muted mt-0.5">{c.notes}</p>}
              <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t border-border">
                <button
                  onClick={() => editingComponent?.id === c.id ? onCancelEdit() : onEdit(c)}
                  className={rowButton('edit')}
                >
                  {editingComponent?.id === c.id ? 'Cancel' : 'Edit'}
                </button>
                <button onClick={() => onRemove(c)} className={rowButton('danger')}>
                  Remove
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={tableHeadRow}>
                <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Component</th>
                <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Quantity</th>
                <th className={`text-right px-4 py-3 ${tableHeadCell}`}>Unit cost</th>
                <th className={`text-right px-4 py-3 ${tableHeadCell}`}>Line cost</th>
                <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Notes</th>
                <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Actions</th>
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
                        {product ? product.name : <span className="text-red-600">Missing product</span>}
                        <ComponentChips product={product} component={c} />
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {c.no_quantity
                          ? <span className="text-muted italic">Used, not measured</span>
                          : `${parseFloat(c.quantity)} ${product?.unit || ''}`}
                      </td>
                      <td className="px-4 py-3 text-muted text-right tabular-nums">
                        {unitCost !== null ? `${fmtUnitCost(unitCost)} / ${product?.unit}` : <span className="text-amber-700 text-xs">No cost available</span>}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 text-right tabular-nums">
                        {/* Same as the card above: the dearest one is marked
                            rather than the other four explained. The options
                            that are not counted still show what they come to,
                            because a blank would read as a line costing
                            nothing, and they stay in text-muted so they do not
                            read as money the dish is paying. */}
                        {lineCost === null ? '—' : counting.has(c.id) ? (
                          <>
                            {fmtMoney(lineCost)}
                            {choiceGroup && (
                              <span className={`${badge} bg-green-50 text-green-700 ml-2`}>Counted</span>
                            )}
                          </>
                        ) : (
                          <span className="font-normal text-muted">{fmtMoney(lineCost)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{c.notes || '—'}</td>
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
      </div>
    </>
  )
}
