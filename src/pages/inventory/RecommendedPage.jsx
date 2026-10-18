import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, everyRow } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useRestaurant } from '@/context/restaurant'
import { can, BRAND_CHOICES } from '@/lib/access'
import { friendlyError } from '@/lib/errors'
import { shortDate } from '@/lib/dates'
import { declaresAllergens } from '@/lib/products'
import { VERSION_PICTURES } from '@/lib/photo'
import { badge, captionClass, card, cardHeader, rowButton } from '@/lib/controlStyles'
import {
    alsoBought, bySection, countedIn, groupsOf, matchesSearch, namedWithCode, ownPrice, priceWords,
    purchasesByVersion, setHeading, standingOf,
} from '@/lib/recommended'
import ErrorBanner from '@/components/ui/ErrorBanner'
import Notice from '@/components/ui/Notice'
import PageHeader from '@/components/ui/PageHeader'
import SearchBox from '@/components/ui/SearchBox'
import SupplierBadge from '@/components/ui/SupplierBadge'
import useSignedUrls from '@/components/ui/useSignedUrls'
import VersionPicture from '@/components/inventory/VersionPicture'
import RecommendedEditor from '@/components/inventory/RecommendedEditor'

// The Recommended list: what every restaurant should buy for each product,
// one list for the whole brand. His decisions of 18 and 19 October 2026.
//
// Owners and the super admin change it, through Edit on each product. Store
// managers read it. The prices, and when each version was last on an
// invoice, are the restaurant's that is open, since those are per
// restaurant; the list itself is the same everywhere.
//
// Nothing here changes what recipes cost from or what the weekly report
// says yet. Those follow the list in later steps of the same plan.
export default function RecommendedPage() {
    const { user } = useAuth()
    const { activeRestaurant } = useRestaurant()
    const keepsTheList = can(user, BRAND_CHOICES)
    const [params, setParams] = useSearchParams()
    const [list, setList] = useState(null)
    const [error, setError] = useState('')
    const [search, setSearch] = useState('')
    const [editing, setEditing] = useState(null)

    const load = useCallback(async () => {
        const [brand, here] = await Promise.all([readBrand(), readHere(activeRestaurant?.id)])
        const failed = brand.error || here.error
        if (failed) { setError(failed); return }
        setError('')
        setList({ ...brand, ...here })
    }, [activeRestaurant?.id])

    // After a change on the list, only the list is read again. The prices
    // and deliveries cannot have moved, and reading every invoice line on
    // each tap would make each tap slower as the invoices grow.
    const reloadList = useCallback(async () => {
        const brand = await readBrand()
        if (brand.error) { setError(brand.error); return }
        setError('')
        setList(was => ({ ...was, ...brand }))
    }, [])

    useEffect(() => {
        // Reading sets the list when it arrives, and a change of restaurant
        // has to read that restaurant's prices again.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load()
    }, [load])

    // Opened from a product's Versions with "Change on the Recommended
    // list": straight into that product, for somebody who may change it.
    const asked = params.get('product')
    useEffect(() => {
        if (!asked || !list || !keepsTheList) return
        if (list.products.some(p => p.id === asked)) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setEditing(asked)
        }
        setParams({}, { replace: true })
    }, [asked, list, keepsTheList, setParams])

    const supplierName = useCallback(id => list?.suppliers.find(s => s.id === id)?.name || '', [list])

    const shown = useMemo(() => {
        if (!list) return []
        const wanted = list.products.filter(p => matchesSearch(p, list.versions, supplierName, search))
        return bySection(wanted)
    }, [list, search, supplierName])

    // The first picture of every version, signed in one request.
    const firstPictures = useMemo(
        () => (list ? [...list.pictures.values()].map(paths => paths[0]).filter(Boolean) : []),
        [list],
    )
    const firstUrls = useSignedUrls(firstPictures, VERSION_PICTURES)

    const editingProduct = editing && list?.products.find(p => p.id === editing)

    return (
        <div>
            <PageHeader
                title="Recommended list"
                subtitle={`What every restaurant buys. Prices and dates are from ${activeRestaurant?.name || 'this restaurant'}.`}
            />

            {!keepsTheList && (
                <Notice tone="info" className="mb-4">
                    Only the owners change this list. If something you need is not on it, use Request a product on Products.
                </Notice>
            )}
            <ErrorBanner className="mb-4">{error}</ErrorBanner>

            <SearchBox value={search} onChange={setSearch} placeholder="Search the list" className="w-full mb-4" />

            {!list && !error && <p className="text-sm text-muted">Loading the list...</p>}
            {list && shown.length === 0 && (
                <p className="text-sm text-muted">{search ? 'Nothing on the list matches that.' : 'There are no products yet.'}</p>
            )}

            {shown.map(group => (
                <section key={group.section} className={`${card} overflow-hidden mb-5`}>
                    <h2 className={cardHeader}>{group.section}</h2>
                    <ul className="divide-y divide-border">
                        {group.products.map(product => (
                            <ProductOnList
                                key={product.id}
                                product={product}
                                list={list}
                                supplierName={supplierName}
                                firstUrls={firstUrls}
                                onEdit={keepsTheList ? () => setEditing(product.id) : null}
                            />
                        ))}
                    </ul>
                </section>
            ))}

            {editingProduct && (
                <RecommendedEditor
                    product={editingProduct}
                    list={list}
                    supplierName={supplierName}
                    userId={user?.id}
                    onClose={() => setEditing(null)}
                    onChanged={reloadList}
                />
            )}
        </div>
    )
}

