import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useConfirm } from '@/context/confirm'
import { friendlyError } from '@/lib/errors'
import { versionLabel } from '@/lib/brandVersions'
import { groupsOf, standingOf } from '@/lib/recommended'
import { modalFooter, secondaryButton, rowButton, badge } from '@/lib/controlStyles'
import Modal from '@/components/ui/Modal'
import SupplierBadge from '@/components/ui/SupplierBadge'
import ErrorBanner from '@/components/ui/ErrorBanner'
import Notice from '@/components/ui/Notice'

// The versions of one product: what can be bought for it, from whom, under
// which codes, and where each stands on the Recommended list.
//
// What the brand recommends is changed on the Recommended list now, by owners
// and the super admin (his decisions of 18 and 19 October 2026), so here it
// is only said. Where a restaurant keeps the product is its own, set on the
// product form or its Prices page, and nothing to do with versions.
//
// A version starts when a restaurant prices a supplier's code this product has
// not had, so Add a price is how a store manager adds one.
//
// **Two that are one thing are joined here by an owner** (21 October 2026):
// two codes from one supplier started apart, so their allergens, pictures
// and place on the list are said twice. The one pressed joins the one picked
// (merge_versions), which keeps its own words and takes the other's codes,
// prices and pictures.
export default function VersionsModal({
    product, versions, suppliers, boughtHere, keepsTheList, onClose, onAddPrice, onJoined = () => {},
}) {
    const confirm = useConfirm()
    const [codes, setCodes] = useState({})
    // The version whose Same thing as was pressed, the join under way, and
    // what to say about it.
    const [joining, setJoining] = useState(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [said, setSaid] = useState('')
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

    const named = v => {
        const every = [v.supplier_code, ...(codes[v.id] || [])].filter(Boolean)
        return every.length ? `${versionLabel(v, product)} (${every.join(', ')})` : versionLabel(v, product)
    }
    const sameSupplier = v => mine.filter(o => o.id !== v.id && o.supplier_id === v.supplier_id)

    async function join(fold, keep) {
        const ok = await confirm({
            title: 'Join these two versions?',
            message: `${named(fold)} joins ${named(keep)} and they are one version from now on, at every restaurant. This cannot be undone.`,
            details: [
                { label: 'Codes', value: 'Both, on the one version' },
                { label: 'Prices', value: 'Each restaurant keeps its price for each code' },
                { label: 'Allergens', value: `Those of ${named(keep)}, or of the other if it has none` },
                { label: 'Pictures', value: 'Both, up to four' },
                { label: 'Recommended list', value: `Where ${named(keep)} is now` },
            ],
            confirmLabel: 'Join them',
        })
        if (!ok) return
        setBusy(true)
        setError('')
        const { error: failed } = await supabase.rpc('merge_versions', { keep: keep.id, fold: fold.id })
        setBusy(false)
        if (failed) { setError(friendlyError(failed)); return }
        setJoining(null)
        setSaid(`${named(fold)} is part of ${versionLabel(keep, product)} now.`)
        onJoined()
    }

    return (
        <Modal title={`Versions of ${product.name}`} onClose={onClose} width="max-w-2xl">
            <div className="px-6 py-4 space-y-4">
                {error && <ErrorBanner>{error}</ErrorBanner>}
                {said && <Notice tone="good">{said}</Notice>}

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
                        not had.
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

                                {keepsTheList && sameSupplier(v).length > 0 && joining !== v.id && (
                                    <div className="mt-2">
                                        <button type="button" onClick={() => { setJoining(v.id); setSaid('') }} className={rowButton()}>
                                            Same thing as another version
                                        </button>
                                    </div>
                                )}
                                {joining === v.id && (
                                    <div className="mt-3 rounded-lg border border-border bg-app-bg p-3">
                                        <p className="text-sm text-gray-900">
                                            Which one is it the same thing as? This one joins it.
                                        </p>
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {sameSupplier(v).map(o => (
                                                <button
                                                    key={o.id}
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => join(v, o)}
                                                    className={`${rowButton('edit')} disabled:opacity-50`}
                                                >
                                                    {named(o)}
                                                </button>
                                            ))}
                                            <button type="button" onClick={() => setJoining(null)} className={rowButton()}>
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
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
