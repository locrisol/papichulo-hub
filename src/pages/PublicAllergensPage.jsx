import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { deriveMenuItemAllergens, ALLERGEN_KEYS } from '../lib/allergens'

const ALLERGEN_LABELS = {
  gluten: 'Gluten', crustaceans: 'Crustaceans', eggs: 'Eggs', fish: 'Fish',
  peanuts: 'Peanuts', soybeans: 'Soybeans', milk: 'Milk', nuts: 'Nuts',
  celery: 'Celery', mustard: 'Mustard', sesame: 'Sesame', sulphites: 'Sulphites',
  lupin: 'Lupin', molluscs: 'Molluscs',
}

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

    const [categoriesRes, menuItemsRes, componentsRes, productsRes, recipesRes, allergensRes] = await Promise.all([
      supabase.from('menu_categories').select('*').order('sort_order'),
      supabase.from('menu_items').select('*'),
      supabase.from('menu_item_components').select('*'),
      supabase.from('products').select('*'),
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
          <p className="text-xs font-bold text-accent uppercase tracking-widest mb-1">Allergen Information</p>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">{restaurant.name}</h1>
          <p className="text-xs text-gray-500 mt-2">Last updated: {formatDate(lastUpdated)}</p>
        </header>

        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4 mb-6">
          <p className="font-semibold mb-1">Important</p>
          <p>If you have a severe allergy, please speak to a member of staff before ordering. While we take great care, our kitchen handles many allergens and we cannot guarantee zero cross-contamination.</p>
        </div>

        <div className="bg-white border border-border rounded-xl p-4 mb-6 text-xs text-gray-600">
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
          <div className="bg-white border border-border rounded-xl p-8 text-center">
            <p className="text-sm text-gray-500">No menu items available.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {itemsByCategory.map(({ category, items }) => (
              <div key={category.id}>
                <h2 className="font-serif text-lg font-bold text-gray-900 mb-2 px-1">{category.name}</h2>
                <div className="bg-white border border-border rounded-xl overflow-hidden">
                  {items.map((item, i) => {
                    const itemAllergens = getItemAllergens(item)
                    const present = ALLERGEN_KEYS
                      .map(key => ({ key, state: itemAllergens[key] }))
                      .filter(a => a.state !== 'none')
                    const isExpanded = expandedId === item.id

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
                                {present.length === 0 ? (
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
                            <div className="grid grid-cols-2 gap-2 mt-2">
                              {ALLERGEN_KEYS.map(key => {
                                const state = itemAllergens[key]
                                const s = getAllergenSummary(state)
                                const colour = s ? `${s.bg} ${s.text} border border-current/20` : 'bg-white text-gray-400 border border-gray-200'
                                const label = s ? s.label : 'Not present'
                                return (
                                  <div
                                    key={key}
                                    className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg ${colour}`}
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