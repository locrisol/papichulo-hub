import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { friendlyError } from '../../lib/errors'
import { ALLERGENS, emptyAllergens } from '../../lib/allergens'
import AllergenPicker from '../../components/AllergenPicker'

// Tagging the 14 allergens on one product.
//
// This is where the raw answers are set for a product that already exists. The
// same fourteen can now be answered while the product is being added, on the
// product form, which is where you would rather say it. Both draw the list, the
// three states and the boxes from the same place.
//
// The 14 are fixed by EU 1169 and cannot be added to or renamed. A product with
// no record yet is treated as Not Present for all of them, which is why the form
// opens filled in rather than empty.
//
// One row per product, so saving is an insert the first time and an update after.

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
      setError(friendlyError(productError))
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
      setError(friendlyError(allergenError))
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
      setError(friendlyError(error))
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
          <AllergenPicker values={values} onChange={setAllergenState} className="mb-6" />

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
