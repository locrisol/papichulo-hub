import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import ProductSelect from '@/components/ui/ProductSelect'
import { numberField } from '@/lib/numberInput'
import { fmtMoney, fmtUnitCost, num } from '@/lib/format'
import {
    modalFooter, secondaryButton, primaryButton, labelClass, fieldClass, hintClass,
    captionClass,
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
export default function MatchLineModal({ row, products, onClose, onMatch }) {
    const line = row.line
    const [productId, setProductId] = useState('')
    const [perPack, setPerPack] = useState(
        row.wantedUnits != null ? String(row.wantedUnits) : '',
    )
    const [busy, setBusy] = useState(false)

    const product = (products || []).find(p => p.id === productId) || null
    const units = num(perPack)
    const perUnit = units > 0 ? num(line.price_per_case) / units : null

    async function go() {
        setBusy(true)
        await onMatch({ productId, unitsPerCase: units })
        setBusy(false)
    }

    return (
        <Modal title="Which product is this?" onClose={onClose} width="max-w-lg">
            <div className="px-6 py-4">
                <p className={captionClass}>On the invoice</p>
                <p className="text-sm font-bold text-gray-900 mt-1">{line.description}</p>
                <p className="text-xs text-muted mb-4">
                    Code {line.code}
                    {line.pack_size ? `, ${line.pack_size}` : ''}, {fmtMoney(line.price_per_case)} a
                    case
                </p>

                <label className={labelClass} htmlFor="match-product">Product</label>
                <ProductSelect
                    value={productId}
                    onChange={setProductId}
                    products={products}
                    placeholder="Search the catalogue..."
                />
                <p className={hintClass}>
                    Answered once. Every document that carries code {line.code} matches itself after
                    this.
                </p>

                <div className="mt-4">
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
                            ? `The paper says ${line.pack_size}.`
                            : 'The paper does not say, so this one is yours.'}
                        {perUnit != null && (
                            <> That makes it {fmtUnitCost(perUnit)} a {product?.unit || 'unit'}.</>
                        )}
                    </p>
                </div>
            </div>

            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                <button
                    type="button"
                    disabled={!productId || !(units > 0) || busy}
                    onClick={go}
                    className={primaryButton('md', 'good')}
                >
                    {busy ? 'Matching...' : 'That is the one'}
                </button>
            </div>
        </Modal>
    )
}
