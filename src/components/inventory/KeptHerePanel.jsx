import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { keptAt, saveKeptHere } from '@/lib/keptHere'
import { card, cardHeader } from '@/lib/controlStyles'
import ErrorBanner from '@/components/ui/ErrorBanner'
import SaveState from '@/components/ui/SaveState'
import KeptHereFields from '@/components/inventory/KeptHereFields'

// Where the open restaurant keeps a product, on its Prices page: the place
// the old Versions dialog used to say, now the restaurant's own rather than
// the version's. Each change saves as it is made.
export default function KeptHerePanel({ product, restaurant }) {
    const [kept, setKept] = useState(null)
    const [saving, setSaving] = useState(false)
    const [savedAt, setSavedAt] = useState(null)
    const [error, setError] = useState('')
    const productId = product?.id
    const restaurantId = restaurant?.id

    useEffect(() => {
        if (!productId || !restaurantId) return
        let live = true
        supabase.from('restaurant_kept_in')
            .select('section, also_in')
            .eq('restaurant_id', restaurantId).eq('product_id', productId)
            .maybeSingle()
            .then(({ data, error: readError }) => {
                if (!live) return
                if (readError) setError(friendlyError(readError))
                else setKept(data || null)
            })
        return () => { live = false }
    }, [productId, restaurantId])

    // Shown straight away and put back if the save fails, so a second tap
    // works from what is on screen.
    async function change(next) {
        const before = kept
        setKept(next)
        setSaving(true)
        setError('')
        const { error: saveError } = await saveKeptHere({ restaurantId, product, kept: next })
        setSaving(false)
        if (saveError) { setKept(before); setError(friendlyError(saveError)); return }
        setSavedAt(new Date())
    }

    if (!product || !restaurant) return null

    return (
        <div className={`${card} overflow-hidden mb-6`}>
            <h3 className={cardHeader}>Kept here</h3>
            <div className="p-4 sm:p-6 space-y-3">
                <ErrorBanner>{error}</ErrorBanner>
                <KeptHereFields
                    restaurantName={restaurant.name}
                    value={keptAt(product, kept)}
                    onChange={change}
                    disabled={saving}
                    idPrefix="prices-kept"
                />
                <SaveState problem={!!error} saving={saving} savedAt={savedAt} idle="Saves as you change it" />
            </div>
        </div>
    )
}
