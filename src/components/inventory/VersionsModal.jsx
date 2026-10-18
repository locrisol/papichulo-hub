import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { PLACES, versionLabel } from '@/lib/brandVersions'
import { groupsOf, standingOf } from '@/lib/recommended'
import { modalFooter, secondaryButton, labelClass, fieldClass, rowButton, badge, chip } from '@/lib/controlStyles'
import Modal from '@/components/ui/Modal'
import ErrorBanner from '@/components/ui/ErrorBanner'
import SupplierBadge from '@/components/ui/SupplierBadge'

// The versions of one product: what can be bought for it, from whom, under
// which codes, where each stands on the Recommended list, and where each is
// kept.
//
// What the brand recommends is changed on the Recommended list now, by owners
// and the super admin (his decisions of 18 and 19 October 2026), so here it
// is only said. Anybody who manages a restaurant still says where a version
// is kept, which is where the stock take lists it.
//
// A version starts when a restaurant prices a supplier's code this product has
// not had, so Add a price is how a store manager adds one.
export default function VersionsModal({
    product, versions, suppliers, boughtHere, keepsTheList, onClose, onChanged, onAddPrice,
}) {
    const [error, setError] = useState('')
    const [busy, setBusy] = useState('')
    const [codes, setCodes] = useState({})
    const groups = groupsOf(product, versions)
    const mine = [...groups.set, ...groups.fallbacks, ...groups.others, ...groups.off]
    const supplierName = id => (suppliers || []).find(s => s.id === id)?.name || ''
    const ids = mine.map(v => v.id).join(',')

    // The other codes each version goes by, beside its own.
    useEffect(() => {
        if (!ids) return
        let live = true
        supabase.from('version_codes').select('version_id, code').in('version_id', ids.split(',')).order('code')
            .then(({ data }) => {
                if (!live || !data) return
                const byVersion = {}
                for (const c of data) byVersion[c.version_id] = [...(byVersion[c.version_id] || []), c.code]
                setCodes(byVersion)
            })
        return () => { live = false }
    }, [ids])

    // Busy until the page has read the versions again, so a second tap works
    // from what the first one saved rather than from what was there before.
    async function keep(key, patch, id) {
        setBusy(key)
        setError('')
        const { error: e1 } = await supabase.from('product_versions').update(patch).eq('id', id)
        if (e1) { setBusy(''); setError(friendlyError(e1)); return }
        await onChanged?.()
        setBusy('')
    }

    return (
        <Modal title={`Versions of ${product.name}`} onClose={onClose} width="max-w-2xl">
            <div className="px-6 py-4 space-y-4">
                <ErrorBanner>{error}</ErrorBanner>

                <div className="rounded-lg bg-app-bg border border-border p-3 text-sm text-gray-700">
                    <p>
                        {product.recommends === 'any'
                            ? 'The brand recommends any version of this product.'
                            : 'What the brand recommends is kept on the Recommended list, the same for every restaurant.'}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                        <Link
                            to={keepsTheList ? `/catalogue/recommended?product=${product.id}` : '/catalogue/recommended'}
                            className={rowButton('edit')}
                        >
                            {keepsTheList ? 'Change on the Recommended list' : 'See the Recommended list'}
                        </Link>
                    </div>
                </div>

                <div className="rounded-lg bg-app-bg border border-border p-3 text-sm text-gray-700">
                    <p>
                        A version is added when a price is saved with a supplier and code this product has
                        not had. Each version is kept in the same place at every restaurant that buys it.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                        <button type="button" onClick={onAddPrice} className={rowButton('edit')}>
                            Add a price
                        </button>
                    </div>
                </div>

                {mine.length === 0 && (
                    <p className="text-sm text-muted">
                        No versions yet. One starts the first time a restaurant prices it from a supplier.
                    </p>
                )}

                <ul className="space-y-3">
                    {mine.map(v => {
                        const section = v.section || product.section
                        const alsoIn = v.also_in ?? product.also_in ?? []
                        const standing = standingOf(v, product, versions)
                        const everyCode = [v.supplier_code, ...(codes[v.id] || [])].filter(Boolean)
                        return (
                            <li key={v.id} className="border border-border rounded-lg p-3">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-gray-900 break-words">
                                            {versionLabel(v, product)}
                                        </p>
                                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted mt-1">
                                            <SupplierBadge name={supplierName(v.supplier_id)} />
                                            {everyCode.length > 0 && <span>code {everyCode.join(', ')}</span>}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {standing?.tone === 'recommended' && (
                                            <span className={`${badge} bg-green-100 text-green-800`}>Recommended</span>
                                        )}
                                        {standing?.tone === 'fallback' && (
                                            <span className={`${badge} bg-blue-50 text-blue-800`}>{standing.label}</span>
                                        )}
                                        {boughtHere.has(v.id) && (
                                            <span className={`${badge} bg-gray-100 text-gray-700`}>Bought here</span>
                                        )}
                                        {!v.is_active && (
                                            <span className={`${badge} bg-red-100 text-red-800`}>Switched off</span>
                                        )}
                                    </div>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)] mt-3">
                                    <div>
                                        <label className={labelClass} htmlFor={`kept-${v.id}`}>Kept in</label>
                                        <select
                                            id={`kept-${v.id}`}
                                            value={section}
                                            disabled={!!busy}
                                            onChange={e => keep(`section-${v.id}`, {
                                                section: e.target.value,
                                                also_in: alsoIn.filter(place => place !== e.target.value),
                                            }, v.id)}
                                            className={fieldClass}
                                        >
                                            {PLACES.map(place => <option key={place} value={place}>{place}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <p className={labelClass}>Also kept in</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {PLACES.filter(place => place !== section).map(place => {
                                                const on = alsoIn.includes(place)
                                                return (
                                                    <button
                                                        key={place}
                                                        type="button"
                                                        aria-pressed={on}
                                                        disabled={!!busy}
                                                        onClick={() => keep(`also-${v.id}`, {
                                                            section,
                                                            also_in: on ? alsoIn.filter(x => x !== place) : [...alsoIn, place],
                                                        }, v.id)}
                                                        className={chip(on)}
                                                    >
                                                        {place}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </li>
                        )
                    })}
                </ul>
            </div>

            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>Done</button>
            </div>
        </Modal>
    )
}
