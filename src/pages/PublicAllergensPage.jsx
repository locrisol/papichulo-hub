import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { deriveMenuItemAllergens, ALLERGEN_KEYS } from '../lib/allergens'
import { card } from '../lib/controlStyles'

const ALLERGEN_LABELS = {
  gluten: 'Gluten', crustaceans: 'Crustaceans', eggs: 'Eggs', fish: 'Fish',
  peanuts: 'Peanuts', soybeans: 'Soybeans', milk: 'Milk', nuts: 'Nuts',
  celery: 'Celery', mustard: 'Mustard', sesame: 'Sesame', sulphites: 'Sulphites',
  lupin: 'Lupin', molluscs: 'Molluscs',
}

// The allergen page customers see, at /allergens/[slug]. No login.
//
// Nothing here is tagged by hand. Each dish works its allergens out from its
// ingredients, following recipes down through nested MIXes and taking the worst
// answer at every step, so the page cannot drift out of date the way the old
// spreadsheet did. That logic lives in lib/allergens.js.
//
// Two things to know about this file.
//
// It is used twice. A customer opens it from a QR code, and it is also embedded
// inside the manager's preview screen, which passes slugOverride instead of
// reading the slug from the address.
//
// And there is one thing still open, worth knowing before trusting this page.
//
// For a customer the database hides deactivated rows on its own, because the
// public policies are written as auth.uid() IS NULL AND is_active = true. That
// applies to products too. So if a dish that is still on sale contains an
// ingredient somebody has since deactivated, the customer's copy of that product
// never arrives, the component is skipped, and the allergens it carried are
// quietly missing from what they are shown.
//
// Nothing triggers it today: no active dish currently contains a deactivated
// product. But nothing stops it either, and this is the one page where being
// quietly incomplete matters, so it wants either a policy that lets the public
// read every product, or a warning when deactivating something still used in a
// dish that is on sale.
export default function PublicAllergensPage({ slugOverride }) {
  const params = useParams()
  const slug = slugOverride ?? params.slug

  const [restaurant, setRestaurant] = useState(null)
  const [categories, setCategories] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [components, setComponents] = useState([])
  const [products, setProducts] = useState([])
  const [recipeLines, setRecipeLines] = useState([])
  const [allergens, setAllergens] = useState([])

  const [expandedId, setExpandedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAll()
  }, [slug])

  async function fetchAll() {
    setLoading(true)

    // Find the restaurant by slug. Even though selling prices are uniform,
    // the page is keyed to a restaurant so the displayed name and any
    // future per-restaurant tweaks work.
    const restRes = await supabase
      .from('restaurants')
      .select('id, name, slug')
      .eq('slug', slug)
      .maybeSingle()

    if (restRes.error || !restRes.data) {
      setError('Restaurant not found')
      setLoading(false)
      return
    }
    setRestaurant(restRes.data)

    // Categories and dishes are filtered here as well as by the database. For a
    // customer the public policies already do it, but the manager previewing
    // this page is signed in, and the signed-in policies have no is_active
    // condition, so without this the preview showed dishes a customer never
    // gets. Asking for it explicitly means the page behaves the same whoever is
    // looking at it.
    //
    // Products deliberately are not filtered. They are not a list on screen,
    // they are what the allergens are worked out from, and a dish can contain a
    // product that has since been deactivated. Leaving it out would drop that
    // product's allergens from the answer, which is the one thing this page
    // cannot get wrong.
    const [categoriesRes, menuItemsRes, componentsRes, productsRes, recipesRes, allergensRes] = await Promise.all([
      supabase.from('menu_categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('menu_items').select('*').eq('is_active', true).order('name'),
      supabase.from('menu_item_components').select('*'),
      supabase.from('products').select('*').order('name'),
      supabase.from('mix_recipes').select('*'),
      supabase.from('product_allergens').select('*'),
    ])

    if (categoriesRes.data) setCategories(categoriesRes.data)
    if (menuItemsRes.data) setMenuItems(menuItemsRes.data)
    if (componentsRes.data) setComponents(componentsRes.data)
    if (productsRes.data) setProducts(productsRes.data)
    if (recipesRes.data) setRecipeLines(recipesRes.data)
    if (allergensRes.data) setAllergens(allergensRes.data)

    setLoading(false)
  }

  function getItemComponents(itemId) {
    return components.filter(c => c.menu_item_id === itemId)
  }

  function getItemAllergens(item) {
    return deriveMenuItemAllergens(getItemComponents(item.id), products, recipeLines, allergens)
  }

  // Whether every ingredient in this dish actually arrived.
  //
  // A customer is not signed in, and the database only hands an anonymous reader
  // active products. So if an ingredient is deactivated while the dish is still
  // on sale, its row never arrives. deriveMenuItemAllergens skips a component it
  // cannot find, which would quietly turn "we do not know" into "no declared
  // allergens", and that is the worst way to be wrong on this page in
  // particular.
  //
  // The components themselves are always readable, so the gap can be spotted
  // even though the missing product cannot be fetched. When it happens the dish
  // says to ask staff instead of showing a list that looks complete.
  //
  // A manager viewing this through the preview is signed in and gets every
  // product, so this reads false for them and nothing changes.
  function allIngredientsReadable(item) {
    return getItemComponents(item.id).every(c => products.some(p => p.id === c.product_id))
  }

  function getAllergenSummary(state) {
    if (state === 'contains') {
      return { label: 'Contains', dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' }
    }
    if (state === 'may_contain') {
      return { label: 'May contain', dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' }
    }
    return null
  }

  // Build the grouped, ordered, filtered structure for rendering.
  const itemsByCategory = categories
    .map(c => ({
      category: c,
      items: menuItems
        .filter(i => i.category_id === c.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter(group => group.items.length > 0)

  // Find the most recent update across all allergen rows so we can show
  // a "last updated" timestamp. If no allergens have ever been edited,
  // we'll show today's date as a fallback so the page doesn't look stale.
  const lastUpdated = allergens.reduce((latest, a) => {
    if (!a.updated_at) return latest
    if (!latest || a.updated_at > latest) return a.updated_at
    return latest
  }, null)

  function formatDate(iso) {
    if (!iso) return new Date().toLocaleDateString('en-IE', { dateStyle: 'long' })
    return new Date(iso).toLocaleDateString('en-IE', { dateStyle: 'long' })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
        <p className="text-sm text-gray-500">Loading allergen information...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow">
          <p className="text-4xl mb-3">🚫</p>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Page not found</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-app-bg">
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <header className="mb-6">
          <p className="text-xs font-bold text-accent-ink uppercase tracking-widest mb-1">Allergen Information</p>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">{restaurant.name}</h1>
          <p className="text-xs text-gray-500 mt-2">Last updated: {formatDate(lastUpdated)}</p>
        </header>

        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4 mb-6">
          <p className="font-semibold mb-1">Important</p>
          <p>If you have a severe allergy, please speak to a member of staff before ordering. While we take great care, our kitchen handles many allergens and we cannot guarantee zero cross-contamination.</p>
        </div>

        <div className={`${card} p-4 mb-6 text-xs text-gray-600`}>
          <p className="mb-2">Tap a dish to see its full allergen breakdown. The summary shows allergens that the dish either contains or may contain.</p>
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
              Contains
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              May contain
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-gray-300"></span>
              Not present
            </span>
          </div>
        </div>

        {itemsByCategory.length === 0 ? (
          <div className={`${card} p-8 text-center`}>
            <p className="text-sm text-gray-500">No menu items available.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {itemsByCategory.map(({ category, items }) => (
              <div key={category.id}>
                <h2 className="font-serif text-lg font-bold text-gray-900 mb-2 px-1">{category.name}</h2>
                <div className={`${card} overflow-hidden`}>
                  {items.map((item, i) => {
                    const itemAllergens = getItemAllergens(item)
                    const present = ALLERGEN_KEYS
                      .map(key => ({ key, state: itemAllergens[key] }))
                      .filter(a => a.state !== 'none')
                    const isExpanded = expandedId === item.id
                    const complete = allIngredientsReadable(item)

                    return (
                      <div
                        key={item.id}
                        className={i < items.length - 1 ? 'border-b border-border' : ''}
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900">{item.name}</p>
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {!complete ? (
                                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                    Please ask a member of staff
                                  </span>
                                ) : present.length === 0 ? (
                                  <span className="text-xs text-gray-500">No declared allergens</span>
                                ) : (
                                  present.map(({ key, state }) => {
                                    const s = getAllergenSummary(state)
                                    return (
                                      <span
                                        key={key}
                                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}
                                      >
                                        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`}></span>
                                        {ALLERGEN_LABELS[key]}
                                      </span>
                                    )
                                  })
                                )}
                              </div>
                            </div>
                            <span className="text-gray-400 text-lg leading-none mt-1">
                              {isExpanded ? '−' : '+'}
                            </span>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-4 bg-gray-50">
                            {/* The breakdown below is worked out from the
                                ingredients, so if one of them could not be read
                                it is incomplete and saying nothing about that
                                would be worse than saying nothing at all. */}
                            {!complete && (
                              <div className="bg-amber-100 border border-amber-300 text-amber-900 text-xs rounded-lg p-3 mt-2">
                                We cannot confirm the full allergen list for this dish right now. Please ask a member of staff before ordering it.
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-2 mt-2">
                              {ALLERGEN_KEYS.map(key => {
                                const state = itemAllergens[key]
                                const s = getAllergenSummary(state)
                                const colour = s ? `${s.bg} ${s.text} border border-current/20` : 'bg-white text-gray-400 border border-gray-200'
                                const label = s ? s.label : 'Not present'
                                return (
                                  // Stacked on a phone, side by side from the
                                  // small breakpoint up. Two of these fit across
                                  // a phone, and at that width a long name like
                                  // Crustaceans and a long state like Not
                                  // present were pushed into each other with
                                  // nothing between them. This is an allergen
                                  // list, so a customer being unsure which word
                                  // goes with which allergen is the one thing it
                                  // must never do.
                                  <div
                                    key={key}
                                    className={`flex flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2 text-xs px-3 py-2 rounded-lg ${colour}`}
                                  >
                                    <span className="font-medium">{ALLERGEN_LABELS[key]}</span>
                                    <span>{label}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <footer className="mt-8 text-center">
          <p className="text-xs text-gray-400">
            Allergen information provided by {restaurant.name}. For the most current information, please ask a member of staff.
          </p>
        </footer>
      </div>
    </div>
  )
}