// The list itself, the same for every restaurant: the products, their
// versions with the other codes they go by, the suppliers and the pictures.
async function readBrand() {
    const [products, versions, suppliers, pictures, codes] = await Promise.all([
        everyRow(() => supabase.from('products')
            .select('id, name, section, unit, category, is_mix, is_active, recommends')
            .order('id')),
        everyRow(() => supabase.from('product_versions')
            .select('id, product_id, supplier_id, supplier_code, name, is_recommended, is_active, fallback_rank, notes, description')
            .order('id')),
        supabase.from('suppliers').select('id, name, is_active, works_without_codes').order('name'),
        everyRow(() => supabase.from('version_pictures').select('id, version_id, path, sort_order').order('id')),
        everyRow(() => supabase.from('version_codes').select('id, version_id, code').order('id')),
    ])
    const failed = [products, versions, suppliers, pictures, codes].find(r => r.error)
    if (failed) return { error: friendlyError(failed.error) }

    const codesOf = new Map()
    for (const c of codes.data) codesOf.set(c.version_id, [...(codesOf.get(c.version_id) || []), c.code])
    const picturesOf = new Map()
    for (const p of [...pictures.data].sort((a, b) => a.sort_order - b.sort_order)) {
        picturesOf.set(p.version_id, [...(picturesOf.get(p.version_id) || []), p.path])
    }
    return {
        products: products.data,
        versions: versions.data.map(v => ({ ...v, codes: codesOf.get(v.id) || [] })),
        suppliers: suppliers.data || [],
        pictures: picturesOf,
    }
}

// What the open restaurant pays and when it was delivered, and which
// versions have their allergens answered.
async function readHere(restaurantId) {
    const [answers, prices, lines] = await Promise.all([
        everyRow(() => supabase.from('version_allergens').select('version_id').order('version_id')),
        restaurantId
            ? everyRow(() => supabase.from('product_supplier_prices')
                .select('id, product_id, version_id, purchase_type, price_per_case, units_per_case, price_per_unit, is_preferred, priced_at')
                .eq('restaurant_id', restaurantId)
                .order('id'))
            : { data: [] },
        // Lines on invoices, not credit notes, and not set aside as not stock.
        restaurantId
            ? everyRow(() => supabase.from('invoice_lines')
                .select('price_id, invoice_id, invoices!inner(invoice_date, document_type, restaurant_id)')
                .not('price_id', 'is', null)
                .eq('invoices.restaurant_id', restaurantId)
                .eq('invoices.document_type', 'invoice')
                .or('decision.is.null,decision.neq.ignored')
                .order('id'))
            : { data: [] },
    ])
    const failed = [answers, prices, lines].find(r => r.error)
    if (failed) return { error: friendlyError(failed.error) }

    const delivered = lines.data.map(l => ({
        price_id: l.price_id, invoice_id: l.invoice_id, invoice_date: l.invoices?.invoice_date,
    }))

    return {
        answered: new Set(answers.data.map(a => a.version_id)),
        prices: prices.data,
        purchases: purchasesByVersion(delivered, prices.data),
    }
}

