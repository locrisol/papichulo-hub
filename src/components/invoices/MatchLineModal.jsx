import { useMemo, useState } from 'react'
import Modal from '@/components/ui/Modal'
import ProductSelect from '@/components/ui/ProductSelect'
import SupplierBadge from '@/components/ui/SupplierBadge'
import useSignedUrls from '@/components/ui/useSignedUrls'
import { numberField } from '@/lib/numberInput'
import { fmtMoney, num } from '@/lib/format'
import { suggestProducts } from '@/lib/suggestProducts'
import { VERSION_PICTURES } from '@/lib/photo'
import {
    modalFooter, secondaryButton, primaryButton, labelClass, fieldClass, hintClass,
    captionClass, badge,
} from '@/lib/controlStyles'

// Saying which product a supplier code means.
//
// The code is the key, so this is answered once and every future document
// carrying that code is matched without anybody being asked again.
//
// **How many units are in a case is the question the invoice cannot answer.**
// "4X2.5 KG" is ten kilos and it is also four bags, and which of those belongs
// in units_per_case depends on how the product itself is counted. Getting it
// wrong quietly moves the cost of every dish the product goes into, which is
// why the division is shown as it is typed, exactly as the product form does.
//
// Without `withPack` there is no line, only something asked for from
// Products, so it asks for the product alone.
//
// The brand's `versions` (readVersions) give the suggestions above the
// search: the same code first, then the ones that read the same, each with
// its picture (his decision of 19 October 2026). Picking one is picking its
// product in the search, and the answer carries the version as well.
export default function MatchLineModal({ row, products, versions = [], onClose, onMatch, withPack = true }) {
    const line = row.line
    const [productId, setProductId] = useState('')
    // The suggestion picked, until another product is chosen in the search.
    const [versionId, setVersionId] = useState(null)
    const [perPack, setPerPack] = useState(
        row.wantedUnits != null ? String(row.wantedUnits) : '',
    )
    const [busy, setBusy] = useState(false)

    const suggestions = useMemo(
        () => suggestProducts(line, { supplierId: row.supplierId, products, versions }),
        [line, row.supplierId, products, versions],
    )

    const product = (products || []).find(p => p.id === productId) || null
    const units = num(perPack)
    const perUnit = units > 0 ? num(line.price_per_case) / units : null

    async function go() {
        setBusy(true)
        await onMatch({ productId, unitsPerCase: units, versionId })
        setBusy(false)
    }

    return (
        <Modal title="Which product is this?" onClose={onClose} width="max-w-lg">
            <div className="px-6 py-4">
                <p className={captionClass}>{withPack ? 'On the invoice' : 'Asked for'}</p>
                <p className="text-sm font-bold text-gray-900 mt-1">{line.description}</p>
                {withPack ? (
                    <p className="text-xs text-muted mb-4">
                        Code {line.code}
                        {line.pack_size ? `, ${line.pack_size}` : ''}, {fmtMoney(line.price_per_case)} a
                        case
                    </p>
                ) : <div className="mb-4" />}

                <Suggestions
                    list={suggestions}
                    picked={versionId}
                    onPick={s => { setProductId(s.product.id); setVersionId(s.version.id) }}
                />

                <label className={labelClass} htmlFor="match-product">Product</label>
                <ProductSelect
                    value={productId}
                    onChange={id => { setProductId(id); setVersionId(null) }}
                    products={products}
                    placeholder="Search the catalogue..."
                />
                {withPack && (
                    <p className={hintClass}>
                        Answered once. Every document that carries code {line.code} matches itself after
                        this.
                    </p>
                )}

                {withPack && <div className="mt-4">
                    <label className={labelClass} htmlFor="match-units">
                        How many {product?.unit || 'units'} in a case
                    </label>
                    <input
                        id="match-units"
                        {...numberField({ value: perPack, onChange: setPerPack, decimals: 3 })}
                        className={fieldClass}
                    />
                    <p className={hintClass}>
                        {line.pack_size
                            ? `The invoice says ${line.pack_size}.`
                            : 'The invoice does not say, so enter it yourself.'}
                        {perUnit != null && (
                            <> That makes it {fmtMoney(perUnit)} a {product?.unit || 'unit'}.</>
                        )}
                    </p>
                </div>}
            </div>

            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                <button
                    type="button"
                    disabled={!productId || (withPack && !(units > 0)) || busy}
                    onClick={go}
                    className={primaryButton('md', 'good')}
                >
                    {busy ? 'Matching...' : 'Match'}
                </button>
            </div>
        </Modal>
    )
}

// The suggestions, best first, each one a button. Their first pictures are
// asked for in one go, and only for the few shown.
function Suggestions({ list, picked, onPick }) {
    const urls = useSignedUrls(list.map(s => s.picture).filter(Boolean), VERSION_PICTURES)
    if (!list.length) return null

    return (
        <div className="mb-4">
            <p className={labelClass}>Suggested</p>
            <ul className="space-y-2">
                {list.map(s => {
                    const on = picked === s.version.id
                    const ownName = s.version.name && s.version.name !== s.product.name ? s.version.name : null
                    return (
                        <li key={s.version.id}>
                            <button
                                type="button"
                                aria-pressed={on}
                                onClick={() => onPick(s)}
                                className={'w-full text-left flex items-start gap-3 p-2 rounded-lg border transition-colors '
                                    + 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent '
                                    + (on ? 'border-accent bg-accent-light' : 'border-border bg-white hover:bg-gray-50')}
                            >
                                <Thumb url={s.picture ? urls[s.picture] : null} hasPicture={!!s.picture} />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-bold text-gray-900 break-words">{s.product.name}</span>
                                    {ownName && <span className="block text-xs text-gray-700 break-words">{ownName}</span>}
                                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-muted">
                                        <SupplierBadge name={s.version.supplierName} />
                                        {s.code && <span className="tabular-nums">code {s.code}</span>}
                                        {s.exact && <span className={`${badge} bg-gray-100 text-gray-700`}>Same code</span>}
                                        {s.recommended && <span className={`${badge} bg-green-100 text-green-800`}>Recommended</span>}
                                    </span>
                                </span>
                            </button>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}

// A version's first picture, small. The words beside it say what it is, so
// the picture says nothing to a screen reader.
function Thumb({ url, hasPicture }) {
    const box = 'w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden'
    if (!hasPicture) {
        return (
            <span className={`${box} border border-dashed border-gray-300 bg-gray-50 grid place-items-center p-1 text-center text-xs leading-tight text-muted`}>
                No picture
            </span>
        )
    }
    return (
        <span className={`${box} border border-border bg-gray-100`}>
            {url && <img src={url} alt="" className="block w-full h-full object-cover" />}
        </span>
    )
}
