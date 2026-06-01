import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const ALLERGENS = [
  { key: 'gluten', label: 'Gluten' },
  { key: 'crustaceans', label: 'Crustaceans' },
  { key: 'eggs', label: 'Eggs' },
  { key: 'fish', label: 'Fish' },
  { key: 'peanuts', label: 'Peanuts' },
  { key: 'soybeans', label: 'Soybeans' },
  { key: 'milk', label: 'Milk' },
  { key: 'nuts', label: 'Nuts' },
  { key: 'celery', label: 'Celery' },
  { key: 'mustard', label: 'Mustard' },
  { key: 'sesame', label: 'Sesame' },
  { key: 'sulphites', label: 'Sulphites' },
  { key: 'lupin', label: 'Lupin' },
  { key: 'molluscs', label: 'Molluscs' },
]

const STATES = [
  {
    value: 'none',
    label: 'Not Present',
    activeClass: 'bg-gray-200 text-gray-700 border-gray-300',
  },
  {
    value: 'may_contain',
    label: 'May Contain',
    activeClass: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  {
    value: 'contains',
    label: 'Contains',
    activeClass: 'bg-red-100 text-red-800 border-red-300',
  },
]

function emptyAllergens() {
  const obj = {}
  for (const a of ALLERGENS) obj[a.key] = 'none'
  return obj
}

export default function AllergenPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [product, setProduct] = useState(null)
  const [values, setValues] = useState(emptyAllergens())
  const [existing, setExisting] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState('')

  useEffect(() => {
    loadAll()
  }, [id])

  async function loadAll() {
    setLoading(true)

    const { data: productData, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single()

    if (productError) {
      setError(productError.message)
      setLoading(false)
      return
    }
    setProduct(productData)

    // maybeSingle returns null (not an error) if no row exists yet,
    // which is the case for a product that has never had allergens set.
    const { data: allergenData, error: allergenError } = await supabase
      .from('product_allergens')
      .select('*')
      .eq('product_id', id)
      .maybeSingle()

    if (allergenError) {
      setError(allergenError.message)
      setLoading(false)
      return
    }

    if (allergenData) {
      const next = {}
      for (const a of ALLERGENS) {
        next[a.key] = allergenData[a.key] || 'none'
      }
      setValues(next)
      setExisting(allergenData)
    }
    // else: keep the default emptyAllergens() initial state (all 'none')

    setLoading(false)
  }

  function setAllergenState(key, value) {
    setValues({ ...values, [key]: value })
    setSavedMessage('')
  }

  async function handleSave() {
    setError('')
    setSavedMessage('')
    setSaving(true)

    // Upsert: insert if no row exists for this product, update if one does.
    // product_allergens has UNIQUE(product_id), so onConflict='product_id'
    // is the right key.
    const payload = {
      product_id: id,
      ...values,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('product_allergens')
      .upsert(payload, { onConflict: 'product_id' })

    if (error) {
      setError(error.message)
    } else {
      setSavedMessage('Saved')
      // Refetch so the "Last updated" timestamp shown is the one
      // Postgres actually stored, not the client-side timestamp.
      loadAll()
    }
    setSaving(false)
  }

  function formatDate(iso) {
    if (!iso) return null
    return new Date(iso).toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short' })
  }

  return (
    <div>
      <button
        onClick={() => navigate('/catalogue/products')}
        className="text-sm text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1"
      >
        <span>←</span> Back to products
      </button>

      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">
          Allergens: {product?.name || '...'}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {product ? `${product.section} • ${product.unit}` : ''}
          {existing?.updated_at && (
            <span className="ml-2">• Last updated: {formatDate(existing.updated_at)}</span>
          )}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>
      )}

      <div className="bg-blue-50 text-blue-700 text-xs rounded-lg p-3 mb-4">
        Set the allergen status for each of the 14 EU-mandated allergens. "Not Present" means the product does not contain the allergen. "May Contain" indicates possible cross-contamination. "Contains" means the allergen is an ingredient. The public allergen page will display these values to customers.
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading allergens...</div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-border overflow-hidden mb-6">
            {ALLERGENS.map((allergen, i) => (
              <div
                key={allergen.key}
                className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 ${
                  i < ALLERGENS.length - 1 ? 'border-b border-border' : ''
                } ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
              >
                <p className="text-sm font-medium text-gray-900">{allergen.label}</p>
                <div className="flex gap-2">
                  {STATES.map(state => {
                    const isActive = values[allergen.key] === state.value
                    return (
                      <button
                        key={state.value}
                        type="button"
                        onClick={() => setAllergenState(allergen.key, state.value)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                          isActive
                            ? state.activeClass
                            : 'bg-white text-gray-500 border-border hover:bg-gray-50'
                        }`}
                      >
                        {state.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Allergens'}
            </button>
            {savedMessage && (
              <span className="text-xs text-green-700">{savedMessage}</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