// One product on the list: its recommended versions, its fallbacks, and a
// line each for what else is bought here and what is switched off.
function ProductOnList({ product, list, supplierName, firstUrls, onEdit }) {
    const groups = groupsOf(product, list.versions)
    const also = alsoBought(product, list.versions, list.prices)
    const tile = version => (
        <VersionTile
            key={version.id}
            version={version}
            product={product}
            list={list}
            supplierName={supplierName}
            firstUrl={firstUrls[(list.pictures.get(version.id) || [])[0]]}
        />
    )

    return (
        <li className="p-4 sm:px-5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-base font-bold text-gray-900 break-words">{product.name}</h3>
                    <p className="text-xs text-muted">{countedIn(product.unit)}</p>
                </div>
                {onEdit && (
                    <button type="button" onClick={onEdit} className={rowButton('edit')} aria-label={`Edit ${product.name}`}>
                        Edit
                    </button>
                )}
            </div>

            {product.recommends === 'any' && (
                <p className="text-sm text-gray-700 mt-2">No recommendation. Any version is fine.</p>
            )}
            {product.recommends !== 'any' && groups.set.length === 0 && (
                <p className="text-sm text-gray-700 mt-2">Nothing recommended yet.</p>
            )}

            {groups.set.length > 0 && (
                <div className="mt-3">
                    <p className={captionClass}>{setHeading(groups.set)}</p>
                    <ul className="divide-y divide-border">{groups.set.map(tile)}</ul>
                    {groups.set.length > 1 && (
                        <p className="text-xs text-muted">All equally fine, bought depending on stock.</p>
                    )}
                </div>
            )}

            {groups.fallbacks.length > 0 && (
                <div className="mt-3">
                    <p className={captionClass}>If those are out</p>
                    <ul className="divide-y divide-border">{groups.fallbacks.map(tile)}</ul>
                </div>
            )}

            {also.length > 0 && (
                <p className="text-xs text-muted mt-2">
                    Also bought, not on the list: {also.map(v => namedWithCode(v, product, supplierName(v.supplier_id))).join(', ')}
                </p>
            )}
            {groups.off.length > 0 && (
                <p className="text-xs text-muted mt-1">
                    {groups.off.length === 1 ? '1 version switched off' : `${groups.off.length} versions switched off`}
                </p>
            )}
        </li>
    )
}

// A version as the list shows it: its picture, its name, who sells it under
// which code, what it costs here and when it was last delivered, and what
// the owners wrote about it.
function VersionTile({ version, product, list, supplierName, firstUrl }) {
    const name = version.name || product.name
    const standing = standingOf(version, product, list.versions)
    const price = ownPrice(version.id, list.prices)
    const bought = list.purchases.get(version.id)
    const unanswered = declaresAllergens(product) && !list.answered.has(version.id)

    return (
        <li className="flex gap-3 py-3">
            <VersionPicture paths={list.pictures.get(version.id) || []} url={firstUrl} name={name} />
            <div className="min-w-0 flex-1">
                {standing?.tone === 'fallback' && (
                    <span className={`${badge} bg-blue-50 text-blue-800 mb-1`}>{standing.label}</span>
                )}
                <p className="text-sm font-semibold text-gray-900 break-words">{name}</p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-muted">
                    <SupplierBadge name={supplierName(version.supplier_id)} />
                    {[version.supplier_code, ...version.codes].filter(Boolean).length > 0 && (
                        <span>code {[version.supplier_code, ...version.codes].filter(Boolean).join(', ')}</span>
                    )}
                </p>
                <p className="text-xs text-gray-700 mt-1">
                    {price ? priceWords(price, product.unit) : 'Not bought here yet.'}
                    {bought?.last && <span className="text-muted"> · last on an invoice {shortDate(bought.last)}</span>}
                </p>
                {version.description && <p className="text-xs text-gray-700 mt-1 break-words">{version.description}</p>}
                {version.notes && <p className="text-xs text-gray-700 italic mt-1 whitespace-pre-line break-words">{version.notes}</p>}
                {unanswered && (
                    <Link
                        to={`/catalogue/products/${product.id}/allergens`}
                        className={`${badge} bg-red-600 text-white mt-1.5 hover:bg-red-700`}
                    >
                        Allergens not entered
                    </Link>
                )}
            </div>
        </li>
    )
}
